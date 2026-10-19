import type { RealtimeEvent } from '../../../shared/realtime'
import type { PiperVoice, RealtimeTranscriptionModel } from '../../../shared/realtime'
import { SentenceBuffer, float32ToInt16, int16ToBase64, int16ToFloat32, isLikelyHallucination, speakable, wavFromFloat32 } from './audio-text'
import type { RealtimeSession } from './gemini-live'
import { transcribe } from './groq'
import { PIPER_VOICES } from './settings'

const SAMPLE_RATE = 16000
const WINDOW = 512

// sherpa-onnx-node é addon nativo: require dinâmico impede o bundler de tentar empacotá-lo.
const nativeRequire = (name: string) => require(require.resolve(name))

type Sherpa = {
  Vad: new (config: Record<string, unknown>, seconds: number) => { acceptWaveform(samples: Float32Array): void; isEmpty(): boolean; isDetected(): boolean; front(enableExternalBuffer?: boolean): { samples: Float32Array }; pop(): void; flush(): void }
  CircularBuffer: new (capacity: number) => { push(samples: Float32Array): void; size(): number; head(): number; get(start: number, n: number, enableExternalBuffer?: boolean): Float32Array; pop(n: number): void }
  OfflineTts: { createAsync(config: Record<string, unknown>): Promise<{ sampleRate: number; generateAsync(request: Record<string, unknown>): Promise<{ samples: Float32Array; sampleRate: number }> }> }
  OfflineRecognizer: { createAsync(config: Record<string, unknown>): Promise<{ createStream(): { acceptWaveform(waveform: { samples: Float32Array; sampleRate: number }): void }; decodeAsync(stream: unknown): Promise<{ text: string }> }> }
}

let ttsCache: { dir: string; tts: Awaited<ReturnType<Sherpa['OfflineTts']['createAsync']>> } | null = null

/** Carrega a voz Piper uma vez por execução do app (~3 s); as ligações seguintes já começam prontas. */
export async function loadPiper(dir: string, voice: PiperVoice = 'faber') {
  if (ttsCache?.dir === dir) return ttsCache.tts
  const sherpa = nativeRequire('sherpa-onnx-node') as Sherpa
  const tts = await sherpa.OfflineTts.createAsync({ model: { vits: { model: `${dir}/${PIPER_VOICES[voice].model}`, tokens: `${dir}/tokens.txt`, dataDir: `${dir}/espeak-ng-data` }, numThreads: 2, provider: 'cpu' }, maxNumSentences: 1 })
  ttsCache = { dir, tts }
  return tts
}

let parakeetCache: { dir: string; recognizer: Awaited<ReturnType<Sherpa['OfflineRecognizer']['createAsync']>> } | null = null
async function loadParakeet(dir: string) {
  if (parakeetCache?.dir === dir) return parakeetCache.recognizer
  const sherpa = nativeRequire('sherpa-onnx-node') as Sherpa
  const recognizer = await sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: `${dir}/encoder.int8.onnx`, decoder: `${dir}/decoder.int8.onnx`, joiner: `${dir}/joiner.int8.onnx` },
      tokens: `${dir}/tokens.txt`, numThreads: 2, provider: 'cpu', modelType: 'nemo_transducer', modelingUnit: 'cjkchar',
    },
    decodingMethod: 'greedy_search',
  })
  parakeetCache = { dir, recognizer }
  return recognizer
}

/**
 * Modo com agente: VAD e Piper locais; ASR pode ser local ou Groq; o runtime do agente selecionado responde.
 */
