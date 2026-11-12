import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { BrowserWindow, ipcMain } from 'electron'
import { parse, type ParseError } from 'jsonc-parser'
import type { ProviderId, ProviderInfo, ProviderModel, ProviderModelCatalog, ProviderSnapshot } from '../../../shared/providers'
import { execCli } from '../cli-launch'

const execFileAsync = promisify(execFile)

type ConfigResult = { value: unknown; reason?: string; missing?: boolean }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

async function readJson(path: string, jsonc = false): Promise<ConfigResult> {
  try {
    const content = await fs.readFile(path, 'utf8')
    if (!jsonc) return { value: JSON.parse(content) as unknown }
    const errors: ParseError[] = []
    const value: unknown = parse(content, errors, { allowTrailingComma: true })
    if (errors.length) return { value: null, reason: 'Arquivo de configuração inválido.' }
    return { value }
  } catch (error: unknown) {
    if (record(error) && error.code === 'ENOENT') return { value: null, missing: true, reason: 'Arquivo de configuração não encontrado.' }
    return { value: null, reason: 'Arquivo de configuração inválido ou ilegível.' }
  }
}

async function piModels(home: string): Promise<ProviderModelCatalog> {
  const config = await readJson(join(home, '.pi', 'agent', 'models.json'))
  const providers = record(config.value) ? config.value.providers : undefined
  if (!record(providers)) return { models: null, reason: config.reason || 'Catálogo de provedores ausente ou inválido na configuração.' }
  const models: ProviderModel[] = []
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!record(provider) || !Array.isArray(provider.models)) continue
    for (const model of provider.models as unknown[]) {
      if (record(model) && nonempty(model.id)) models.push({ id: `${providerId}/${model.id}`, name: nonempty(model.name) ? model.name : model.id })
    }
  }
  return { models, source: 'configuration' }
}

async function openCodeModels(home: string): Promise<ProviderModelCatalog> {
  let config = await readJson(join(home, '.config', 'opencode', 'opencode.json'))
  if (config.missing) config = await readJson(join(home, '.config', 'opencode', 'opencode.jsonc'), true)
  const providers = record(config.value) ? config.value.provider : undefined
  if (!record(providers)) return { models: null, reason: config.reason || 'Catálogo de provedores ausente ou inválido na configuração.' }
  const models: ProviderModel[] = []
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!record(provider) || !record(provider.models)) continue
    for (const [id, model] of Object.entries(provider.models)) {
      if (nonempty(id) && record(model)) models.push({ id: `${providerId}/${id}`, name: nonempty(model.name) ? model.name : id })
    }
  }
  return { models, source: 'configuration' }
}

const MODEL_READERS: Partial<Record<ProviderId, (home: string) => Promise<ProviderModelCatalog>>> = { pi: piModels }

export interface ProviderDetectionOptions {
  runtimeModels?: Partial<Record<ProviderId, (binaryPath?: string) => Promise<ProviderModelCatalog>>>
  modelTimeoutMs?: number
  /** Provedor por API key: sem binário no PATH, o estado vem da chave salva. */
  hasOpenCodeKey?: () => Promise<boolean>
}

/** Limita a espera sem encerrar runtimes que podem estar atendendo conversas. */
async function readModels(provider: ProviderId, home: string, options: ProviderDetectionOptions, binaryPath?: string): Promise<ProviderModelCatalog> {
  const runtimeLoader = options.runtimeModels?.[provider]
  const localLoader = MODEL_READERS[provider]
  const load = runtimeLoader ? () => runtimeLoader(binaryPath) : localLoader ? () => localLoader(home) : undefined
  if (!load) return { models: null, reason: 'Consulta de modelos indisponível para este CLI no Boobot.' }
  const timeoutMs = Number.isFinite(options.modelTimeoutMs) ? Math.max(1, Math.min(options.modelTimeoutMs!, 30_000)) : 12_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo limite ao consultar modelos.')), timeoutMs) }),
    ])
  } catch (error: unknown) {
    return { models: null, reason: error instanceof Error ? error.message : 'Não foi possível consultar os modelos.' }
  } finally { if (timer) clearTimeout(timer) }
}

/** Binário e nome de exibição de cada CLI que o Politron sabe procurar, no estilo do Paseo. */
const PROVIDERS: { id: ProviderId; name: string; binary: string }[] = [
  { id: 'codex', name: 'Codex', binary: 'codex' },
  { id: 'claude', name: 'Claude Code', binary: 'claude' },
  // OpenCode entra por API key (Console), não pelo CLI instalado.
  { id: 'opencode', name: 'OpenCode', binary: 'api' },
  { id: 'pi', name: 'Pi', binary: 'pi' },
]

