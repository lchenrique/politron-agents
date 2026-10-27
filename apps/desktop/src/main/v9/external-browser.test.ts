// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({
  app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false },
}))
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AppService } from './workspace'
import { probeExternalBrowserBridge, readNodeReplServer } from './external-browser'
import type { AgentRuntime } from './agent-runtime'
import type { Approval, WorkspaceEvent } from '../../shared/v9'

// Cada teste inicia SQLite e, nos de proxy, processos node_repl falsos; sob a suíte completa 5s não bastam.
vi.setConfig({ testTimeout: 30000 })
const dirs: string[] = []
const services: AppService[] = []
const env = { codexHome: process.env.CODEX_HOME, localAppData: process.env.LOCALAPPDATA }
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
  process.env.CODEX_HOME = env.codexHome; process.env.LOCALAPPDATA = env.localAppData
})
function temp(prefix: string) { const path = mkdtempSync(join(tmpdir(), prefix)); dirs.push(path); return path }

/** Simula a instalação oficial: plugin chrome, servidor node_repl e manifesto do host nativo. */
function bridge(options: { plugin?: boolean; nodeRepl?: 'missing' | 'present' | 'absent'; host?: boolean } = {}) {
  const codexHome = temp('politron-codex-'), localAppData = temp('politron-local-')
  if (options.plugin !== false) {
    mkdirSync(join(codexHome, 'plugins', 'cache', 'openai-bundled', 'chrome', '1.0.0', 'scripts'), { recursive: true })
    writeFileSync(join(codexHome, 'plugins', 'cache', 'openai-bundled', 'chrome', '1.0.0', 'scripts', 'browser-client.mjs'), '')
  }
  const repl = join(codexHome, 'node_repl.exe')
  if (options.nodeRepl === 'present') writeFileSync(repl, '')
  writeFileSync(join(codexHome, 'config.toml'), options.nodeRepl === 'absent' || !options.nodeRepl ? '' : `[mcp_servers.node_repl]\ncommand = '${repl}'\n`)
  const host = join(localAppData, 'extension-host.exe')
  if (options.host) writeFileSync(host, '')
  mkdirSync(join(localAppData, 'OpenAI', 'extension'), { recursive: true })
  writeFileSync(join(localAppData, 'OpenAI', 'extension', 'com.openai.codexextension.json'), JSON.stringify({ name: 'com.openai.codexextension', path: host }))
  return { codexHome, localAppData }
}

describe('sonda da ponte oficial do navegador externo', () => {
  it('relata cada peça ausente sem expor caminhos', () => {
    const { codexHome, localAppData } = bridge({ plugin: false, nodeRepl: 'missing' })
    const problems = probeExternalBrowserBridge(codexHome, localAppData, 'win32')
    expect(problems.join(' ')).toMatch(/plugin oficial/)
    expect(problems.join(' ')).toMatch(/node_repl.*inexistente/)
    expect(problems.join(' ')).toMatch(/host nativo/)
    expect(problems.join(' ')).not.toContain(codexHome)
    expect(probeExternalBrowserBridge(bridge({ nodeRepl: 'absent', host: true }).codexHome, localAppData, 'win32').join(' ')).toMatch(/node_repl não está configurado/)
  })
  it('não aponta problemas quando plugin, node_repl e host nativo existem', () => {
    const { codexHome, localAppData } = bridge({ nodeRepl: 'present', host: true })
    expect(probeExternalBrowserBridge(codexHome, localAppData, 'win32')).toEqual([])
  })
})

