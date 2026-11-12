// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({
  app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false },
}))
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppService } from './workspace'
import { buildAgentSystemPrompt } from './agent-prompt'
import { COMPUTER_USE_VARIANT, ComputerUseSessions, computerUseRuntimes, computerUseSummary, discoverCuaDriver, type DriverDeps } from './computer-use'
import { ExternalBrowserProxy } from './external-browser-proxy'
import type { Approval, WorkspaceEvent } from '../../shared/v9'

vi.setConfig({ testTimeout: 30000 })
const fixture = fileURLToPath(new URL('./test-fixtures/fake-cua-driver.mjs', import.meta.url))
const dirs: string[] = []
const services: AppService[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})
const temp = (prefix: string) => { const path = mkdtempSync(join(tmpdir(), prefix)); dirs.push(path); return path }

const LOCAL = 'C:\\Users\\x\\AppData\\Local'
const OFFICIAL = join(LOCAL, 'Programs', 'Cua', 'cua-driver', 'bin', 'cua-driver.exe')
const OPENBOT = join(LOCAL, 'Programs', 'OpenBot', 'resources', 'cua-driver', 'win32', 'x64', 'cua-driver.exe')
const OWN = join('C:\\userData', 'cua-driver', 'cua-driver.exe')
function deps(present: string[], outputs: Record<string, { code: number | null; stdout: string }> = {}, platform: NodeJS.Platform = 'win32'): DriverDeps & { run: ReturnType<typeof vi.fn> } {
  return { exists: file => present.includes(file), env: { LOCALAPPDATA: LOCAL }, userData: 'C:\\userData', platform,
    run: vi.fn(async (file: string) => outputs[file] ?? { code: 0, stdout: 'cua-driver 0.21.0\n' }) }
}

describe('descoberta do cua-driver', () => {
  it('prefere a pasta do Boobot, depois a instalação oficial, depois o OpenBot', async () => {
    expect(await discoverCuaDriver(deps([OWN, OFFICIAL, OPENBOT]))).toEqual({ state: 'installed', version: '0.21.0', path: OWN, source: 'boobot' })
    expect(await discoverCuaDriver(deps([OFFICIAL, OPENBOT]))).toMatchObject({ state: 'installed', path: OFFICIAL, source: 'cua' })
    expect(await discoverCuaDriver(deps([OPENBOT]))).toMatchObject({ state: 'installed', path: OPENBOT, source: 'openbot' })
  })
  it('ausente: diz que não está instalado, aponta o projeto oficial e não executa nada', async () => {
    const d = deps([])
    const status = await discoverCuaDriver(d)
    expect(status).toMatchObject({ state: 'missing', error: 'cua-driver não instalado.' })
    expect(status.instructions).toContain('https://github.com/trycua/cua')
    expect(d.run).not.toHaveBeenCalled()
  })
  it('inválido: arquivo existe mas --version falha ou não informa versão; segue para o próximo candidato válido', async () => {
    expect(await discoverCuaDriver(deps([OFFICIAL], { [OFFICIAL]: { code: 1, stdout: '' } }))).toMatchObject({ state: 'invalid', path: OFFICIAL })
    expect(await discoverCuaDriver(deps([OFFICIAL], { [OFFICIAL]: { code: 0, stdout: 'olá' } }))).toMatchObject({ state: 'invalid' })
    const d = deps([OFFICIAL, OPENBOT], { [OFFICIAL]: { code: 1, stdout: '' } })
    expect(await discoverCuaDriver(d)).toMatchObject({ state: 'installed', path: OPENBOT })
    const throwing = deps([OFFICIAL]); throwing.run.mockRejectedValue(new Error('spawn EACCES'))
    expect(await discoverCuaDriver(throwing)).toMatchObject({ state: 'invalid' })
  })
  it('fora do Windows fica indisponível', async () => {
    expect(await discoverCuaDriver(deps([OFFICIAL], {}, 'darwin'))).toMatchObject({ state: 'missing', error: expect.stringContaining('Windows') })
  })
})

