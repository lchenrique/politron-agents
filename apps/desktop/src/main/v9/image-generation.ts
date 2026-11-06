import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_IMAGE_MODELS, type ImageApiProvider, type ImageGenerationProvider, type ImageGenerationSettings, type ImageGenerationStatus } from '../../shared/v9'
import { spawnCli } from './cli-launch'

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'
export type GeneratedImage = { bytes: Buffer; mimeType: ImageMime }
export type SecretStore = { has(): Promise<boolean>; load(): Promise<string | null>; save(value: string): Promise<void>; clear(): Promise<void> }
type CliResult = { code: number | null; stdout: string; stderr: string }
export type CliRunner = (binary: string, args: string[], options: { cwd?: string; timeout: number }) => Promise<CliResult>

const PROVIDERS: ImageGenerationProvider[] = ['off', 'codex', 'antigravity', 'api']
const API_PROVIDERS: ImageApiProvider[] = ['openai', 'gemini', 'openrouter']
const MODEL_ID = /^[a-z0-9][a-z0-9._/:-]{1,119}$/i
const SIZE = /^(auto|\d{3,4}x\d{3,4})$/
const CLI_TIMEOUT = 5 * 60_000
const API_TIMEOUT = 3 * 60_000
export const NOT_CONFIGURED = 'A geração de imagens não está configurada. Peça ao usuário para escolher um provedor em Configurações → Geração de imagens (Codex, Antigravity ou uma chave de API).'

export function sniffImage(bytes: Uint8Array): ImageMime | null {
  const at = (offset: number, signature: number[]) => signature.every((value, index) => bytes[offset + index] === value)
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return null
}
export const imageExtension = (mime: ImageMime) => mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp'

function decoded(base64: string): GeneratedImage {
  const bytes = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64')
  const mimeType = sniffImage(bytes)
  if (!mimeType) throw new Error('O provedor respondeu, mas o conteúdo não é uma imagem PNG, JPEG ou WebP.')
  return { bytes, mimeType }
}

/** Primeira imagem base64 em qualquer formato de resposta conhecido (Images API, Interactions, generateContent, OpenRouter). */
export function findImageData(body: unknown, depth = 0): string | null {
  if (!body || typeof body !== 'object' || depth > 8) return null
  const value = body as Record<string, unknown>
  if (typeof value.b64_json === 'string') return value.b64_json
  for (const key of ['inlineData', 'inline_data']) {
    const inline = value[key] as Record<string, unknown> | undefined
    if (inline && typeof inline.data === 'string') return inline.data
  }
  if (value.type === 'image' && typeof value.data === 'string') return value.data
  if (typeof value.url === 'string' && value.url.startsWith('data:image/')) return value.url
  for (const child of Array.isArray(body) ? body : Object.values(value)) {
    const found = findImageData(child, depth + 1)
    if (found) return found
  }
  return null
}

export class EncryptedKey implements SecretStore {
  constructor(private readonly path: string) {}
  async has() { try { return (await fs.stat(this.path)).isFile() } catch { return false } }
  async load() {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
      return safeStorage.decryptString(await fs.readFile(this.path))
    } catch (error: unknown) { if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null; throw error }
  }
  async save(value: string) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
    await fs.writeFile(this.path, safeStorage.encryptString(value), { mode: 0o600 })
  }
  async clear() { await fs.rm(this.path, { force: true }) }
}

/** Mesma leitura do CodexRuntime: servidores MCP do config.toml, desligados por nome. */
async function codexMcpServerNames(file: string): Promise<string[]> {
  try { return [...new Set([...(await fs.readFile(file, 'utf8')).matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm)].map(match => match[1]))] } catch { return [] }
}

