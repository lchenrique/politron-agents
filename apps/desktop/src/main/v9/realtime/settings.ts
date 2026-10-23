import { safeStorage } from 'electron'
import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PiperVoice, RealtimeProvider, RealtimeSettings, RealtimeTranscriptionModel, RealtimeTtsEngine } from '../../../shared/realtime'

const execFileAsync = promisify(execFile)

export const DEFAULT_SETTINGS: RealtimeSettings = { geminiModel: '', geminiVoice: 'Puck', transcriptionModel: 'whisper-large-v3-turbo', piperVoice: 'faber', ttsEngine: 'piper' }
const ENV_KEYS: Record<RealtimeProvider, string> = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' }
function agentVoices(value: unknown): Record<string, PiperVoice> {
  const result: Record<string, PiperVoice> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [agentId, voice] of Object.entries(value)) {
    if (/^[a-zA-Z0-9_-]{1,100}$/.test(agentId) && !['__proto__', 'constructor', 'prototype'].includes(agentId)
      && typeof voice === 'string' && Object.hasOwn(PIPER_VOICES, voice)) result[agentId] = voice as PiperVoice
  }
  return result
}

export const PIPER_VOICES: Record<PiperVoice, { folder: string; model: string; archive: string }> = {
  faber: { folder: 'vits-piper-pt_BR-faber-medium', model: 'pt_BR-faber-medium.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2' },
  cadu: { folder: 'vits-piper-pt_BR-cadu-medium', model: 'pt_BR-cadu-medium.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-cadu-medium.tar.bz2' },
  jeff: { folder: 'vits-piper-pt_BR-jeff-medium', model: 'pt_BR-jeff-medium.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-jeff-medium.tar.bz2' },
  edresson: { folder: 'vits-piper-pt_BR-edresson-low', model: 'pt_BR-edresson-low.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-edresson-low.tar.bz2' },
  miro: { folder: 'vits-piper-pt_BR-miro-high', model: 'pt_BR-miro-high.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-miro-high.tar.bz2' },
  dii: { folder: 'vits-piper-pt_BR-dii-high', model: 'pt_BR-dii-high.onnx', archive: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-dii-high.tar.bz2' },
}
const VAD_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx'
const PARAKEET_FOLDER = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'
const PARAKEET_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${PARAKEET_FOLDER}.tar.bz2`

/** Chaves cifradas com safeStorage (DPAPI no Windows), preferências e modelos locais do modo de voz em tempo real. */
export class RealtimeSettingsStore {
  readonly modelsDir: string
  constructor(private readonly root: string) { this.modelsDir = join(root, 'realtime-models') }

  private keyPath(provider: RealtimeProvider) { return join(this.root, `realtime-${provider}-key.enc`) }
  private get settingsPath() { return join(this.root, 'realtime-settings.json') }

  async key(provider: RealtimeProvider): Promise<string | null> {
    const fromEnv = process.env[ENV_KEYS[provider]]?.trim()
    if (fromEnv) return fromEnv
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.decryptString(await fs.readFile(this.keyPath(provider)))
    } catch { return null }
  }

  async saveKey(provider: RealtimeProvider, key: string): Promise<void> {
    if (provider !== 'gemini' && provider !== 'groq') throw new Error('Provedor de voz inválido.')
    const value = String(key || '').trim()
    if (value.length < 20 || value.length > 500 || /\s/.test(value)) throw new Error('Chave inválida.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia de credenciais indisponível neste Windows.')
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.keyPath(provider), safeStorage.encryptString(value), { mode: 0o600 })
  }

  async clearKey(provider: RealtimeProvider): Promise<void> { await fs.rm(this.keyPath(provider), { force: true }) }

  async settings(): Promise<RealtimeSettings> {
    try {
      const stored = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'))
      const value: RealtimeSettings = { ...DEFAULT_SETTINGS, geminiModel: stored.geminiModel, geminiVoice: stored.geminiVoice, transcriptionModel: stored.transcriptionModel, piperVoice: stored.piperVoice, ttsEngine: stored.ttsEngine }
      if (!['whisper-large-v3-turbo', 'whisper-large-v3', 'parakeet-v3'].includes(value.transcriptionModel)) value.transcriptionModel = DEFAULT_SETTINGS.transcriptionModel
      if (!(value.piperVoice in PIPER_VOICES)) value.piperVoice = DEFAULT_SETTINGS.piperVoice
      if (value.ttsEngine !== 'piper' && value.ttsEngine !== 'pocket') value.ttsEngine = 'piper'
      value.piperAgentVoices = agentVoices(stored.piperAgentVoices)
      return value
    } catch { return { ...DEFAULT_SETTINGS } }
  }

  async saveSettings(patch: Partial<RealtimeSettings>): Promise<RealtimeSettings> {
    const current = await this.settings()
    const text = (value: unknown, fallback: string) => typeof value === 'string' && value.length <= 200 && /^[\w./:-]*$/.test(value) ? value : fallback
    const next: RealtimeSettings = {
      geminiModel: text(patch.geminiModel, current.geminiModel),
      geminiVoice: text(patch.geminiVoice, current.geminiVoice) || DEFAULT_SETTINGS.geminiVoice,
      transcriptionModel: ['whisper-large-v3-turbo', 'whisper-large-v3', 'parakeet-v3'].includes(String(patch.transcriptionModel)) ? patch.transcriptionModel as RealtimeTranscriptionModel : current.transcriptionModel,
      piperVoice: patch.piperVoice && patch.piperVoice in PIPER_VOICES ? patch.piperVoice as PiperVoice : current.piperVoice,
      ttsEngine: ['piper', 'pocket'].includes(String(patch.ttsEngine)) ? patch.ttsEngine as RealtimeTtsEngine : current.ttsEngine,
      piperAgentVoices: patch.piperAgentVoices === undefined ? current.piperAgentVoices : agentVoices(patch.piperAgentVoices),
    }
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.settingsPath, JSON.stringify(next), { mode: 0o600 })
    return next
  }

  piperDir(voice: PiperVoice = DEFAULT_SETTINGS.piperVoice) { return join(this.modelsDir, PIPER_VOICES[voice].folder) }
  get parakeetDir() { return join(this.modelsDir, PARAKEET_FOLDER) }
  get vadPath() { return join(this.modelsDir, 'silero_vad.onnx') }
  async vadInstalled(): Promise<boolean> { return !!(await fs.stat(this.vadPath).catch(() => null)) }

  async localModelsReady(voice: PiperVoice = DEFAULT_SETTINGS.piperVoice): Promise<boolean> {
    return await this.piperVoiceReady(voice) && await this.vadInstalled()
  }

  async piperVoiceReady(voice: PiperVoice = DEFAULT_SETTINGS.piperVoice): Promise<boolean> {
    const files = [join(this.piperDir(voice), PIPER_VOICES[voice].model), join(this.piperDir(voice), 'tokens.txt'), join(this.piperDir(voice), 'espeak-ng-data')]
    return (await Promise.all(files.map(file => fs.stat(file).then(() => true, () => false)))).every(Boolean)
  }

  async installedPiperVoices(): Promise<PiperVoice[]> {
    const voices = Object.entries(PIPER_VOICES) as [PiperVoice, typeof PIPER_VOICES[PiperVoice]][]
    const installed = await Promise.all(voices.map(async ([voice, config]) => {
      const file = await fs.stat(join(this.piperDir(voice), config.model)).catch(() => null)
      return file ? voice : null
    }))
    return installed.filter((voice): voice is PiperVoice => voice !== null)
  }

  async parakeetInstalled(): Promise<boolean> {
    return (await Promise.all(['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'].map(file => fs.stat(join(this.parakeetDir, file)).then(() => true, () => false)))).every(Boolean)
  }

  private installing: Promise<void> | null = null
  /** Baixa Piper pt-BR (~67 MB) e Silero VAD (~0,6 MB) uma única vez. */
  installLocalModels(voice: PiperVoice = DEFAULT_SETTINGS.piperVoice): Promise<void> {
    this.installing ??= this.doInstall(voice).finally(() => { this.installing = null })
    return this.installing
  }

  private async download(url: string, target: string, limit: number) {
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar modelo de voz: HTTP ${response.status}`)
    let total = 0
    const guard = new Transform({ transform(chunk: Buffer, _encoding, callback) { total += chunk.byteLength; callback(total > limit ? new Error('Download maior que o esperado.') : null, chunk) } })
    await pipeline(Readable.fromWeb(response.body as never), guard, createWriteStream(target))
  }

  private async doInstall(voice: PiperVoice) {
    await fs.mkdir(this.modelsDir, { recursive: true })
    if (!(await fs.stat(this.vadPath).catch(() => null))) {
      const partial = this.vadPath + '.download'
      await this.download(VAD_URL, partial, 5_000_000)
      await fs.rename(partial, this.vadPath)
    }
    await this.installPiperVoice(voice)
  }

  async installPiperVoice(voice: PiperVoice): Promise<void> {
    const config = PIPER_VOICES[voice]
    if (!config) throw new Error('Voz Piper inválida.')
    if (await fs.stat(join(this.piperDir(voice), config.model)).catch(() => null)) return
    await fs.mkdir(this.modelsDir, { recursive: true })
    await this.extractArchive(config.archive, config.folder, 150_000_000, 180_000)
  }

  async installParakeet(): Promise<void> {
    if (await this.parakeetInstalled()) return
    await fs.mkdir(this.modelsDir, { recursive: true })
    await this.extractArchive(PARAKEET_URL, PARAKEET_FOLDER, 900_000_000, 600_000)
  }

  private async extractArchive(url: string, folder: string, limit: number, timeout: number) {
    const archiveName = folder + '.tar.bz2'
    const archive = join(this.modelsDir, archiveName)
    try {
      await this.download(url, archive, limit)
      // GNU tar interpreta caminho absoluto Windows como host remoto; passe somente o nome do arquivo.
      const { stdout } = await execFileAsync('tar', ['-tf', archiveName], { cwd: this.modelsDir, maxBuffer: 32 * 1024 * 1024 })
      const unsafe = stdout.split(/\r?\n/).filter(Boolean).some(entry => {
        const clean = entry.replaceAll('\\', '/').replace(/^\.\//, '')
        return clean.startsWith('/') || clean.includes('../') || !clean.startsWith(folder)
      })
      if (unsafe) throw new Error('O pacote do modelo contém caminhos inválidos.')
      await execFileAsync('tar', ['-xf', archiveName], { cwd: this.modelsDir, timeout })
    } finally { await fs.rm(archive, { force: true }).catch(() => undefined) }
  }
}
