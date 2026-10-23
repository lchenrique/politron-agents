/**
 * Conversa por voz quase em tempo real, separada do ditado e da ligação antigos.
 * - 'gemini': Gemini Live API, voz para voz direto (precisa de chave do Google AI Studio).
 * - 'free': cascata gratuita — VAD Silero local + Whisper turbo e LLM rápido no Groq + Piper pt-BR local.
 */
export type RealtimeMode = 'gemini' | 'free'
export type RealtimeProvider = 'gemini' | 'groq'
export type RealtimeTranscriptionModel = 'whisper-large-v3-turbo' | 'whisper-large-v3' | 'parakeet-v3'
export type RealtimeTtsEngine = 'piper' | 'pocket'
export type PiperVoice = 'faber' | 'cadu' | 'jeff' | 'edresson' | 'miro' | 'dii'

export interface RealtimeSettings {
  geminiModel: string
  geminiVoice: string
  transcriptionModel: RealtimeTranscriptionModel
  piperVoice: PiperVoice
  piperAgentVoices?: Record<string, PiperVoice>
  ttsEngine: RealtimeTtsEngine
}

export interface RealtimeStatus {
  geminiKey: boolean
  groqKey: boolean
  /** Piper pt-BR + Silero VAD baixados (só o modo gratuito precisa). */
  localModels: boolean
  vadInstalled: boolean
  parakeetInstalled: boolean
  installedPiperVoices: PiperVoice[]
  pocketInstalled: boolean
  settings: RealtimeSettings
}

export type RealtimePhase = 'idle' | 'connecting' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'speaking' | 'error'

export type RealtimeEvent =
  | { type: 'phase'; phase: RealtimePhase; detail?: string }
  /** PCM 16 bits little-endian, mono, em base64. */
  | { type: 'audio'; data: string; sampleRate: number }
  /** O agente foi interrompido: o renderer descarta o áudio que ainda estava na fila. */
  | { type: 'interrupted' }
  | { type: 'transcript'; role: 'user' | 'agent'; text: string; final: boolean }
  | { type: 'delegated'; task: string; agentName: string }
  | { type: 'error'; message: string }
  | { type: 'ended' }

export interface RealtimeAPI {
  status(): Promise<RealtimeStatus>
  saveKey(provider: RealtimeProvider, key: string): Promise<void>
  clearKey(provider: RealtimeProvider): Promise<void>
  saveSettings(settings: Partial<RealtimeSettings>): Promise<RealtimeSettings>
  geminiModels(): Promise<string[]>
  installLocalModels(): Promise<RealtimeStatus>
  installParakeet(): Promise<RealtimeStatus>
  installPiperVoice(voice: PiperVoice): Promise<RealtimeStatus>
  previewPocketVoice(agentId?: string): Promise<Uint8Array>
  start(mode: RealtimeMode, conversationId: string, agentId?: string): Promise<void>
  /** Trecho de áudio do microfone: PCM 16 bits, 16 kHz, mono. */
  pushAudio(chunk: ArrayBuffer): void
  interrupt(): Promise<void>
  stop(): Promise<void>
  onEvent(callback: (event: RealtimeEvent) => void): () => void
}
