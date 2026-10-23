import { app } from 'electron'
import { Worker } from 'node:worker_threads'
import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { decodeWave, encodeWave } from './voice-wav'
import { voiceWorkerScript } from './voice-worker-script'
import { ChatterboxService } from './chatterbox'
import { OpenRouterVoiceService, type VoiceProvider } from './openrouter-voice'
import { FastWhisperService } from './fast-whisper'
import { PitVoiceService, PIT_VOICE_CHOICES, type PitVoiceId } from './pit-voices'
import { PocketVoiceService } from './pocket-voices'
import { RealtimeSettingsStore } from './realtime/settings'
import { loadPiper } from './realtime/free-cascade'

const execFileAsync = promisify(execFile)
const voiceModels = {
  asr: {
    folder: 'sherpa-onnx-whisper-tiny',
    required: ['tiny-encoder.int8.onnx', 'tiny-decoder.int8.onnx', 'tiny-tokens.txt'],
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2',
  },
} as const

export type VoiceStatus = { transcription: boolean; speech: boolean; provider: VoiceProvider; engine: 'piper' | 'chatterbox-pt-br' | 'openrouter' | 'pit-voices' | 'pocket-tts'; language: 'pt-BR'; voiceKeyConfigured: boolean; localSpeechInstalled: boolean; defaultVoiceReady: boolean; pitSpeechInstalled: boolean; pocketSpeechInstalled: boolean; transcriptionEngine: 'whisper-small-fast' | 'whisper-tiny' }

export class VoiceService {
  private readonly modelsDir = join(app.getPath('userData'), 'voice-models')
  private readonly chatterbox = new ChatterboxService()
  private readonly openRouter = new OpenRouterVoiceService()
  private readonly fastWhisper = new FastWhisperService()
  private readonly pits = new PitVoiceService()
  private readonly pocket = new PocketVoiceService()
  private readonly realtimeSettings = new RealtimeSettingsStore(app.getPath('userData'))
  private worker: Worker | null = null
  private nextId = 0
  private outstanding = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
  private installation: Promise<void> | null = null

  async status(): Promise<VoiceStatus> {
    const installed = async (key: keyof typeof voiceModels) => {
      const model = voiceModels[key]
      return (await Promise.all(model.required.map(async file => !!(await fs.stat(join(this.modelsDir, model.folder, file)).catch(() => null))))).every(Boolean)
    }
    const [engine, voiceKeyConfigured, localSpeechInstalled, tinyReady, defaultVoiceReady, pitSpeechInstalled, fastReady, pocketSpeechInstalled] = await Promise.all([this.openRouter.provider(), this.openRouter.configured(), this.chatterbox.status(), installed('asr'), this.openRouter.defaultVoiceReady(), this.pits.installed(), this.fastWhisper.installed(), this.pocket.installed()])
    const settings = engine === 'realtime' ? await this.realtimeSettings.settings() : null
    const localEngine = settings?.ttsEngine === 'pocket' ? 'pocket-tts' : 'piper'
    const localReady = settings && (localEngine === 'pocket-tts' ? pocketSpeechInstalled : await this.realtimeSettings.piperVoiceReady(settings.piperVoice))
    if (fastReady) void this.fastWhisper.warmup().catch(() => undefined)
    return { transcription: fastReady || tinyReady, transcriptionEngine: fastReady ? 'whisper-small-fast' : 'whisper-tiny', provider: engine, speech: engine === 'realtime' ? !!localReady : engine === 'pits' ? pitSpeechInstalled : engine === 'pocket' ? pocketSpeechInstalled : engine === 'openrouter' ? voiceKeyConfigured : localSpeechInstalled,
      engine: engine === 'realtime' ? localEngine : engine === 'pits' ? 'pit-voices' : engine === 'pocket' ? 'pocket-tts' : engine === 'openrouter' ? 'openrouter' : 'chatterbox-pt-br', language: 'pt-BR', voiceKeyConfigured, localSpeechInstalled, defaultVoiceReady, pitSpeechInstalled, pocketSpeechInstalled }
  }

  async prewarmTranscription(): Promise<void> {
    if (await this.fastWhisper.installed()) await this.fastWhisper.warmup()
  }