export async function openFreeCascade(options: {
  groqKey?: string; transcriptionModel?: RealtimeTranscriptionModel; parakeetDir?: string; vadPath: string; piperDir: string; piperVoice?: PiperVoice
  generateResponse: (text: string, signal: AbortSignal) => Promise<string>; emit: (event: RealtimeEvent) => void
}): Promise<RealtimeSession> {
  const { groqKey, transcriptionModel = 'whisper-large-v3-turbo', parakeetDir = '', vadPath, piperDir, piperVoice = 'faber', generateResponse, emit } = options
  const sherpa = nativeRequire('sherpa-onnx-node') as Sherpa
  const tts = await loadPiper(piperDir, piperVoice)
  const parakeet = transcriptionModel === 'parakeet-v3' ? await loadParakeet(parakeetDir) : null
  const vad = new sherpa.Vad({ sileroVad: { model: vadPath, threshold: 0.5, minSilenceDuration: 0.55, minSpeechDuration: 0.25, maxSpeechDuration: 25, windowSize: WINDOW }, sampleRate: SAMPLE_RATE, numThreads: 1, provider: 'cpu', debug: false }, 30)
  const buffer = new sherpa.CircularBuffer(SAMPLE_RATE * 30)
  let turn: AbortController | null = null
  let speaking = false
  let closed = false
  let queue = Promise.resolve()

  emit({ type: 'phase', phase: 'listening' })

  // Corta a resposta em andamento e o áudio que ainda toca no renderer, mesmo de um turno já concluído.
  const stopTurn = () => {
    if (turn) { turn.abort(); turn = null }
    if (speaking) { speaking = false; emit({ type: 'interrupted' }) }
  }

  const speak = (sentence: string, signal: AbortSignal) => {
    const text = speakable(sentence)
    if (!text) return
    // Fila: gera a próxima frase enquanto a anterior ainda toca no renderer.
    queue = queue.then(async () => {
      if (signal.aborted) return
      // O addon nativo do Sherpa retorna buffers externos por padrão. No Electron,
      // isso pode falhar ao resolver a Promise de geração ("TTS settlement failed").
      const audio = await tts.generateAsync({ text, sid: 0, speed: 1.05, enableExternalBuffer: false })
      if (signal.aborted) return
      speaking = true
      emit({ type: 'phase', phase: 'speaking' })
      emit({ type: 'audio', data: int16ToBase64(float32ToInt16(audio.samples)), sampleRate: audio.sampleRate })
    }).catch(error => { if (!signal.aborted) emit({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao gerar a voz.' }) })
  }

  async function respond(signal: AbortSignal, userText: string) {
    emit({ type: 'phase', phase: 'thinking' })
    const answer = (await generateResponse(userText, signal)).trim()
    if (answer && !signal.aborted) {
      emit({ type: 'transcript', role: 'agent', text: answer, final: true })
      const sentences = new SentenceBuffer()
      for (const sentence of sentences.push(answer)) speak(sentence, signal)
      for (const sentence of sentences.flush()) speak(sentence, signal)
    }
    await queue
    if (!signal.aborted) emit({ type: 'phase', phase: 'listening' })
  }

  async function handleSpeech(samples: Float32Array) {
    const seconds = samples.length / SAMPLE_RATE
    const controller = new AbortController()
    turn = controller
    try {
      emit({ type: 'phase', phase: 'transcribing' })
      let text: string
      if (parakeet) {
        const stream = parakeet.createStream()
        stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE })
        text = (await parakeet.decodeAsync(stream)).text.trim()
      } else {
        if (!groqKey) throw new Error('Cadastre a chave Groq para transcrever com Whisper ou selecione o Parakeet local.')
        text = await transcribe(groqKey, wavFromFloat32(samples, SAMPLE_RATE), controller.signal, transcriptionModel)
      }
      if (controller.signal.aborted) return
      if (isLikelyHallucination(text, seconds)) { emit({ type: 'phase', phase: 'listening' }); return }
      emit({ type: 'transcript', role: 'user', text, final: true })
      await respond(controller.signal, text)
    } catch (error) {
      if (!controller.signal.aborted) { emit({ type: 'error', message: error instanceof Error ? error.message : 'Falha na conversa por voz.' }); emit({ type: 'phase', phase: 'listening' }) }
    } finally { if (turn === controller) turn = null }
  }

  let wasDetected = false
  return {
    pushAudio(pcm16) {
      if (closed) return
      buffer.push(int16ToFloat32(pcm16))
      while (buffer.size() >= WINDOW) {
        // O addon do Electron não permite ArrayBuffers externos; peça um Float32Array copiado.
        vad.acceptWaveform(buffer.get(buffer.head(), WINDOW, false))
        buffer.pop(WINDOW)
      }
      const detected = vad.isDetected()
      if (detected && !wasDetected) {
        // Voz nova do usuário: interrompe a resposta em andamento (barge-in) e mostra que está ouvindo.
        stopTurn()
        emit({ type: 'phase', phase: 'hearing' })
      }
      wasDetected = detected
      while (!vad.isEmpty()) {
        // front() também pede buffers externos por padrão; no addon empacotado isso lança exceção.
        const segment = vad.front(false).samples
        vad.pop()
        void handleSpeech(Float32Array.from(segment))
      }
    },
    interrupt() { stopTurn(); emit({ type: 'phase', phase: 'listening' }) },
    close() { closed = true; stopTurn() },
  }
}