async function setup(computerUse = true, runtime: 'opencode' | 'codex' = 'opencode', agentRuntime?: AgentRuntime) {
  const root = temp('politron-external-')
  const service = new AppService(join(root, 'profile'), agentRuntime); services.push(service)
  const agent = service.saveAgent({ name: 'Boo Externo', runtime, model: runtime === 'codex' ? 'gpt-5.4' : 'opencode/big-pickle', instructions: 'Teste.', canWrite: false, computerUse, approvalMode: 'bypass' })
  const workspace = await service.saveWorkspace({ name: 'QA', path: root, permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit', computerUse: 'inherit' } })
  const conversation = service.saveConversation({ name: 'QA', workspaceId: workspace.id, agentIds: [agent.id] })
  const owner = { workspaceId: workspace.id, conversationId: conversation.id, agentId: agent.id }
  const context = { run: { id: 'run-test', workspaceId: workspace.id, workspacePath: root, planMode: false }, agent, conversation, signal: new AbortController().signal,
    message: { id: 'message-test', conversationId: conversation.id, text: '', status: 'running', role: 'assistant', author: agent.name, agentId: agent.id, runId: 'run-test', createdAt: '' } }
  const broker = service as unknown as { tools(context: unknown): { name: string }[]; callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown> }
  return { root, service, broker, context, owner }
}

describe('navegador externo por conversa e agente', () => {
  it('fica desativado por padrão e a ferramenta recusa sem autorização', async () => {
    Object.assign(process.env, { CODEX_HOME: bridge().codexHome })
    const { service, broker, context, owner } = await setup()
    expect(service.externalBrowserStatus(owner).granted).toBe(false)
    expect(broker.tools(context).map(tool => tool.name)).toContain('external_browser_status')
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/não autorizou/)
  })
  it('autorização explícita persiste, ponte ausente gera erro claro e revogação bloqueia de novo', async () => {
    const paths = bridge({ nodeRepl: 'missing' })
    Object.assign(process.env, { CODEX_HOME: paths.codexHome, LOCALAPPDATA: paths.localAppData })
    const { root, service, broker, context, owner } = await setup()
    service.setExternalBrowserGrant(owner, true)
    expect(service.externalBrowserStatus(owner).granted).toBe(true)
    expect(service.externalBrowserStatus({ ...owner, agentId: 'outro' }).granted).toBe(false)
    service.dispose(); services.splice(services.indexOf(service), 1)
    const reopened = new AppService(join(root, 'profile')); services.push(reopened)
    expect(reopened.externalBrowserStatus(owner).granted).toBe(true)
    const reopenedBroker = reopened as unknown as typeof broker
    await expect(reopenedBroker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/indisponível.*node_repl/)
    expect(reopened.snapshot().conversations.length).toBeGreaterThan(0)
    reopened.setExternalBrowserGrant(owner, false)
    expect(reopened.externalBrowserStatus(owner).granted).toBe(false)
    await expect(reopenedBroker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/não autorizou/)
  })
  it('com a ponte detectada não simula acesso: nenhuma aba é lida', async () => {
    const paths = bridge({ nodeRepl: 'present', host: true })
    Object.assign(process.env, { CODEX_HOME: paths.codexHome, LOCALAPPDATA: paths.localAppData })
    const { service, broker, context, owner } = await setup()
    service.setExternalBrowserGrant(owner, true)
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/nenhuma aba foi acessada/)
  })
  it('lê comando, argumentos e ambiente do node_repl declarado pelo Codex', () => {
    const codexHome = temp('politron-codex-')
    writeFileSync(join(codexHome, 'config.toml'), [
      '[mcp_servers.outro]', "command = 'nao-usar'", '',
      '[mcp_servers.node_repl]', "command = 'C:\\Codex\\node_repl.exe'", 'args = ["--modo", "repl"]', 'startup_timeout_sec = 120.0', '',
      '[mcp_servers.node_repl.env]', 'BROWSER_USE_AVAILABLE_BACKENDS = "chrome,iab"', "NODE_REPL_TRUSTED_SERVICES = '{\"browser\":\"C:/x/browser-service.mjs\"}'", '',
      '[outra_secao]', 'chave = "valor"',
    ].join('\n'))
    expect(readNodeReplServer(codexHome)).toEqual({
      command: 'C:\\Codex\\node_repl.exe', args: ['--modo', 'repl'],
      env: { BROWSER_USE_AVAILABLE_BACKENDS: 'chrome,iab', NODE_REPL_TRUSTED_SERVICES: '{"browser":"C:/x/browser-service.mjs"}' },
    })
    writeFileSync(join(codexHome, 'config.toml'), '')
    expect(readNodeReplServer(codexHome)).toBeNull()
  })
  it('recusa autorizar agente sem uso de navegador e dados de dono inválidos', async () => {
    const { service, broker, context, owner } = await setup(false)
    expect(() => service.setExternalBrowserGrant(owner, true)).toThrow(/não pode usar navegador/)
    expect(() => service.setExternalBrowserGrant({ ...owner, agentId: 42 } as never, false)).toThrow(/inválid/)
    expect(broker.tools(context).map(tool => tool.name)).not.toContain('external_browser_status')
  })
})