/** stdin fechado na hora: `codex exec` e `agy -p` esperam EOF antes de começar. */
const runCli: CliRunner = (binary, args, { cwd, timeout }) => new Promise((resolve, reject) => {
  const child = spawnCli(binary, args, { cwd, windowsHide: true, stdio: 'pipe' })
  let stdout = '', stderr = ''
  const timer = setTimeout(() => { child.kill(); reject(new Error('A geração de imagem excedeu o tempo limite de 5 minutos.')) }, timeout)
  child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-2_000_000) })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  child.stdin.end()
})

/** Imagem mais recente criada depois de `since` nas pastas indicadas (até dois níveis abaixo). */
async function newestImage(directories: string[], since: number): Promise<GeneratedImage | null> {
  let best: { path: string; time: number } | null = null
  const visit = async (directory: string, depth: number) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { if (depth < 2) await visit(path, depth + 1); continue }
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue
      const time = (await fs.stat(path).catch(() => null))?.mtimeMs ?? 0
      if (time >= since && (!best || time > best.time)) best = { path, time }
    }
  }
  for (const directory of directories) await visit(directory, 0)
  if (!best) return null
  const bytes = await fs.readFile((best as { path: string }).path)
  const mimeType = sniffImage(bytes)
  return mimeType ? { bytes, mimeType } : null
}

const enginePrompt = (prompt: string, size: string) => [
  'Gere UMA imagem com a sua ferramenta nativa de geração de imagens, a partir da descrição abaixo.',
  'Não execute comandos, não crie nem edite arquivos e não peça confirmação. Só gere a imagem e responda "ok".',
  size !== 'auto' ? `Tamanho/proporção desejado: ${size}.` : '',
  '', 'Descrição:', prompt,
].join('\n')

export class ImageGenerationService {
  private readonly settingsPath: string
  private readonly keys: Record<ImageApiProvider, SecretStore>
  private readonly fetcher: typeof fetch
  private readonly run: CliRunner
  private readonly home: string
  constructor(directory: string, options: { keys?: Partial<Record<ImageApiProvider, SecretStore>>; fetcher?: typeof fetch; run?: CliRunner; home?: string } = {}) {
    this.settingsPath = join(directory, 'image-generation.json')
    this.keys = Object.fromEntries(API_PROVIDERS.map(id => [id, options.keys?.[id] || new EncryptedKey(join(directory, `image-key-${id}.enc`))])) as Record<ImageApiProvider, SecretStore>
    this.fetcher = options.fetcher || fetch
    this.run = options.run || runCli
    this.home = options.home || homedir()
  }

