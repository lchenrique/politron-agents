import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { COMPUTER_USE_RUNTIMES, CUA_DRIVER_URL, type ComputerUseDriverStatus, type ComputerUseRuntimeStatus } from '../../shared/computer-use'
import { ExternalBrowserProxy, type ExternalBrowserAuthorizer, type ProxyVariant } from './external-browser-proxy'

export const COMPUTER_USE_MCP = 'politron_computer_use'
const INSTRUCTIONS = `Instale o cua-driver (projeto open source trycua/cua, licença MIT): ${CUA_DRIVER_URL}. O Boobot não baixa nem copia o binário sozinho.`
// Mudam instalação ou configuração do próprio driver; o Boo não precisa delas para controlar janelas.
const HIDDEN_TOOLS = new Set(['set_config', 'install_ffmpeg', 'check_for_update', 'replay_trajectory'])
const BASENAME = 'cua-driver.exe'
export const COMPUTER_USE_VARIANT: ProxyVariant = { name: COMPUTER_USE_MCP, label: 'cua-driver', allow: tool => !HIDDEN_TOOLS.has(tool) }

export interface DriverDeps {
  exists(file: string): boolean
  run(file: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string }>
  env: NodeJS.ProcessEnv
  userData: string
  platform: NodeJS.Platform
}
export const defaultDriverDeps = (userData: string): DriverDeps => ({
  exists: existsSync, env: process.env, userData, platform: process.platform,
  run: (file, args, timeoutMs) => new Promise(resolve => execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) =>
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || '') }))),
})

/** Procura o cua-driver (pasta do Boobot, instalação oficial, OpenBot) e confirma que executa; nunca baixa nem copia nada. */
export async function discoverCuaDriver(deps: DriverDeps): Promise<ComputerUseDriverStatus> {
  if (deps.platform !== 'win32') return { state: 'missing', error: 'O Computer Use do Boobot só está disponível no Windows.', instructions: INSTRUCTIONS }
  const local = deps.env.LOCALAPPDATA || ''
  const candidates: Array<{ file: string; source: NonNullable<ComputerUseDriverStatus['source']> }> = [
    { file: join(deps.userData, 'cua-driver', BASENAME), source: 'boobot' },
    ...(local ? [
      { file: join(local, 'Programs', 'Cua', 'cua-driver', 'bin', BASENAME), source: 'cua' as const },
      { file: join(local, 'Programs', 'OpenBot', 'resources', 'cua-driver', 'win32', 'x64', BASENAME), source: 'openbot' as const },
    ] : []),
  ]
  let invalid: ComputerUseDriverStatus | undefined
  for (const { file, source } of candidates) {
    if (!deps.exists(file)) continue
    const result = await deps.run(file, ['--version'], 10_000).catch(() => ({ code: null, stdout: '' }))
    const version = result.stdout.match(/\d+\.\d+\.\d+[\w.+-]*/)?.[0]
    if (result.code === 0 && version) return { state: 'installed', version, path: file, source }
    invalid ??= { state: 'invalid', path: file, source, error: 'O cua-driver encontrado não respondeu a --version. Reinstale-o.', instructions: INSTRUCTIONS }
  }
  return invalid ?? { state: 'missing', error: 'cua-driver não instalado.', instructions: INSTRUCTIONS }
}

export const computerUseRuntimeSupported = (runtime: string) => (COMPUTER_USE_RUNTIMES as readonly string[]).includes(runtime)
export function computerUseRuntimes(): ComputerUseRuntimeStatus[] {
  return ['codex', 'claude', 'pi', 'opencode'].map(runtime => computerUseRuntimeSupported(runtime)
    ? { runtime, supported: true, note: 'Ferramentas do driver via MCP, só durante uma execução autorizada.' }
    : { runtime, supported: false, note: 'Este motor não aceita servidores MCP por sessão; sem Computer Use.' })
}