const fixture = fileURLToPath(new URL('./test-fixtures/fake-node-repl.mjs', import.meta.url))
type Registration = { url: string; token: string; tools: string[] }
type Mediated = { externalBrowserMcp(context: unknown): Promise<Registration | null>; contexts: Map<string, unknown>; approvalWaiters: Map<string, unknown>
  authorizeExternalBrowserCall(owner: unknown, runId: string | undefined, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string | null> }

/** Ponte injetada: node_repl falso no lugar do oficial, que está quebrado na máquina real. */
function fakeBridge(service: AppService, command = process.execPath, problems: string[] = []) {
  const log = join(temp('politron-repl-log-'), 'calls.log')
  service.externalBrowserBridge = { probe: () => problems, upstream: () => ({ command, args: [fixture], env: { FAKE_NODE_REPL_LOG: log } }) }
  return log
}
const calls = (log: string) => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0

describe('proxy mediado do navegador externo no AppService', () => {
  it('sem autorização o proxy não é registrado e o node_repl não é iniciado', async () => {
    const { service, broker, context } = await setup(true, 'codex')
    const log = fakeBridge(service)
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/não autorizou/)
    expect(calls(log)).toBe(0)
  })

  it('com autorização e ponte íntegra o js segue fail-closed: proxy não registrado, node_repl não iniciado e diagnóstico claro', async () => {
    const { service, broker, context, owner } = await setup(true, 'codex')
    const log = fakeBridge(service)
    service.setExternalBrowserGrant(owner, true)
    const mediated = service as unknown as Mediated
    mediated.contexts.set(context.run.id, context)
    expect(service.externalBrowserStatus(owner).problems.join(' ')).toMatch(/fail-closed/)
    expect(await mediated.externalBrowserMcp(context)).toBeNull()
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/indisponível.*fail-closed.*nenhuma aba foi acessada/)
    expect(calls(log)).toBe(0)
  })

  /** Aprovação mediada, exercitada direto: hoje nenhum js chega a ela, mas ela continua vinculada e cancelável. */
  async function mediation() {
    const { service, context, owner } = await setup(true, 'codex')
    service.setExternalBrowserGrant(owner, true)
    const mediated = service as unknown as Mediated
    mediated.contexts.set(context.run.id, context)
    const approvals: Approval[] = []
    service.on('workspace-event', (event: WorkspaceEvent) => { if (event.type === 'approval') approvals.push(event.approval) })
    return { service, context, owner, mediated, approvals }
  }
  const pending = async (approvals: Approval[]) => { for (let i = 0; i < 100 && !approvals.some(item => item.status === 'pending'); i++) await new Promise(resolve => setTimeout(resolve, 5)); return approvals.find(item => item.status === 'pending')! }

  it('aprovação por conversa e agente pergunta mesmo em bypass, sem segredos e com truncamento explícito', async () => {
    const { service, context, owner, mediated, approvals } = await mediation()
    const code = `await tab.goto("https://exemplo.com/conta?token=segredo#frag"); await tab.fill("#senha", "hunter2"); ${'tab.click(1);'.repeat(600)}`
    const decision = mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code }, new AbortController().signal)
    const approval = await pending(approvals)
    expect(approval).toMatchObject({ kind: 'browser', runId: context.run.id, conversationId: owner.conversationId, agentId: owner.agentId })
    expect(approval.details.action).toMatch(/navegador externo.*https:\/\/exemplo\.com\/conta/)
    expect(approval.details.truncated).toBe(true)
    expect(approval.details.task).toMatch(/\[prévia truncada: \d+ de \d+ caracteres exibidos\]$/)
    expect(JSON.stringify(approval.details)).not.toMatch(/segredo|frag|hunter2/)
    await service.respondApproval(approval.id, false)
    await expect(decision).resolves.toMatch(/negou/)
  })

  it('desconexão da requisição cancela a aprovação pendente e o waiter', async () => {
    const { service, context, owner, mediated, approvals } = await mediation()
    const request = new AbortController()
    const decision = mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code: 'tab.click("#ok")' }, request.signal)
    const approval = await pending(approvals)
    request.abort()
    await expect(decision).resolves.toMatch(/nada foi executado/)
    expect(service.store.approval(approval.id)?.status).toBe('interrupted')
    expect(mediated.approvalWaiters.has(approval.id)).toBe(false)
    await expect(service.respondApproval(approval.id, true)).rejects.toThrow(/não está mais pendente/)
    expect(await mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code: '1' }, request.signal)).toMatch(/nada foi executado/)
  })

  it('cancelamento antes de registrar o waiter restaura o estado da execução', async () => {
    const { service, context, owner, mediated } = await mediation()
    const request = new AbortController()
    const put = service.store.putApproval.bind(service.store)
    vi.spyOn(service.store, 'putApproval').mockImplementation(approval => {
      put(approval)
      if (approval.status === 'pending') request.abort()
    })
    await expect(mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code: 'tab.click("#ok")' }, request.signal)).resolves.toMatch(/cancelada/)
    expect(service.store.runs().find(run => run.id === context.run.id)?.status).toBe('running')
    expect(service.store.approvals().at(-1)?.status).toBe('interrupted')
  })

  it('revogação durante a espera da aprovação impede a execução', async () => {
    const { service, context, owner, mediated, approvals } = await mediation()
    const decision = mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code: 'tab.click("#ok")' }, new AbortController().signal)
    const approval = await pending(approvals)
    service.store.saveExternalBrowserGrant(owner.conversationId, owner.agentId, false)
    await service.respondApproval(approval.id, true)
    await expect(decision).resolves.toMatch(/revogado/)
  })

  it('só autoriza a execução vinculada ao proxy: outra execução, outro agente ou nenhuma são recusados sem aprovação', async () => {
    const { context, owner, mediated, approvals } = await mediation()
    const other = { ...context, run: { ...context.run, id: 'run-outra' } }
    mediated.contexts.set(other.run.id, { ...other, agent: { ...context.agent, id: 'outro-agente' } })
    const signal = new AbortController().signal
    expect(await mediated.authorizeExternalBrowserCall(owner, undefined, 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
    expect(await mediated.authorizeExternalBrowserCall(owner, 'run-inexistente', 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
    expect(await mediated.authorizeExternalBrowserCall(owner, 'run-outra', 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
    expect(approvals).toHaveLength(0)
  })

  it('node_repl que não inicia ou ponte com peças ausentes falham fechadas e o app segue', async () => {
    const { service, broker, context, owner } = await setup(true, 'codex')
    fakeBridge(service, join(tmpdir(), 'node_repl-inexistente.exe'))
    service.setExternalBrowserGrant(owner, true)
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/nenhuma aba foi acessada/)
    const log = fakeBridge(service, process.execPath, ['servidor MCP node_repl configurado aponta para um executável inexistente'])
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
    await expect(broker.callTool(context, 'external_browser_status', {})).rejects.toThrow(/indisponível.*node_repl/)
    expect(calls(log)).toBe(0)
    expect(service.snapshot().conversations.length).toBeGreaterThan(0)
  })

  it('agentes fora do Codex não recebem o proxy', async () => {
    const { service, context, owner } = await setup(true, 'opencode')
    fakeBridge(service)
    service.setExternalBrowserGrant(owner, true)
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
  })

  it('a execução do agente não registra o proxy na thread do Codex, nem com autorização', async () => {
    const threads: unknown[] = []
    const runtime = Object.assign(new EventEmitter(), {
      supportsImages: false, models: async () => [], respond: () => undefined, interrupt: async () => undefined, close: () => undefined,
      thread: async (...args: unknown[]) => { threads.push(args[5]); return { id: `thread-${threads.length}`, history: 'empty' as const } },
      send: async () => ({ turn: { id: 'turn', status: 'failed', error: { message: 'fim do teste' } } }),
    }) as unknown as AgentRuntime
    const { service, owner } = await setup(true, 'codex', runtime)
    fakeBridge(service)
    const waitThread = async (count: number) => { for (let i = 0; i < 300 && threads.length < count; i++) await new Promise(resolve => setTimeout(resolve, 10)) }
    await service.send(owner.conversationId, 'sem autorização'); await waitThread(1)
    service.setExternalBrowserGrant(owner, true)
    await service.send(owner.conversationId, 'com autorização'); await waitThread(2)
    expect(threads[0]).toBeUndefined()
    expect(threads).toHaveLength(2)
    expect(threads[1]).toBeUndefined()
  })
})
