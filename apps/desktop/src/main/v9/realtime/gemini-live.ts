import type { RealtimeEvent } from '../../../shared/realtime'
import { sampleRateFromMime } from './audio-text'

export interface RealtimeTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  run(args: Record<string, unknown>): Promise<string>
}

export interface RealtimeSession {
  pushAudio(pcm16: Int16Array): void
  interrupt(): void
  close(): void
  /** Injeta um texto como se o usuário tivesse dito, pra narrar um resultado que chegou depois que o turno já tinha terminado. Sessões que não suportam isso (cascata gratuita) ignoram. */
  narrate?(text: string): void
}

const API = 'https://generativelanguage.googleapis.com/v1beta'
const SOCKET = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/** Lista os modelos da conta que aceitam sessão Live (bidiGenerateContent), áudio nativo primeiro. */
export async function listGeminiLiveModels(key: string): Promise<string[]> {
  const response = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(response.status === 400 || response.status === 403 ? 'Chave do Gemini recusada. Confira a chave criada no Google AI Studio.' : `Gemini respondeu HTTP ${response.status}.`)
  const data = await response.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const live = (data.models || []).filter(model => model.supportedGenerationMethods?.includes('bidiGenerateContent')).map(model => model.name.replace(/^models\//, ''))
  const score = (name: string) => (name.includes('native-audio') ? 0 : name.includes('live') ? 1 : 2) + (name.includes('preview') || name.includes('exp') ? 0.5 : 0)
  return live.sort((a, b) => score(a) - score(b) || b.localeCompare(a))
}

/**
 * Sessão de voz para voz no Gemini Live. O servidor faz a detecção de fala (VAD) e a interrupção;
 * aqui só repassamos o áudio do microfone, devolvemos o áudio dele e executamos ferramentas.
 */
export async function openGeminiLive(options: {
  key: string; model: string; voice: string; instructions: string; tools: RealtimeTool[]
  emit: (event: RealtimeEvent) => void
  /** When supplied, Live handles audio only; the Boobot agent owns every response. */
  onUtterance?: (utterance: string) => void | Promise<void>
}): Promise<RealtimeSession> {
  const { key, model, voice, instructions, tools, emit, onUtterance } = options
  const audioBridge = typeof onUtterance === 'function'
  // A chave vai na URL porque o WebSocket do Node não aceita cabeçalhos personalizados; fica só no processo principal.
  const socket = new WebSocket(`${SOCKET}?key=${encodeURIComponent(key)}`)
  // ArrayBuffer evita conversão assíncrona de Blob, que poderia reordenar trechos de áudio.
  socket.binaryType = 'arraybuffer'
  let ready = false
  let closed = false
  let agentText = ''
  let userText = ''
  let narratingAgent = false

  const send = (payload: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)) }

  const opened = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O Gemini Live não respondeu a tempo.')), 15_000)
    socket.addEventListener('open', () => {
      send({ setup: {
        model: `models/${model}`,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        systemInstruction: { parts: [{ text: audioBridge
          ? 'Você é exclusivamente a saída de áudio do Boo no aplicativo Boobot. O próprio Boo gera todas as respostas. Enquanto ouvir o microfone, não dê conselhos, não responda perguntas, não declare capacidades e não aja como outro assistente. Quando receber uma mensagem de texto iniciada por FALA_DO_BOO:, fale SOMENTE o texto depois desse prefixo com uma voz natural em português brasileiro. Não acrescente cumprimentos, explicações nem prefácios. Você apenas dá voz ao Boo.'
          : instructions }] },
        tools: !audioBridge && tools.length ? [{ functionDeclarations: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }] : undefined,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      } })
    })
    socket.addEventListener('message', async event => {
      const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8')
      let message: {
        setupComplete?: unknown; goAway?: unknown
        serverContent?: { interrupted?: boolean; turnComplete?: boolean; inputTranscription?: { text?: string }; outputTranscription?: { text?: string }; modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }
        toolCall?: { functionCalls?: Array<{ id: string; name: string; args?: Record<string, unknown> }> }
      }
      try { message = JSON.parse(raw) } catch { return }
      if (message.setupComplete && !ready) { ready = true; clearTimeout(timer); resolve(); emit({ type: 'phase', phase: 'listening' }); return }
      const content = message.serverContent
      if (content?.interrupted) { if (audioBridge) narratingAgent = false; emit({ type: 'interrupted' }); emit({ type: 'phase', phase: 'listening' }); if (!audioBridge) flushAgent() }
      if (content?.inputTranscription?.text) { userText += content.inputTranscription.text; emit({ type: 'transcript', role: 'user', text: userText, final: false }) }
      for (const part of content?.modelTurn?.parts || []) {
        if (part.inlineData?.data) {
          // Never play the Gemini model's own answers in bridge mode: it is only a microphone and voice.
          if (audioBridge && !narratingAgent) continue
          if (!audioBridge && userText) { emit({ type: 'transcript', role: 'user', text: userText, final: true }); userText = '' }
          emit({ type: 'phase', phase: 'speaking' })
          emit({ type: 'audio', data: part.inlineData.data, sampleRate: sampleRateFromMime(part.inlineData.mimeType) })
        }
      }
      if (content?.outputTranscription?.text && (!audioBridge || narratingAgent)) { agentText += content.outputTranscription.text; emit({ type: 'transcript', role: 'agent', text: agentText, final: false }) }
      if (content?.turnComplete) {
        if (audioBridge) {
          if (narratingAgent) {
            narratingAgent = false
            if (agentText) { emit({ type: 'transcript', role: 'agent', text: agentText, final: true }); agentText = '' }
            emit({ type: 'phase', phase: 'listening' })
          } else if (userText.trim()) {
            const spoken = userText.trim()
            userText = ''
            emit({ type: 'transcript', role: 'user', text: spoken, final: true })
            emit({ type: 'phase', phase: 'thinking' })
            void Promise.resolve().then(() => onUtterance?.(spoken)).catch(error => emit({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao consultar o Boo.' }))
          } else emit({ type: 'phase', phase: 'listening' })
        } else { flushAgent(); emit({ type: 'phase', phase: 'listening' }) }
      }
      if (!audioBridge && message.toolCall?.functionCalls?.length) {
        const functionResponses = await Promise.all(message.toolCall.functionCalls.map(async (call: { id: string; name: string; args?: Record<string, unknown> }) => {
          const tool = tools.find(item => item.name === call.name)
          let result: string
          try { result = tool ? await tool.run(call.args || {}) : `Ferramenta desconhecida: ${call.name}` } catch (error) { result = error instanceof Error ? error.message : 'Falha ao executar a ferramenta.' }
          return { id: call.id, name: call.name, response: { result } }
        }))
        send({ toolResponse: { functionResponses } })
      }
      if (message.goAway) emit({ type: 'phase', phase: 'listening', detail: 'O Gemini vai encerrar esta sessão em breve.' })
    })
    socket.addEventListener('close', event => {
      clearTimeout(timer)
      if (!ready) { reject(new Error(describeClose(event.code, event.reason))); return }
      flushAgent()
      if (!closed) { emit({ type: 'error', message: describeClose(event.code, event.reason) }); emit({ type: 'ended' }) }
      closed = true
    })
    socket.addEventListener('error', () => { /* o evento close traz o motivo */ })
  })

  function flushAgent() {
    if (userText) { emit({ type: 'transcript', role: 'user', text: userText, final: true }); userText = '' }
    if (agentText) { emit({ type: 'transcript', role: 'agent', text: agentText, final: true }); agentText = '' }
  }

  await opened
  return {
    pushAudio(pcm16) {
      if (!ready || closed) return
      send({ realtimeInput: { audio: { data: Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } })
    },
    // No Live, quem interrompe é a voz do usuário (VAD do servidor); aqui só paramos de tocar o que já chegou.
    interrupt() { emit({ type: 'interrupted' }); flushAgent() },
    close() { flushAgent(); closed = true; try { socket.close(1000) } catch { /* já fechado */ } },
    // Um resultado de tarefa que chegou depois do turno terminar: injeta como se o usuário tivesse avisado, pra ele narrar sem precisar de nova fala.
    narrate(text) {
      if (!ready || closed) return
      if (audioBridge) narratingAgent = true
      send({ clientContent: { turns: [{ role: 'user', parts: [{ text: audioBridge ? 'FALA_DO_BOO: ' + text : text }] }], turnComplete: true } })
    },
  }
}

function describeClose(code: number, reason: string): string {
  const detail = reason ? `: ${reason}` : ''
  if (code === 1008 || /api key|permission|unauthori/i.test(reason)) return `O Gemini recusou a sessão (chave ou modelo inválido)${detail}`
  if (code === 1011 && /quota|exhausted|rate/i.test(reason)) return `Limite gratuito do Gemini atingido${detail}`
  return `A sessão do Gemini Live foi encerrada (código ${code})${detail}`
}