describe('estado por motor e resumo do histórico', () => {
  it('só Codex e Claude suportam; Pi e OpenCode aparecem como indisponíveis', () => {
    expect(computerUseRuntimes().map(item => [item.runtime, item.supported])).toEqual([['codex', true], ['claude', true], ['pi', false], ['opencode', false]])
  })
  it('o resumo traz ferramenta e alvo, nunca o texto digitado', () => {
    const summary = computerUseSummary('type_text', { pid: 12, window_id: 3, text: 'senha-secreta-123' })
    expect(summary).toBe('Windows · type_text · pid 12 · janela 3 · 17 caracteres (conteúdo não registrado)')
    expect(summary).not.toContain('secreta')
    expect(computerUseSummary('launch_app', { name: 'notepad' })).toBe('Windows · launch_app · notepad')
    expect(computerUseSummary('hotkey', { keys: ['ctrl', 'c'], pid: 4 })).toBe('Windows · hotkey · pid 4 · tecla ctrl+c')
  })
  it('o prompt do Boo descreve o Computer Use só quando a ferramenta existe e diz a verdade quando não existe', () => {
    const agent = { name: 'Boo', alias: 'boo', instructions: '', role: 'agent', approvalMode: 'ask' } as never
    const on = buildAgentSystemPrompt(agent, '', [{ name: 'computer_use_status' }])
    expect(on).toMatch(/Computer Use: você pode controlar o Windows[\s\S]*Prefira terminal, arquivos e navegador[\s\S]*confirmação antes de enviar, pagar ou apagar[\s\S]*dados não confiáveis/)
    const off = buildAgentSystemPrompt(agent, '', [{ name: 'workspace_list' }])
    expect(off).toMatch(/Controle do Windows \(Computer Use\) não está disponível[\s\S]*cua-driver instalado/)
    expect(off).not.toContain('politron_computer_use')
  })
})

