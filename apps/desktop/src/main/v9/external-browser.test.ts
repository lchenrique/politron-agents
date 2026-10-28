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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppService } from './workspace'
import { browserClientPath, externalBrowserGuide, probeExternalBrowserBridge, readNodeReplServer } from './external-browser'
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

async function setup(computerUse = true, runtime: 'opencode' | 'codex' | 'claude' = 'opencode', agentRuntime?: AgentRuntime) {
  const root = temp('politron-external-')
  const service = new AppService(join(root, 'profile'), agentRuntime); services.push(service)
  const agent = service.saveAgent({ name: 'Boo Externo', runtime, model: runtime === 'codex' ? 'gpt-5.4' : runtime === 'claude' ? 'claude-sonnet-4-5' : 'opencode/big-pickle', instructions: 'Teste.', canWrite: false, computerUse, approvalMode: 'bypass' })
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
    await expect(broker.callTool(context, 'external_browser_status', {})).resolves.toMatch(/granted: false[\s\S]*external_browser_request/)
  })
  it('configuração global autoriza todas as conversas, mas só agentes com uso do computador', async () => {
    Object.assign(process.env, { CODEX_HOME: bridge().codexHome })
    const { service, owner } = await setup()
    expect(service.settingsPreferences().externalBrowserAlways).toBe(false)
    service.saveExternalBrowserAlways(true)
    expect(service.settingsPreferences().externalBrowserAlways).toBe(true)
    expect(service.externalBrowserStatus(owner).granted).toBe(true)
    expect(service.externalBrowserStatus({ ...owner, conversationId: 'inexistente' }).granted).toBe(false)
    service.saveExternalBrowserAlways(false)
    expect(service.externalBrowserStatus(owner).granted).toBe(false)
    const blocked = await setup(false)
    blocked.service.saveExternalBrowserAlways(true)
    expect(blocked.service.externalBrowserStatus(blocked.owner).granted).toBe(false)
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
    await expect(reopenedBroker.callTool(context, 'external_browser_status', {})).resolves.toMatch(/granted: true[\s\S]*node_repl[\s\S]*reinstale o plugin Browser pelo Codex\/ChatGPT/)
    expect(reopened.snapshot().conversations.length).toBeGreaterThan(0)
    reopened.setExternalBrowserGrant(owner, false)
    expect(reopened.externalBrowserStatus(owner).granted).toBe(false)
    await expect(reopenedBroker.callTool(context, 'external_browser_status', {})).resolves.toMatch(/granted: false/)
  })
  it('com a ponte detectada não simula acesso: nenhuma aba é lida', async () => {
    const paths = bridge({ nodeRepl: 'present', host: true })
    Object.assign(process.env, { CODEX_HOME: paths.codexHome, LOCALAPPDATA: paths.localAppData })
    const { service, broker, context, owner } = await setup()
    service.setExternalBrowserGrant(owner, true)
    await expect(broker.callTool(context, 'external_browser_status', {})).resolves.toMatch(/granted: true[\s\S]*problems: nenhum[\s\S]*não está ativo nesta execução/)
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
    // env_vars do Codex: repassa o ambiente comum, nunca as credenciais de turno do app Codex.
    writeFileSync(join(codexHome, 'config.toml'), ['[mcp_servers.node_repl]', "command = 'C:\\Codex\\node_repl.exe'", 'env_vars = ["BROWSER_USE_ACCESS_EXECUTOR_ID", "BROWSER_USE_ACCESS_PIPE_PATH", "CODEX_WINDOWS_REGISTERED_CORE"]'].join('\n'))
    expect(readNodeReplServer(codexHome, { BROWSER_USE_ACCESS_EXECUTOR_ID: 'x', BROWSER_USE_ACCESS_PIPE_PATH: 'y', CODEX_WINDOWS_REGISTERED_CORE: '1' })?.env).toEqual({ CODEX_WINDOWS_REGISTERED_CORE: '1' })
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
type Mediated = { externalBrowserMcp(context: unknown): Promise<Registration | null>; contexts: Map<string, unknown>; approvalWaiters: Map<string, unknown>; externalBrowserProxies: Map<string, unknown>
  authorizeExternalBrowserCall(owner: unknown, runId: string | undefined, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string | null> }

/** Ponte injetada: node_repl falso no lugar do oficial, que está quebrado na máquina real. */
function fakeBridge(service: AppService, command = process.execPath, problems: string[] = []) {
  const log = join(temp('politron-repl-log-'), 'calls.log')
  service.externalBrowserBridge = { probe: () => problems, guide: () => 'GUIA: setupBrowserRuntime', upstream: () => ({ command, args: [fixture], env: { FAKE_NODE_REPL_LOG: log } }) }
  return log
}
const calls = (log: string) => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0

async function mcp(registration: Registration) {
  const client = new Client({ name: 'codex-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(registration.url), { requestInit: { headers: { Authorization: `Bearer ${registration.token}` } } }))
  return client
}
const output = (result: Record<string, unknown>) => (result.content as Array<{ text?: string }>).map(item => item.text).join('')

describe('guia da ponte oficial', () => {
  it('aponta para o browser-client da versão mais recente do plugin e importa por URL de arquivo', () => {
    const home = temp('politron-codex-')
    for (const version of ['1.2.0', '1.10.0']) { mkdirSync(join(home, 'plugins', 'cache', 'openai-bundled', 'chrome', version, 'scripts'), { recursive: true }); writeFileSync(join(home, 'plugins', 'cache', 'openai-bundled', 'chrome', version, 'scripts', 'browser-client.mjs'), '') }
    const client = browserClientPath(home)!
    expect(client).toContain(join('chrome', '1.10.0', 'scripts', 'browser-client.mjs'))
    const guide = externalBrowserGuide(client)
    expect(guide).toContain(`await import(${JSON.stringify(pathToFileURL(client).href)})`)
    expect(guide).toContain('agent.browsers.get("extension")')
    expect(browserClientPath(temp('politron-vazio-'))).toBeNull()
  })
})

describe('navegador real liberado por autorização da conversa', () => {
  async function running(runtime: 'codex' | 'claude' = 'codex') {
    const { service, broker, context, owner } = await setup(true, runtime)
    const log = fakeBridge(service)
    const mediated = service as unknown as Mediated
    mediated.contexts.set(context.run.id, context)
    const approvals: Approval[] = []
    service.on('workspace-event', (event: WorkspaceEvent) => { if (event.type === 'approval') approvals.push(event.approval) })
    return { service, broker, context, owner, log, mediated, approvals }
  }
  const pending = async (approvals: Approval[]) => { for (let i = 0; i < 200 && !approvals.some(item => item.status === 'pending'); i++) await new Promise(resolve => setTimeout(resolve, 5)); return approvals.find(item => item.status === 'pending')! }

  it('sem grant o js é recusado citando external_browser_request; o pedido aprovado libera a mesma execução sem nova aprovação, e revogar volta a recusar', async () => {
    const { service, broker, context, owner, log, mediated, approvals } = await running()
    const registration = await mediated.externalBrowserMcp(context)
    expect(registration).toMatchObject({ tools: ['js'] })
    const client = await mcp(registration!)
    try {
      // O guia de uso da ponte (no Codex vem pela skill control-chrome) chega a qualquer runtime pela descrição do js.
      expect((await client.listTools()).tools[0].description).toMatch(/^GUIA: setupBrowserRuntime/)
      const refused = await client.callTool({ name: 'js', arguments: { code: 'tab.url()' } })
      expect(refused.isError).toBe(true)
      expect(output(refused)).toBe('O usuário não autorizou o navegador real para este agente nesta conversa. Use a ferramenta external_browser_request.')
      expect(calls(log)).toBe(0)

      expect(broker.tools(context).map(tool => tool.name)).toContain('external_browser_request')
      const request = broker.callTool(context, 'external_browser_request', {})
      const approval = await pending(approvals)
      expect(approval).toMatchObject({ kind: 'browser', details: { action: 'Permitir Boo Externo usar seu navegador real (Brave/Chrome) nesta conversa', task: 'O agente poderá ler e agir em qualquer site em que você está logado, incluindo cookies e dados salvos, até você revogar.' } })
      expect(approval.details.desktopOnly).toBe(true)
      await expect(service.respondApproval(approval.id, true, true)).rejects.toThrow('A autorização do navegador real só pode ser respondida na janela do Boobot neste computador.')
      expect(service.externalBrowserStatus(owner).granted).toBe(false)
      await service.respondApproval(approval.id, true)
      await expect(request).resolves.toMatch(/autorizado[\s\S]*pronta/i)
      expect(service.externalBrowserStatus(owner).granted).toBe(true)
      await expect(broker.callTool(context, 'external_browser_request', {})).resolves.toMatch(/já autorizado/i)

      const before = approvals.length
      const activities = () => service.store.history(owner.conversationId).filter(message => message.role === 'activity')
      expect(activities()).toHaveLength(0)
      for (const code of ['tab.url()', 'await tab.goto("https://exemplo.com/conta?token=segredo")']) {
        const result = await client.callTool({ name: 'js', arguments: { code } })
        expect(result.isError).toBeFalsy()
        expect(output(result)).toBe(`executado: ${code}`)
      }
      expect(approvals.length).toBe(before)
      expect(calls(log)).toBe(2)
      // Cada js encaminhado vira atividade da execução na conversa, com a prévia sem segredos.
      expect(activities().map(message => ({ runId: message.runId, agentId: message.agentId, text: message.text }))).toEqual([
        { runId: context.run.id, agentId: owner.agentId, text: 'Navegador real · js\ntab.url()' },
        { runId: context.run.id, agentId: owner.agentId, text: 'Navegador real · js · alvo https://exemplo.com/conta\nawait tab.goto("https://exemplo.com/conta")' },
      ])

      service.setExternalBrowserGrant(owner, false)
      const revoked = await client.callTool({ name: 'js', arguments: { code: '1' } })
      expect(revoked.isError).toBe(true)
      expect(output(revoked)).toMatch(/external_browser_request/)
      expect(calls(log)).toBe(2)
      expect(activities()).toHaveLength(2)
    } finally { await client.close() }
  })

  it('pedido negado não grava autorização', async () => {
    const { service, broker, context, owner, approvals } = await running()
    const request = broker.callTool(context, 'external_browser_request', {})
    await service.respondApproval((await pending(approvals)).id, false)
    await expect(request).resolves.toMatch(/negou/)
    expect(service.externalBrowserStatus(owner).granted).toBe(false)
  })

  it('agente Claude recebe o proxy; Pi e OpenCode não', async () => {
    const { context, mediated } = await running('claude')
    expect(await mediated.externalBrowserMcp(context)).toMatchObject({ tools: ['js'] })
    for (const runtime of ['pi', 'opencode'] as const) {
      const other = await setup(true, 'opencode')
      const log = fakeBridge(other.service)
      const agent = { ...other.context.agent, runtime }
      expect(await (other.service as unknown as Mediated).externalBrowserMcp({ ...other.context, agent })).toBeNull()
      expect(calls(log)).toBe(0)
      expect(other.broker.tools({ ...other.context, agent }).map(tool => tool.name)).not.toContain('external_browser_request')
    }
  })

  it('só autoriza a execução vinculada ao proxy: outra execução, outro agente ou nenhuma são recusados', async () => {
    const { service, context, owner, mediated } = await running()
    service.setExternalBrowserGrant(owner, true)
    mediated.contexts.set('run-outra', { ...context, run: { ...context.run, id: 'run-outra' }, agent: { ...context.agent, id: 'outro-agente' } })
    const signal = new AbortController().signal
    expect(await mediated.authorizeExternalBrowserCall(owner, context.run.id, 'js', { code: '1' }, signal)).toBeNull()
    expect(await mediated.authorizeExternalBrowserCall(owner, undefined, 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
    expect(await mediated.authorizeExternalBrowserCall(owner, 'run-inexistente', 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
    expect(await mediated.authorizeExternalBrowserCall(owner, 'run-outra', 'js', { code: '1' }, signal)).toMatch(/Nenhuma execução ativa/)
  })

  it('sonda com problema ou node_repl que não inicia: sem proxy, status explica e o app segue', async () => {
    const { service, broker, context, owner } = await setup(true, 'codex')
    service.setExternalBrowserGrant(owner, true)
    const log = fakeBridge(service, process.execPath, ['servidor MCP node_repl configurado aponta para um executável inexistente'])
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
    await expect(broker.callTool(context, 'external_browser_status', {})).resolves.toMatch(/executável inexistente[\s\S]*reinstale o plugin Browser pelo Codex\/ChatGPT/)
    expect(calls(log)).toBe(0)
    fakeBridge(service, join(tmpdir(), 'node_repl-inexistente.exe'))
    expect(await (service as unknown as Mediated).externalBrowserMcp(context)).toBeNull()
    expect(service.snapshot().conversations.length).toBeGreaterThan(0)
  })

  it('a execução do agente registra o proxy na thread mesmo sem grant, e nunca o node_repl direto', async () => {
    const threads: unknown[] = []
    const runtime = Object.assign(new EventEmitter(), {
      supportsImages: false, models: async () => [], respond: () => undefined, interrupt: async () => undefined, close: () => undefined,
      thread: async (...args: unknown[]) => { threads.push(args[5]); return { id: `thread-${threads.length}`, history: 'empty' as const } },
      send: async () => ({ turn: { id: 'turn', status: 'failed', error: { message: 'fim do teste' } } }),
    }) as unknown as AgentRuntime
    const { service, owner } = await setup(true, 'codex', runtime)
    fakeBridge(service)
    await service.send(owner.conversationId, 'sem autorização')
    for (let i = 0; i < 300 && !threads.length; i++) await new Promise(resolve => setTimeout(resolve, 10))
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({ url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/), tools: ['js'] })
    expect(JSON.stringify(threads[0])).not.toContain('fake-node-repl')
  })

  it('apagar a conversa ou o agente encerra o proxy daquele conversa:agente', async () => {
    const first = await running()
    const key = `${first.owner.conversationId}:${first.owner.agentId}`
    expect(await first.mediated.externalBrowserMcp(first.context)).not.toBeNull()
    expect(first.mediated.externalBrowserProxies.has(key)).toBe(true)
    await first.service.deleteConversation(first.owner.conversationId)
    expect(first.mediated.externalBrowserProxies.has(key)).toBe(false)

    const second = await running()
    const other = `${second.owner.conversationId}:${second.owner.agentId}`
    expect(await second.mediated.externalBrowserMcp(second.context)).not.toBeNull()
    await second.service.deleteAgent(second.owner.agentId)
    expect(second.mediated.externalBrowserProxies.has(other)).toBe(false)
  })

  it('node_repl que trava no início: a execução segue sem proxy dentro do prazo e não tenta de novo até um pedido explícito', async () => {
    const { service, broker, context, owner, mediated, approvals } = await running()
    let starts = 0
    service.externalBrowserBridge = { probe: () => [], guide: () => '', startTimeoutMs: 300, upstream: () => { starts++; return { command: process.execPath, args: ['-e', 'setInterval(() => undefined, 1000)'], env: {} } } }
    const began = Date.now()
    expect(await mediated.externalBrowserMcp(context)).toBeNull()
    expect(Date.now() - began).toBeLessThan(5000)
    expect(await mediated.externalBrowserMcp(context)).toBeNull()
    expect(starts).toBe(1)
    // Pedido explícito libera nova tentativa na próxima execução.
    const request = broker.callTool(context, 'external_browser_request', {})
    await service.respondApproval((await pending(approvals)).id, true)
    await request
    expect(service.externalBrowserStatus(owner).granted).toBe(true)
    expect(await mediated.externalBrowserMcp(context)).toBeNull()
    expect(starts).toBe(2)
  })

  it('Claude retoma a sessão sem a URL do proxy na chave; Codex mantém a URL', async () => {
    for (const kind of ['claude', 'codex'] as const) {
      const keys: string[] = []
      const runtime = Object.assign(new EventEmitter(), {
        supportsImages: false, models: async () => [], respond: () => undefined, interrupt: async () => undefined, close: () => undefined,
        thread: async () => ({ id: 'thread', history: 'empty' as const }),
        send: async () => ({ turn: { id: 'turn', status: 'failed', error: { message: 'fim do teste' } } }),
      }) as unknown as AgentRuntime
      const { service, owner } = await setup(true, kind, runtime)
      ;(service as unknown as { claudeRuntime: AgentRuntime }).claudeRuntime = runtime
      fakeBridge(service)
      const lookup = service.store.sessionBinding.bind(service.store)
      service.store.sessionBinding = (key: string) => { keys.push(key); return lookup(key) }
      await service.send(owner.conversationId, 'oi')
      for (let i = 0; i < 300 && !keys.length; i++) await new Promise(resolve => setTimeout(resolve, 10))
      expect(keys.length).toBeGreaterThan(0)
      if (kind === 'claude') expect(keys[0]).not.toContain('127.0.0.1')
      else expect(keys[0]).toMatch(/:xhttp:\/\/127\.0\.0\.1:\d+\/mcp$/)
    }
  })
})