  async settings(): Promise<ImageGenerationSettings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'))
      const apiProvider = API_PROVIDERS.includes(raw?.apiProvider) ? raw.apiProvider as ImageApiProvider : 'openai'
      return { provider: PROVIDERS.includes(raw?.provider) ? raw.provider : 'off', apiProvider, model: typeof raw?.model === 'string' && MODEL_ID.test(raw.model) ? raw.model : DEFAULT_IMAGE_MODELS[apiProvider] }
    } catch { return { provider: 'off', apiProvider: 'openai', model: DEFAULT_IMAGE_MODELS.openai } }
  }

  async status(): Promise<ImageGenerationStatus> {
    const [settings, codex, antigravity, ...keys] = await Promise.all([this.settings(), this.engineAvailability('codex'), this.engineAvailability('antigravity'), ...API_PROVIDERS.map(id => this.keys[id].has())])
    return { ...settings, keys: Object.fromEntries(API_PROVIDERS.map((id, index) => [id, keys[index]])) as Record<ImageApiProvider, boolean>, engines: { codex, antigravity } }
  }

  async save(input: ImageGenerationSettings, apiKey?: string): Promise<ImageGenerationStatus> {
    if (!input || !PROVIDERS.includes(input.provider) || !API_PROVIDERS.includes(input.apiProvider)) throw new Error('Escolha um provedor de imagens válido.')
    const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : DEFAULT_IMAGE_MODELS[input.apiProvider]
    if (!MODEL_ID.test(model)) throw new Error('Informe um modelo de imagem válido.')
    const key = typeof apiKey === 'string' ? apiKey.trim() : ''
    if (key) {
      if (key.length < 20 || key.length > 500) throw new Error('Informe uma chave de API válida.')
      await this.keys[input.apiProvider].save(key)
    }
    if (input.provider === 'api' && !key && !await this.keys[input.apiProvider].has()) throw new Error('Cole a chave de API do provedor escolhido antes de salvar.')
    await fs.writeFile(this.settingsPath, JSON.stringify({ provider: input.provider, apiProvider: input.apiProvider, model }), { mode: 0o600 })
    return this.status()
  }

  async clearKey(apiProvider: ImageApiProvider): Promise<ImageGenerationStatus> {
    if (!API_PROVIDERS.includes(apiProvider)) throw new Error('Provedor de API inválido.')
    await this.keys[apiProvider].clear()
    return this.status()
  }

  async engineAvailability(engine: 'codex' | 'antigravity'): Promise<{ available: boolean; reason?: string }> {
    const name = engine === 'codex' ? 'Codex' : 'Antigravity'
    try {
      const result = engine === 'codex'
        ? await this.run(this.codexBinary(), ['login', 'status'], { timeout: 15_000 })
        // O agy não tem "login status"; o catálogo de modelos só responde com a conta logada.
        : await this.run(this.agyBinary(), ['models'], { timeout: 20_000 })
      const output = result.stdout + result.stderr
      if (result.code === 0 && (engine === 'antigravity' || /logged in/i.test(output) && !/not logged in/i.test(output))) return { available: true }
      return { available: false, reason: `O ${name} está instalado, mas não parece logado. Faça login no CLI (${engine === 'codex' ? 'codex login' : 'agy'}) e teste de novo.` }
    } catch { return { available: false, reason: `O ${name} não foi encontrado neste computador.` } }
  }

  async generate(prompt: string, size = 'auto'): Promise<GeneratedImage> {
    const text = typeof prompt === 'string' ? prompt.trim().slice(0, 4000) : ''
    if (!text) throw new Error('Descreva a imagem que deve ser gerada.')
    const chosenSize = SIZE.test(size) ? size : 'auto'
    const settings = await this.settings()
    if (settings.provider === 'off') throw new Error(NOT_CONFIGURED)
    if (settings.provider === 'api') return this.generateWithApi(settings, text, chosenSize)
    return settings.provider === 'codex' ? this.generateWithCodex(text, chosenSize) : this.generateWithAntigravity(text, chosenSize)
  }

  private codexBinary() { return process.env.POLITRON_CODEX_BINARY || 'codex' }
  private agyBinary() { return process.platform === 'win32' ? 'agy.exe' : 'agy' }

  /**
   * O Codex grava a saída da ferramenta image_gen em $CODEX_HOME/generated_images/<thread>/.
   * Shell e edição ficam desligados: o Boobot copia o arquivo e aplica as próprias aprovações.
   */
  private async generateWithCodex(prompt: string, size: string): Promise<GeneratedImage> {
    const codexHome = process.env.CODEX_HOME || join(this.home, '.codex')
    const cwd = await fs.mkdtemp(join(tmpdir(), 'boobot-imagem-'))
    const since = Date.now()
    try {
      const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd,
        '--enable', 'image_generation', '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'apps', '--disable', 'computer_use', '--disable', 'browser_use']
      for (const name of await codexMcpServerNames(join(codexHome, 'config.toml'))) args.push('-c', `mcp_servers.${name}.enabled=false`)
      args.push(enginePrompt(prompt, size))
      const result = await this.run(this.codexBinary(), args, { cwd, timeout: CLI_TIMEOUT })
      const thread = /"thread_id"\s*:\s*"([^"]+)"/.exec(result.stdout)?.[1]
      const root = join(codexHome, 'generated_images')
      const image = await newestImage(thread ? [join(root, thread)] : [root], since)
      if (image) return image
      throw new Error(`O Codex não gerou a imagem.${result.code ? ` Código ${result.code}.` : ''} Confira se o login é de uma conta ChatGPT com geração de imagens e tente de novo.${lastError(result)}`)
    } finally { await fs.rm(cwd, { recursive: true, force: true }).catch(() => undefined) }
  }

  /** O agy delega ao subagente image-generator e salva o arquivo na pasta brain da conversa. */
  private async generateWithAntigravity(prompt: string, size: string): Promise<GeneratedImage> {
    const cwd = await fs.mkdtemp(join(tmpdir(), 'boobot-imagem-'))
    const since = Date.now()
    try {
      const result = await this.run(this.agyBinary(), ['-p', enginePrompt(prompt, size), '--output-format', 'stream-json', '--sandbox', '--dangerously-skip-permissions', '--disable-slash-commands'], { cwd, timeout: CLI_TIMEOUT })
      const conversations = [...result.stdout.matchAll(/"conversation_id"\s*:\s*"([^"]+)"/g)].map(match => match[1])
      const brain = join(this.home, '.gemini', 'antigravity-cli', 'brain')
      const image = await newestImage([...new Set(conversations)].map(id => join(brain, id)).concat(cwd), since)
      if (image) return image
      throw new Error(`O Antigravity não gerou a imagem.${result.code ? ` Código ${result.code}.` : ''} Confira o login do agy e tente de novo.${lastError(result)}`)
    } finally { await fs.rm(cwd, { recursive: true, force: true }).catch(() => undefined) }
  }

  private async generateWithApi(settings: ImageGenerationSettings, prompt: string, size: string): Promise<GeneratedImage> {
    const key = await this.keys[settings.apiProvider].load()
    if (!key) throw new Error('A chave de API de imagens não está salva. Configure em Configurações → Geração de imagens.')
    const json = { 'content-type': 'application/json', accept: 'application/json' }
    const request = settings.apiProvider === 'openai'
      ? { url: 'https://api.openai.com/v1/images/generations', headers: { ...json, authorization: `Bearer ${key}` }, body: { model: settings.model, prompt, n: 1, size } }
      : settings.apiProvider === 'openrouter'
        ? { url: 'https://openrouter.ai/api/v1/images', headers: { ...json, authorization: `Bearer ${key}`, 'x-openrouter-title': 'Boobot' }, body: { model: settings.model, prompt, n: 1 } }
        // Interactions API, formato atual da documentação de geração de imagens do Gemini.
        : { url: 'https://generativelanguage.googleapis.com/v1beta/interactions', headers: { ...json, 'x-goog-api-key': key }, body: { model: settings.model, input: prompt, store: false, response_format: { type: 'image', mime_type: 'image/png' } } }
    let response: Response
    try {
      response = await this.fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(API_TIMEOUT), redirect: 'error' })
    } catch { throw new Error('Não foi possível conectar ao provedor de imagens. Confira sua conexão e tente novamente.') }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401 || response.status === 403) throw new Error('A chave de API de imagens foi recusada. Confira a chave e as permissões da conta.')
      throw new Error(`O provedor de imagens respondeu com erro (${response.status}).${detail ? ' ' + apiErrorMessage(detail) : ''}`)
    }
    const data = findImageData(await response.json().catch(() => null))
    if (!data) throw new Error('O provedor respondeu sem imagem. Confira se o modelo escolhido gera imagens.')
    return decoded(data)
  }
}

function lastError(result: CliResult): string {
  const line = result.stderr.split(/\r?\n/).map(item => item.trim()).filter(item => /error|erro/i.test(item)).pop()
  return line ? ` Detalhe: ${line.slice(0, 300)}` : ''
}
function apiErrorMessage(body: string): string {
  try { const parsed = JSON.parse(body); const message = parsed?.error?.message ?? parsed?.message; if (typeof message === 'string') return message.slice(0, 300) } catch { /* texto puro */ }
  return body.slice(0, 300)
}
