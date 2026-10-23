import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { join, extname, basename } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const VALID_ID = /^[a-zA-Z0-9_-]{1,100}$/
const SAFE_VOICE = /^[a-zA-Z0-9_-]{1,100}$/
const MAX_SAMPLE = 16_000_000
const MAX_WAV = 12_000_000
const PRESET_VOICES = [
  { id: 'rafael', name: 'Rafael · masculina' },
  { id: 'vera', name: 'Vera · feminina' },
  { id: 'cosette', name: 'Cosette · feminina' },
  { id: 'marius', name: 'Marius · masculina' },
] as const
const presetVoice = (value: string): boolean => PRESET_VOICES.some(voice => voice.id === value)

export interface PocketVoiceInfo {
  installed: boolean
  choices: { id: string; name: string }[]
  selection: { defaultVoiceId: string; agentVoiceIds: Record<string, string> }
}

const forbiddenId = (id: string) => !VALID_ID.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)
const isRiff = (data: Buffer) => data.length > 44 &&
  data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
const isAudio = (data: Buffer, ext: string) =>
  (ext === '.wav' && isRiff(data)) ||
  (ext === '.mp3' && (data.subarray(0, 3).toString('ascii') === 'ID3' ||
    (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)))
const isSafetensors = (data: Buffer) => {
  if (data.length < 12) return false
  const size = Number(data.readBigUInt64LE(0))
  if (!Number.isSafeInteger(size) || size < 2 || size > 1_000_000 || size + 8 >= data.length) return false
  try { const obj: unknown = JSON.parse(data.subarray(8, 8 + size).toString('utf8'))
    return !!obj && typeof obj === 'object' && !Array.isArray(obj)
  } catch { return false }
}