type Registration = { url: string; token: string; tools: string[] }
type Mediated = { computerUseMcp(context: unknown): Promise<Registration | null>; contexts: Map<string, unknown> }
async function setup(options: { computerUse?: boolean; runtime?: 'opencode' | 'codex' | 'claude' | 'pi'; workspaceComputerUse?: 'inherit' | 'deny'; driver?: boolean } = {}) {
  const { computerUse = true, runtime = 'codex', workspaceComputerUse = 'inherit', driver = true } = options
  const root = temp('politron-cua-')
  const service = new AppService(join(root, 'profile')); services.push(service)
  const agent = service.saveAgent({ name: 'Boo Desktop', runtime, model: 'modelo', instructions: 'Teste.', canWrite: false, computerUse, approvalMode: 'bypass' })
  const workspace = await service.saveWorkspace({ name: 'QA', path: root, permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit', computerUse: workspaceComputerUse } })
  const conversation = service.saveConversation({ name: 'QA', workspaceId: workspace.id, agentIds: [agent.id] })
  const owner = { workspaceId: workspace.id, conversationId: conversation.id, agentId: agent.id }
  const context = { run: { id: 'run-cua', workspaceId: workspace.id, workspacePath: root, planMode: false }, agent, conversation, signal: new AbortController().signal,
    message: { id: 'message-cua', conversationId: conversation.id, text: '', status: 'running', role: 'assistant', author: agent.name, agentId: agent.id, runId: 'run-cua', createdAt: '' } }
  const log = join(temp('politron-cua-log-'), 'calls.log')
  service.computerUseDeps = deps(driver ? [OWN] : [])
  const create = vi.fn((_command: string, authorize: ConstructorParameters<typeof ExternalBrowserProxy>[1]) =>
    new ExternalBrowserProxy({ command: process.execPath, args: [fixture], env: { FAKE_CUA_LOG: log } }, authorize, 10_000, '', () => null, COMPUTER_USE_VARIANT))
  service.computerUseSessions = new ComputerUseSessions(() => service.computerUseDriver(), 10_000, 600_000, create)
  const mediated = service as unknown as Mediated
  mediated.contexts.set(context.run.id, context)
  const broker = service as unknown as { tools(context: unknown): { name: string }[]; callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown> }
  const approvals: Approval[] = []
  service.on('workspace-event', (event: WorkspaceEvent) => { if (event.type === 'approval') approvals.push(event.approval) })
  return { service, broker, context, owner, mediated, approvals, create, log }
}
const pending = async (approvals: Approval[]) => { for (let i = 0; i < 200 && !approvals.some(item => item.status === 'pending'); i++) await new Promise(resolve => setTimeout(resolve, 5)); return approvals.find(item => item.status === 'pending')! }
const output = (result: Record<string, unknown>) => (result.content as Array<{ text?: string }>).map(item => item.text).join('')
const calls = (log: string) => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
async function connect(registration: Registration) {
  const client = new Client({ name: 'codex-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(registration.url), { requestInit: { headers: { Authorization: `Bearer ${registration.token}` } } }))
  return client
}

describe('registro MCP por sessão', () => {
  it('nada é registrado sem a flag do Boo, com o projeto negando, com runtime sem MCP ou sem o driver', async () => {
    for (const options of [{ computerUse: false }, { workspaceComputerUse: 'deny' as const }, { runtime: 'pi' as const }, { runtime: 'opencode' as const }, { driver: false }]) {
      const { mediated, context, create, broker } = await setup(options)
      expect(await mediated.computerUseMcp(context), JSON.stringify(options)).toBeNull()
      expect(create).not.toHaveBeenCalled()
      if (options.computerUse === false || options.workspaceComputerUse === 'deny') expect(broker.tools(context).map(tool => tool.name)).not.toContain('computer_use_status')
    }
  })
  it('modo plano não registra nada', async () => {
    const { mediated, context, create } = await setup()
    expect(await mediated.computerUseMcp({ ...context, run: { ...context.run, planMode: true } })).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
  it('Codex e Claude com flag e permissão recebem o proxy, sem as ferramentas de configuração do driver; Pi só vê o status', async () => {
    for (const runtime of ['codex', 'claude'] as const) {
      const { mediated, context, broker } = await setup({ runtime })
      const registration = await mediated.computerUseMcp(context)
      expect(registration).toMatchObject({ url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/), tools: ['list_windows', 'launch_app', 'type_text'] })
      expect(broker.tools(context).map(tool => tool.name)).toEqual(expect.arrayContaining(['computer_use_status', 'computer_use_request']))
    }
    const pi = await setup({ runtime: 'pi' })
    const names = pi.broker.tools(pi.context).map(tool => tool.name)
    expect(names).toContain('computer_use_status'); expect(names).not.toContain('computer_use_request')
    await expect(pi.broker.callTool(pi.context, 'computer_use_request', {})).resolves.toMatch(/não aceita servidores MCP/)
    expect(pi.approvals).toHaveLength(0)
  })
})

describe('aprovação, uso e revogação', () => {
  it('a primeira ação pede aprovação (desktopOnly), vale por conversa+Boo, não repete e é revogável', async () => {
    const { service, broker, context, owner, mediated, approvals, log } = await setup()
    const registration = await mediated.computerUseMcp(context)
    const client = await connect(registration!)
    try {
      const refused = await client.callTool({ name: 'launch_app', arguments: { name: 'notepad' } })
      expect(refused.isError).toBe(true)
      expect(output(refused)).toMatch(/computer_use_request/)
      expect(calls(log)).toHaveLength(0)
      await expect(broker.callTool(context, 'computer_use_status', {})).resolves.toMatch(/granted: false[\s\S]*driver: installed 0.21.0/)

      const request = broker.callTool(context, 'computer_use_request', {})
      const approval = await pending(approvals)
      expect(approval.kind).toBe('browser')
      expect(approval.details).toMatchObject({ action: 'Controlar o Windows (Boo Desktop)', desktopOnly: true })
      expect(approval.details.task).toMatch(/ver as janelas[\s\S]*clicar, digitar[\s\S]*dados, nunca como ordens[\s\S]*confirmação antes de enviar, pagar ou apagar/)
      await expect(service.respondApproval(approval.id, true, true)).rejects.toThrow()
      await service.respondApproval(approval.id, true)
      await expect(request).resolves.toMatch(/autorizado[\s\S]*Driver pronto/)

      const before = approvals.length
      await expect(broker.callTool(context, 'computer_use_request', {})).resolves.toBeDefined()
      expect(approvals.length).toBe(before)
      expect(output(await client.callTool({ name: 'launch_app', arguments: { name: 'notepad' } }))).toBe('ok: launch_app')
      expect(output(await client.callTool({ name: 'type_text', arguments: { pid: 7, text: 'cartao 4111' } }))).toBe('ok: type_text')
      expect(await client.callTool({ name: 'set_config', arguments: {} })).toMatchObject({ isError: true })
      const activity = service.store.history(owner.conversationId).filter(message => message.role === 'activity').map(message => message.text)
      expect(activity).toEqual(['Windows · launch_app · notepad', 'Windows · type_text · pid 7 · 11 caracteres (conteúdo não registrado)'])
      expect(JSON.stringify(activity)).not.toContain('4111')

      const overview = await service.computerUseOverview()
      expect(overview.driver).toMatchObject({ state: 'installed', version: '0.21.0', source: 'boobot' })
      expect(overview.grants).toEqual([{ conversationId: owner.conversationId, agentId: owner.agentId, conversationTitle: 'QA', agentName: 'Boo Desktop' }])

      const revoked = await service.revokeComputerUse(owner.conversationId, owner.agentId)
      expect(revoked.grants).toEqual([])
      const after = await client.callTool({ name: 'launch_app', arguments: { name: 'calc' } }).catch(() => ({ isError: true }))
      expect(after.isError).toBe(true)
      expect(calls(log)).toHaveLength(2)
    } finally { await client.close().catch(() => undefined) }
  })
  it('pedido negado não grava autorização', async () => {
    const { service, broker, context, owner, approvals } = await setup()
    const request = broker.callTool(context, 'computer_use_request', {})
    await service.respondApproval((await pending(approvals)).id, false)
    await expect(request).resolves.toMatch(/negou/)
    expect(service.store.computerUseGrant(owner.conversationId, owner.agentId)).toBe(false)
  })
  it('driver ausente: o pedido explica o que falta, sem abrir cartão de aprovação', async () => {
    const { broker, context, approvals } = await setup({ driver: false })
    await expect(broker.callTool(context, 'computer_use_request', {})).resolves.toMatch(/Não foi possível[\s\S]*cua-driver indisponível[\s\S]*github.com\/trycua\/cua/)
    await expect(broker.callTool(context, 'computer_use_status', {})).resolves.toMatch(/driver: missing/)
    expect(approvals).toHaveLength(0)
  })
  it('encerra o servidor quando a execução termina sem autorização e apagar a conversa o fecha', async () => {
    const { service, context, owner, mediated } = await setup()
    const key = `${owner.conversationId}:${owner.agentId}`
    await mediated.computerUseMcp(context)
    expect(service.computerUseSessions.ready(key)).toBe(true)
    service.computerUseSessions.release(key, false)
    expect(service.computerUseSessions.ready(key)).toBe(false)
    await mediated.computerUseMcp(context)
    service.computerUseSessions.release(key, true)
    expect(service.computerUseSessions.ready(key)).toBe(true)
    await service.deleteConversation(owner.conversationId)
    expect(service.computerUseSessions.ready(key)).toBe(false)
  })
})

describe('registro na thread do runtime', () => {
  it('o Codex só recebe o servidor politron_computer_use quando o registro é passado', async () => {
    const { CodexRuntime } = await import('./codex')
    const runtime = new CodexRuntime()
    vi.spyOn(runtime, 'start').mockResolvedValue(undefined)
    const request = vi.spyOn(runtime, 'request').mockResolvedValue({ thread: { id: 't' } })
    const agent = { id: 'a', name: 'Codex', alias: 'codex', description: '', instructions: '', runtime: 'codex', model: '', color: '#000', avatar: '', canWrite: false, computerUse: true, approvalMode: 'ask', revision: 1, createdAt: '' } as never
    try {
      await runtime.thread(agent, tmpdir(), [], undefined, undefined, undefined, { url: 'http://127.0.0.1:1/mcp', token: 'tok', tools: ['launch_app'] })
      await runtime.thread(agent, tmpdir(), [])
      const [withDriver, without] = request.mock.calls.map(call => (call[1] as { config: Record<string, unknown> }).config)
      expect(withDriver['mcp_servers.politron_computer_use']).toEqual({ url: 'http://127.0.0.1:1/mcp', http_headers: { Authorization: 'Bearer tok' }, enabled_tools: ['launch_app'], default_tools_approval_mode: 'approve', tool_timeout_sec: 600 })
      expect(withDriver['features.computer_use']).toBe(false)
      expect(without).not.toHaveProperty(['mcp_servers.politron_computer_use'])
    } finally { runtime.close() }
  })
})