const short = (value: unknown, max = 80) => typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, max) : undefined
/** Resumo curto para o histórico: nome da ferramenta e alvo, nunca o texto digitado, a área de transferência ou o conteúdo da tela. */
export function computerUseSummary(tool: string, args: Record<string, unknown>): string {
  const parts: string[] = []
  const target = short(args.name) ?? short(args.path) ?? short(args.launch_path) ?? short(args.bundle_id) ?? short(args.url)
  if (target) parts.push(target)
  if (typeof args.pid === 'number') parts.push(`pid ${args.pid}`)
  if (typeof args.window_id === 'number') parts.push(`janela ${args.window_id}`)
  if (typeof args.element_index === 'number') parts.push(`elemento ${args.element_index}`)
  const key = short(args.key, 20) ?? (Array.isArray(args.keys) ? args.keys.filter(item => typeof item === 'string').join('+').slice(0, 40) : undefined)
  if (key) parts.push(`tecla ${key}`)
  const typed = typeof args.text === 'string' ? args.text : typeof args.value === 'string' ? args.value : undefined
  if (typed !== undefined) parts.push(`${typed.length} caracteres (conteúdo não registrado)`)
  return `Windows · ${tool}${parts.length ? ` · ${parts.join(' · ')}` : ''}`
}

/** Um proxy `cua-driver mcp` por conversa+Boo. Existe só enquanto a sessão existe e recusa chamadas sem execução e autorização vigentes. */
export class ComputerUseSessions {
  private readonly proxies = new Map<string, ExternalBrowserProxy>()
  private readonly failures = new Set<string>()
  private readonly idle = new Map<string, NodeJS.Timeout>()
  constructor(private readonly driver: () => Promise<ComputerUseDriverStatus>, private readonly startTimeoutMs = 15_000, private readonly idleMs = 10 * 60_000,
    private readonly create: (command: string, authorize: ExternalBrowserAuthorizer) => ExternalBrowserProxy = (command, authorize) =>
      new ExternalBrowserProxy({ command, args: ['mcp'], env: {} }, authorize, this.startTimeoutMs, '', () => null,
        COMPUTER_USE_VARIANT)) {}
  ready(key: string): boolean { return !!this.proxies.get(key)?.ready }
  /** Registro MCP da sessão, ou null (driver ausente, falha anterior ou erro ao iniciar). */
  async mcp(key: string, authorize: ExternalBrowserAuthorizer): Promise<{ url: string; token: string; tools: string[] } | null> {
    if (this.failures.has(key)) return null
    this.cancelIdle(key)
    try {
      let proxy = this.proxies.get(key)
      if (!proxy) {
        const driver = await this.driver()
        if (driver.state !== 'installed' || !driver.path) return null
        proxy = this.create(driver.path, authorize)
        this.proxies.set(key, proxy)
      }
      await proxy.start()
      return { url: proxy.url, token: proxy.token, tools: proxy.toolNames }
    } catch {
      this.close(key); this.failures.add(key)
      return null
    }
  }
  retry(key: string) { this.failures.delete(key) }
  private cancelIdle(key: string) { clearTimeout(this.idle.get(key)); this.idle.delete(key) }
  /** Fim da execução: sem autorização o servidor morre já; com autorização fica ocioso e inerte (recusa chamadas sem execução) por um prazo, para a thread do Codex não ser recriada a cada turno. */
  release(key: string, keep: boolean) {
    this.cancelIdle(key)
    if (!keep || !this.proxies.has(key)) { this.close(key); return }
    this.idle.set(key, setTimeout(() => this.close(key), this.idleMs).unref())
  }
  close(key: string) { this.cancelIdle(key); const proxy = this.proxies.get(key); this.proxies.delete(key); void proxy?.close() }
  closeWhere(match: (conversationId: string, agentId: string) => boolean) {
    for (const key of [...this.proxies.keys()]) { const [conversationId, agentId] = key.split(':'); if (match(conversationId, agentId)) this.close(key) }
  }
  closeAll() { for (const key of [...this.proxies.keys()]) this.close(key) }
}