/** Local, optional TTS: one short-lived executable per request, no HTTP server. */
export class PocketVoiceService {
  private readonly voiceDir: string
  private readonly outputDir: string
  private readonly executable: string
  private readonly preferences: string
  private readonly cache = new Map<string, Uint8Array>()
  constructor(private readonly root = join(app.getPath('userData'), 'voice-models', 'pocket-tts')) {
    this.voiceDir = join(root, 'voices')
    this.outputDir = join(root, 'generated')
    this.executable = join(root, 'bin', process.platform === 'win32' ? 'pocket-tts.exe' : 'pocket-tts')
    this.preferences = join(root, 'selection.json')
  }
  async installed(): Promise<boolean> {
    const binary = await fs.stat(this.executable).catch(() => null)
    return !!binary?.isFile() && binary.size > 1_000_000
  }
  async info(): Promise<PocketVoiceInfo> {
    const selection: PocketVoiceInfo['selection'] = { defaultVoiceId: 'rafael', agentVoiceIds: {} }
    try {
      const raw = JSON.parse(await fs.readFile(this.preferences, 'utf8')) as PocketVoiceInfo['selection']
      if (typeof raw.defaultVoiceId === 'string' && SAFE_VOICE.test(raw.defaultVoiceId)) {
        selection.defaultVoiceId = raw.defaultVoiceId
      }
      if (raw.agentVoiceIds && typeof raw.agentVoiceIds === 'object' && !Array.isArray(raw.agentVoiceIds)) {
        for (const [agent, voice] of Object.entries(raw.agentVoiceIds)) {
          if (!forbiddenId(agent) && typeof voice === 'string' && SAFE_VOICE.test(voice)) selection.agentVoiceIds[agent] = voice
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
    const entries = await fs.readdir(this.voiceDir, { withFileTypes: true }).catch(error => {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return []
      throw error
    })
    const choices: PocketVoiceInfo['choices'] = [...PRESET_VOICES]
    const found = new Set<string>()
    for (const item of entries) {
      const ext = extname(item.name).toLowerCase()
      const id = item.name.slice(0, -ext.length)
      if (item.isFile() && SAFE_VOICE.test(id) && !found.has(id) &&
          ['.wav', '.mp3', '.safetensors'].includes(ext)) {
        found.add(id)
        choices.push({ id, name: 'Boo · ' + id.slice(0, 8) })
      }
    }
    const allowed = new Set(choices.map(x => x.id))
    if (!allowed.has(selection.defaultVoiceId)) selection.defaultVoiceId = 'rafael'
    for (const [agent, voice] of Object.entries(selection.agentVoiceIds)) {
      if (!allowed.has(voice)) delete selection.agentVoiceIds[agent]
    }
    return { installed: await this.installed(), choices, selection }
  }
  async setVoice(voiceId: string | null, agentId?: string): Promise<PocketVoiceInfo> {
    if (agentId !== undefined && forbiddenId(agentId)) throw new Error('Identificador de Boo inválido.')
    const current = await this.info()
    if (voiceId !== null && !current.choices.some(voice => voice.id === voiceId)) throw new Error('Voz não disponível.')
    if (!agentId && !voiceId) throw new Error('Selecione uma voz geral.')
    if (agentId) {
      if (voiceId === null) delete current.selection.agentVoiceIds[agentId]
      else current.selection.agentVoiceIds[agentId] = voiceId
    } else current.selection.defaultVoiceId = voiceId!
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.preferences, JSON.stringify(current.selection, null, 2), { mode: 0o600 })
    this.cache.clear()
    return this.info()
  }
  /** Import a user-selected, authorized sample. Never execute or import remote paths. */
  async importVoice(source: string): Promise<PocketVoiceInfo> {
    if (typeof source !== 'string' || !source || source.startsWith('\\\\')) throw new Error('Selecione um arquivo local válido.')
    const ext = extname(source).toLowerCase()
    if (!['.wav', '.mp3', '.safetensors'].includes(ext)) throw new Error('Use um WAV, MP3 ou safetensors.')
    const stat = await fs.stat(source)
    if (!stat.isFile() || stat.size < 44 || stat.size > MAX_SAMPLE) throw new Error('Arquivo de voz excede o limite de 16 MB ou está vazio.')
    const bytes = await fs.readFile(source)
    if (ext === '.safetensors' ? !isSafetensors(bytes) : !isAudio(bytes, ext)) throw new Error('Arquivo de voz inválido.')
    const id = randomUUID().replaceAll('-', '').slice(0, 20)
    await fs.mkdir(this.voiceDir, { recursive: true })
    await fs.writeFile(join(this.voiceDir, id + ext), bytes, { flag: 'wx', mode: 0o600 })
    return this.info()
  }
  private async voicePath(voice: string): Promise<string> {
    if (presetVoice(voice)) return voice
    if (!SAFE_VOICE.test(voice)) throw new Error('Identificador da voz inválido.')
    const matches = (await fs.readdir(this.voiceDir)).filter(name => basename(name, extname(name)) === voice)
    if (!matches.length) throw new Error('A voz escolhida foi removida.')
    const preferred = matches.find(name => name.endsWith('.safetensors')) ||
      matches.find(name => name.endsWith('.wav')) || matches.find(name => name.endsWith('.mp3'))
    if (!preferred) throw new Error('Formato de voz inválido.')
    return join(this.voiceDir, preferred)
  }
  /** One-time local embedding conversion. Original recording stays intact on error. */
  async optimizeVoice(voice: string): Promise<PocketVoiceInfo> {
    if (presetVoice(voice) || !SAFE_VOICE.test(voice) ||
        !(await this.info()).choices.some(item => item.id === voice))
      throw new Error('Selecione uma voz local importada.')
    if (!(await this.installed())) throw new Error('Motor PocketTTS não instalado.')
    const reference = await this.voicePath(voice)
    if (reference.endsWith('.safetensors')) return this.info()
    const final = join(this.voiceDir, voice + '.safetensors')
    const temporary = join(this.voiceDir, voice + '.preparing.safetensors')
    try {
      await execFileAsync(this.executable, ['export-voice', '--language', 'portuguese', reference, temporary],
        { timeout: 125_000, windowsHide: true, maxBuffer: 1024 * 1024,
          env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' } })
      const bytes = await fs.readFile(temporary)
      if (bytes.length > MAX_SAMPLE || !isSafetensors(bytes)) throw new Error('Identidade de voz exportada inválida.')
      await fs.rename(temporary, final)
      this.cache.clear()
      return this.info()
    } catch (error) {
      const e = error as Error & { stderr?: string }
      throw new Error('Falha ao preparar voz (pesos PocketTTS PT podem exigir autorização no Hugging Face): ' +
        (e.stderr || e.message).slice(-300))
    } finally {
      await fs.rm(temporary, { force: true })
    }
  }
  async speak(text: string, agentId?: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (signal?.aborted) throw new Error('Síntese de voz cancelada.')
    if (typeof text !== 'string' || !text.trim() || text.length > 700) throw new Error('Use um texto de até 700 caracteres para PocketTTS.')
    if (agentId && forbiddenId(agentId)) throw new Error('Identificador de Boo inválido.')
    if (!(await this.installed())) throw new Error('Instale o executável local PocketTTS antes de selecionar este motor.')
    const options = await this.info()
    const voice = (agentId && options.selection.agentVoiceIds[agentId]) || options.selection.defaultVoiceId
    const cacheKey = voice + ':' + text
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!
    const voicePath = await this.voicePath(voice)
    await fs.mkdir(this.outputDir, { recursive: true })
    const file = join(this.outputDir, randomUUID() + '.wav')
    try {
      await execFileAsync(this.executable, ['generate', '--language', 'portuguese', '--quantize',
        '--voice', voicePath, '--text', text, '--output-path', file], {
        windowsHide: true, timeout: 125_000, maxBuffer: 1024 * 1024, signal,
        env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' },
      })
      if (signal?.aborted) throw new Error('Síntese de voz cancelada.')
      const audio = await fs.readFile(file)
      if (audio.length > MAX_WAV || !isRiff(audio)) throw new Error('PocketTTS não gerou um WAV válido.')
      const result = Uint8Array.from(audio)
      this.cache.set(cacheKey, result)
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!)
      return result
    } catch (error) {
      const e = error as Error & { stderr?: string }
      const details = (e.stderr || e.message || '').slice(-400)
      if (/401|403|gated|unauthoriz|access.*denied/i.test(details))
        throw new Error('Os pesos PocketTTS PT exigem aceitar os termos e autenticar no Hugging Face. Nenhuma voz foi gerada.')
      throw new Error('Não foi possível gerar voz PocketTTS local: ' + details)
    } finally { await fs.rm(file, { force: true }) }
  }
}