  private createWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(voiceWorkerScript, { eval: true, workerData: { modulePath: require.resolve('sherpa-onnx-node'), modelsDir: this.modelsDir } })
    worker.on('message', (result: { id: number; text?: string; wav?: Uint8Array; error?: string }) => {
      const pending = this.outstanding.get(result.id)
      if (!pending) return
      this.outstanding.delete(result.id)
      clearTimeout(pending.timeout)
      if (result.error) pending.reject(new Error(result.error))
      else pending.resolve(result.wav ?? result.text ?? '')
    })
    const lost = (error: Error) => {
      if (this.worker !== worker) return
      this.worker = null
      for (const pending of this.outstanding.values()) { clearTimeout(pending.timeout); pending.reject(error) }
      this.outstanding.clear()
    }
    worker.on('error', lost)
    worker.on('exit', code => lost(new Error('Motor de voz encerrado: ' + code)))
    this.worker = worker
    return worker
  }

  private request(operation: string, data: object, timeoutMs = 90_000): Promise<unknown> {
    const worker = this.createWorker()
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.outstanding.delete(id)
        this.worker = null
        void worker.terminate()
        reject(new Error('O modelo demorou demais para responder.'))
      }, timeoutMs)
      this.outstanding.set(id, { resolve, reject, timeout })
      worker.postMessage({ id, operation, ...data })
    })
  }

  async transcribe(wav: Uint8Array): Promise<string> {
    if (!(await this.status()).transcription) throw new Error('Instale o modelo de transcrição local nas configurações de voz.')
    if (await this.fastWhisper.installed()) return this.fastWhisper.transcribe(wav)
    const { samples } = decodeWave(wav)
    return await this.request('transcribe', { samples }, 120_000) as string
  }

  async setProvider(provider: VoiceProvider): Promise<VoiceStatus> {
    await this.openRouter.setProvider(provider)
    return this.status()
  }

  async saveOpenRouterKey(key: string): Promise<VoiceStatus> {
    await this.openRouter.saveKey(key)
    return this.status()
  }

  async clearOpenRouterKey(): Promise<VoiceStatus> {
    await this.openRouter.clearKey()
    return this.status()
  }

  async pitVoices() { return { choices: PIT_VOICE_CHOICES, selection: await this.pits.selection() } }
  async setPitVoice(voiceId: PitVoiceId | null, agentId?: string) { return this.pits.setPreset(voiceId, agentId) }
  async pitVoiceSample(voiceId: string): Promise<Uint8Array> { return this.pits.sample(voiceId) }

  async pocketVoices() { return this.pocket.info() }
  async setPocketVoice(voiceId: string | null, agentId?: string) { return this.pocket.setVoice(voiceId, agentId) }
  async importPocketVoice(filepath: string) { return this.pocket.importVoice(filepath) }
  async optimizePocketVoice(voiceId: string) { return this.pocket.optimizeVoice(voiceId) }

  async newVoice(agentId?: string): Promise<Uint8Array> { return this.openRouter.newVoice(agentId) }
  async resetAgentVoice(agentId: string): Promise<void> { return this.openRouter.resetAgentVoice(agentId) }
  async speak(text: string, speed = 1, agentId?: string): Promise<Uint8Array> {
    if (typeof text !== 'string' || text.trim().length < 1 || text.length > 1600) throw new Error('O texto para leitura deve ter até 1.600 caracteres.')
    if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new Error('Velocidade de fala inválida.')
    if (await this.openRouter.provider() === 'realtime') {
      const settings = await this.realtimeSettings.settings()
      if (settings.ttsEngine === 'pocket') return this.pocket.speak(text, agentId)
      const voice = (agentId && settings.piperAgentVoices?.[agentId]) || settings.piperVoice
      if (!(await this.realtimeSettings.piperVoiceReady(voice))) throw new Error('Baixe a voz Piper selecionada em Configurações > Voz em tempo real.')
      const tts = await loadPiper(this.realtimeSettings.piperDir(voice), voice)
      const audio = await tts.generateAsync({ text, sid: 0, speed, enableExternalBuffer: false })
      return encodeWave(audio.samples, audio.sampleRate)
    }
    const status = await this.status()
    if (!status.speech) throw new Error(status.engine === 'pocket-tts' ? 'Instale o executável PocketTTS local.' : status.engine === 'pit-voices' ? 'Instale os motores Supertonic/Kokoro.' : status.engine === 'openrouter' ? 'Configure uma chave OpenRouter nas configurações de voz.' : 'Instale o Chatterbox PT-BR para gerar voz local.')
    if (status.engine === 'pit-voices') return this.pits.speak(text, agentId)
    if (status.engine === 'pocket-tts') return this.pocket.speak(text, agentId)
    return status.engine === 'openrouter' ? this.openRouter.speak(text, speed, agentId) : this.chatterbox.speak(text, speed)
  }

  async install(mode: 'transcription' | 'local' = 'local'): Promise<VoiceStatus> {
    if (this.installation) { await this.installation; return this.status() }
    this.installation = (async () => {
      await fs.mkdir(this.modelsDir, { recursive: true })
      for (const model of Object.values(voiceModels)) {
        const ready = (await Promise.all(model.required.map(item => fs.stat(join(this.modelsDir, model.folder, item)).then(() => true, () => false)))).every(Boolean)
        if (ready) continue
        const filename = join(this.modelsDir, model.folder + '.download')
        try {
          const response = await fetch(model.url, { signal: AbortSignal.timeout(600_000) })
          if (!response.ok || !response.body) throw new Error('Falha ao baixar ' + model.folder + ': HTTP ' + response.status)
          let count = 0
          const limit = new Transform({
            transform(chunk: Buffer, _, callback) {
              count += chunk.byteLength
              if (count > 250_000_000) callback(new Error('Download ultrapassou o tamanho permitido.'))
              else callback(null, chunk)
            },
          })
          await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(filename))
          const { stdout } = await execFileAsync('tar', ['-tf', filename], { maxBuffer: 8 * 1024 * 1024 })
          const entries = stdout.split(/\r?\n/).filter(Boolean)
          if (!entries.length || entries.some(entry => {
            const sanitized = entry.replaceAll('\\', '/').replace(/^\.\//, '')
            return sanitized.startsWith('/') || sanitized.includes('../') || !(sanitized === model.folder || sanitized.startsWith(model.folder + '/'))
          })) throw new Error('O pacote contém caminhos inválidos.')
          await execFileAsync('tar', ['-xf', filename, '-C', this.modelsDir], { timeout: 120_000 })
          for (const required of model.required) await fs.stat(join(this.modelsDir, model.folder, required))
        } finally {
          await fs.rm(filename, { force: true }).catch(() => undefined)
        }
      }
      if (mode === 'local') await this.chatterbox.install()
    })()
    try { await this.installation } finally { this.installation = null }
    return this.status()
  }

  close() {
    this.fastWhisper.close()
    this.chatterbox.close()
    const worker = this.worker
    this.worker = null
    for (const pending of this.outstanding.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Serviço de voz encerrado.')) }
    this.outstanding.clear()
    if (worker) void worker.terminate()
  }
}
