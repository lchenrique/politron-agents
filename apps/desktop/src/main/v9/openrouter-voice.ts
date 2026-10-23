import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export const FREE_SPEECH_MODEL = 'fish-audio/s2.1-pro-free:free'
const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech'
const SEED_TEXT = 'Olá! Sou uma voz do Boobot. Estou aqui para conversar com você, sempre em português brasileiro.'
const PT_BR_INSTRUCTIONS = 'Speak only in native Brazilian Portuguese, with a consistent natural Brazilian accent and one single voice. Do not switch speakers or voices.'
const MAX_AUDIO = 12_000_000
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/
export type VoiceProvider = 'realtime' | 'openrouter' | 'local' | 'pits' | 'pocket'

function isMp3(data: Uint8Array): boolean {
  return (data[0] === 73 && data[1] === 68 && data[2] === 51) ||
    (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
}

export class OpenRouterVoiceService {
  private readonly root = app.getPath('userData')
  private readonly keyPath = join(this.root, 'openrouter-voice-key.enc')
  private readonly settingsPath = join(this.root, 'voice-preferences.json')
  private readonly voicesPath = join(this.root, 'voice-references')
  private preparation: Promise<Uint8Array> | null = null
  private readonly cachedSpeech = new Map<string, Uint8Array>()

  async provider(): Promise<VoiceProvider> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'))
      if (parsed && typeof parsed === 'object' && 'provider' in parsed && ['realtime', 'openrouter', 'local', 'pits', 'pocket'].includes(String(parsed.provider))) return parsed.provider as VoiceProvider
    } catch { /* A leitura segue as vozes locais configuradas no app. */ }
    return 'realtime'
  }

  async setProvider(provider: VoiceProvider): Promise<void> {
    if (!['realtime', 'openrouter', 'local', 'pits', 'pocket'].includes(provider)) throw new Error('Provedor de voz inválido.')
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.settingsPath, JSON.stringify({ provider }), { mode: 0o600 })
  }

  async configured(): Promise<boolean> {
    if (this.environmentKey()) return true
    return !!(await fs.stat(this.keyPath).catch(() => null))
  }

  async defaultVoiceReady(): Promise<boolean> {
    return !!(await this.readReference())
  }

  private environmentKey(): string | null {
    const key = process.env.OPENROUTER_API_KEY?.trim()
    return key && key.length >= 20 && key.length <= 500 ? key : null
  }

  private async key(): Promise<string | null> {
    if (this.environmentKey()) return this.environmentKey()
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia de credenciais indisponível no Windows.')
      return safeStorage.decryptString(await fs.readFile(this.keyPath))
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw error
    }
  }

  async saveKey(value: string): Promise<void> {
    const key = typeof value === 'string' ? value.trim() : ''
    if (key.length < 20 || key.length > 500 || /\s/.test(key)) throw new Error('Informe uma chave de API válida do OpenRouter.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Não foi possível criptografar a chave do OpenRouter.')
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.keyPath, safeStorage.encryptString(key), { mode: 0o600 })
    await this.setProvider('openrouter')
  }

  async clearKey(): Promise<void> {
    await fs.rm(this.keyPath, { force: true })
  }

  private referencePath(agentId?: string): string {
    if (agentId && !SAFE_ID.test(agentId)) throw new Error('Identificador de agente inválido para voz.')
    return join(this.voicesPath, agentId ? 'agent-' + agentId + '.mp3' : 'default.mp3')
  }

  private async readReference(agentId?: string): Promise<Uint8Array | null> {
    const locations = agentId ? [this.referencePath(agentId), this.referencePath()] : [this.referencePath()]
    for (const filepath of locations) {
      const bytes = await fs.readFile(filepath).catch(() => null)
      if (bytes?.length && bytes.length <= 1_500_000 && isMp3(bytes)) return Uint8Array.from(bytes)
    }
    return null
  }

  private async persistReference(data: Uint8Array, agentId?: string): Promise<void> {
    if (!data.length || data.length > 1_500_000 || !isMp3(data)) throw new Error('A amostra de voz não é um MP3 válido ou é grande demais.')
    const filepath = this.referencePath(agentId)
    await fs.mkdir(this.voicesPath, { recursive: true })
    await fs.writeFile(filepath, data, { mode: 0o600 })
    this.cachedSpeech.clear()
  }

  /** Sempre gera uma única amostra de voz neutra, nunca salva mensagens do usuário como referência. */
  private async ensureDefaultVoice(): Promise<Uint8Array> {
    const found = await this.readReference()
    if (found) return found
    if (!this.preparation) {
      this.preparation = (async () => {
        const sample = await this.requestSpeech(SEED_TEXT, null)
        await this.persistReference(sample)
        return sample
      })().finally(() => { this.preparation = null })
    }
    return this.preparation
  }

  /** Gera outra identidade de voz somente após ação explícita do usuário. */
  async newVoice(agentId?: string): Promise<Uint8Array> {
    const sample = await this.requestSpeech(SEED_TEXT, null)
    await this.persistReference(sample, agentId)
    return sample
  }

  async resetAgentVoice(agentId: string): Promise<void> {
    await fs.rm(this.referencePath(agentId), { force: true })
    this.cachedSpeech.clear()
  }

  private async requestSpeech(text: string, reference: Uint8Array | null): Promise<Uint8Array> {
    const key = await this.key()
    if (!key) throw new Error('Configure uma chave OpenRouter na janela de ligação para usar a voz gratuita.')
    const references = reference
      ? [
          { type: 'input_audio', input_audio: { data: 'data:audio/mpeg;base64,' + Buffer.from(reference).toString('base64') } },
          { type: 'text', text: SEED_TEXT },
        ]
      : undefined
    const response = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + key,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
        'x-openrouter-title': 'Boobot',
      },
      body: JSON.stringify({
        model: FREE_SPEECH_MODEL,
        input: text,
        instructions: PT_BR_INSTRUCTIONS,
        response_format: 'mp3',
        ...(references ? { input_references: references } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
      redirect: 'error',
    })
    if (!response.ok) {
      const details = (await response.text().catch(() => '')).slice(0, 350)
      if (response.status === 401 || response.status === 403) throw new Error('Chave OpenRouter recusada. Verifique sua chave de API.')
      if (response.status === 402) throw new Error('O OpenRouter recusou a solicitação por saldo/conta. Nenhum modelo pago foi usado.')
      if (response.status === 429) throw new Error('Limite de solicitações gratuitas do OpenRouter atingido.')
      throw new Error('Falha na voz do OpenRouter (HTTP ' + response.status + '). ' + details)
    }
    const format = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
    if (format !== 'audio/mpeg' && format !== 'audio/mp3' && format !== 'application/octet-stream') {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('OpenRouter devolveu ' + (format || 'um formato desconhecido') + ' em vez de áudio MP3.')
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_AUDIO) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('O áudio gerado é grande demais.')
    }
    const data = new Uint8Array(await response.arrayBuffer())
    if (!data.length || data.length > MAX_AUDIO || !isMp3(data)) throw new Error('O OpenRouter não retornou um MP3 válido.')
    return data
  }

  async speak(text: string, _speed: number, agentId?: string): Promise<Uint8Array> {
    if (!text.trim() || text.length > 1600) throw new Error('O texto para voz deve ter até 1.600 caracteres.')
    // Nunca gerar sem referência por engano, mesmo com chamadas simultâneas.
    await this.ensureDefaultVoice()
    const reference = await this.readReference(agentId)
    if (!reference) throw new Error('A amostra de voz fixa está indisponível.')
    const key = (agentId || 'default') + ':' + text
    const cached = this.cachedSpeech.get(key)
    if (cached) return cached
    const mp3 = await this.requestSpeech(text, reference)
    this.cachedSpeech.set(key, mp3)
    if (this.cachedSpeech.size > 12) this.cachedSpeech.delete(this.cachedSpeech.keys().next().value!)
    return mp3
  }
}