/** Onde o shell acharia o binário, sem precisar de uma subshell: `where` no Windows, `which` nos outros. */
async function resolvePaths(binary: string): Promise<string[]> {
  const [command, args] = process.platform === 'win32' ? ['where', [binary]] : ['which', ['-a', binary]]
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 5_000, windowsHide: true })
    return [...new Set(stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean))]
  } catch { return [] }
}

/** Primeira linha de `<binário> --version`; CLIs instalados sem terminar a configuração ainda contam como encontrados. */
async function probe(provider: (typeof PROVIDERS)[number], home: string, options: ProviderDetectionOptions): Promise<ProviderInfo> {
  if (provider.binary === 'api') {
    const hasKey = options.hasOpenCodeKey ? await options.hasOpenCodeKey().catch(() => false) : false
    if (!hasKey) return { ...provider, found: false, operational: false, executable: false, version: null, path: null, models: null, modelReason: 'Informe a chave da API do OpenCode em Configurações → Provedores.' }
    const catalog = await readModels(provider.id, home, options)
    const executable = !!catalog.models?.length
    return { ...provider, found: true, operational: executable, executable, version: 'API', path: null, models: catalog.models, modelSource: catalog.source, modelReason: catalog.reason || (!executable ? 'A chave está salva, mas o catálogo de modelos não respondeu.' : undefined) }
  }
  const candidates = await resolvePaths(provider.binary)
  let path = candidates[0]
  if (!path) return { ...provider, found: false, version: null, path: null, models: null }
  let version: string | null = null
  for (const candidate of candidates) {
    try {
      // O launcher resolve os shims npm sem concatenar argumentos em um comando de shell.
      const { stdout, stderr } = await execCli(candidate, ['--version'], { timeout: 8_000, windowsHide: true })
      version = (stdout || stderr).split(/\r?\n/).map(line => line.trim()).find(Boolean) || null
      path = candidate
      break
    } catch { /* Uma instalação antiga no PATH não deve esconder a próxima instalação válida. */ }
  }
  const catalog = await readModels(provider.id, home, options, path)
  // Uma resposta válida do protocolo do runtime comprova disponibilidade mesmo
  // quando o comando auxiliar --version falha ou demora para iniciar.
  const runtimeOperational = catalog.source === 'runtime' && Array.isArray(catalog.models)
  const operational = !!version || runtimeOperational
  const executable = operational && !!catalog.models?.length && (runtimeOperational || (provider.id === 'opencode' && catalog.source === 'configuration'))
  return { ...provider, found: true, operational, executable, version, path, models: catalog.models, modelSource: catalog.source, modelReason: catalog.reason || (!operational ? 'Executável localizado, mas o comando não respondeu corretamente.' : undefined) }
}

export async function detectProviders(home = homedir(), options: ProviderDetectionOptions = {}): Promise<ProviderInfo[]> {
  return Promise.all(PROVIDERS.map(provider => probe(provider, home, options)))
}

/** A consulta normal devolve o cache; somente refresh/detect refaz a varredura. */
export function registerProviderDetectionIpc(
  options: ProviderDetectionOptions = {},
  registry?: { list(): Promise<ProviderSnapshot>; refresh(): Promise<ProviderSnapshot>; onChanged(listener: (snapshot: ProviderSnapshot) => void): () => void },
  routing?: import('../../hosts/rpc').HostRouting,
): () => void {
  const load = registry || {
    list: async () => ({ providers: await detectProviders(homedir(), options), checkedAt: new Date().toISOString() }),
    refresh: async () => ({ providers: await detectProviders(homedir(), options), checkedAt: new Date().toISOString() }),
    onChanged: () => () => undefined,
  }
  const authorized = (event: Electron.IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed?.()) throw new Error('Janela do Politron indisponível.')
  }
  const handlers = { 'providers:list': () => load.list(), 'providers:refresh': () => load.refresh(), 'providers:detect': () => load.refresh().then(snapshot => snapshot.providers) }
  for (const [method, handler] of Object.entries(handlers)) {
    routing?.register(method, handler)
    ipcMain.handle(method, event => { authorized(event); return routing ? routing.invoke(method, [], handler) : handler() })
  }
  const off = load.onChanged(snapshot => {
    if (routing && !routing.publish({ channel: 'providers:changed', data: snapshot })) return
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('providers:changed', snapshot)
  })
  return () => {
    off()
    for (const channel of ['providers:list', 'providers:refresh', 'providers:detect']) ipcMain.removeHandler(channel)
  }
}
