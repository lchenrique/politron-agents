import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentRuntime } from './agent-runtime'
import type { Agent, Conversation } from '../../shared/v9'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

class ControlledRuntime extends EventEmitter {
  threads: string[] = []
  inputs: string[] = []
  async models() { return [] }
  async thread() { const id = `thread-${this.threads.length}`; this.threads.push(id); return { id, history: 'empty' as const } }
  async send(_threadId: string, input: string) { this.inputs.push(input); return { turn: { id: 'shared-turn', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
  complete(threadId: string) { this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: 'shared-turn', status: 'completed' } } }) }
}
type Broker = { tools(context: unknown): { name: string }[]; callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown> }
const fixtures: { service: AppService; directory: string; sends: Promise<void>[]; conversations: Conversation[] }[] = []
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'boobot-audit-'))
  const codex = new ControlledRuntime(), claude = new ControlledRuntime()
  const service = new AppService(directory, codex as AgentRuntime, claude as AgentRuntime)
  const fixture = { service, directory, sends: [] as Promise<void>[], conversations: [] as Conversation[] }
  fixtures.push(fixture)
  const broker = service as unknown as Broker
  function conversation(agent: Agent) {
    const path = join(directory, agent.id)
    mkdirSync(path)
    const workspace = service.store.saveWorkspace({ name: agent.name, path })
    const value = service.store.saveConversation({ name: agent.name, workspaceId: workspace.id, agentIds: [agent.id] })
    fixture.conversations.push(value)
    return value
  }
  return { ...fixture, codex, claude, broker, conversation }
}
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    for (const controller of (fixture.service as unknown as { active: Map<string, AbortController> }).active.values()) controller.abort()
    for (const conversation of fixture.conversations) await fixture.service.stop(conversation.id)
    await Promise.all(fixture.sends)
    fixture.service.dispose()
    // No Windows o processo encerrado pelo dispose pode segurar a pasta por alguns instantes.
    rmSync(fixture.directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

describe('auditoria de permissões por agente', () => {
  it('aceita uma decisão síncrona ao publicar aprovação sem deixar a execução esperando', async () => {
    const { service, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Fixture de aprovação rápida.', name: 'Resposta rápida', alias: 'resposta-rapida' })
    const chat = conversation(agent)
    const internal = service as unknown as { requestApproval(context: unknown, kind: string, details: unknown): Promise<boolean> }
    const context = { agent, conversation: chat, signal: new AbortController().signal, run: { id: 'run-aprovacao-rapida', workspaceId: chat.workspaceId }, message: { id: 'msg-aprovacao-rapida', conversationId: chat.id, text: '', status: 'running' } }
    const decisions: Promise<void>[] = []
    service.on('workspace-event', event => { if (event.type === 'approval' && event.approval.status === 'pending') decisions.push(service.respondApproval(event.approval.id, true)) })
    const pending = internal.requestApproval(context, 'command', { command: 'fixture' })
    await Promise.all(decisions)
    await expect(pending).resolves.toBe(true)
  })
  it('informa terminal indisponível sem pedir aprovação nem iniciar processo', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Apenas a fixture.', name: 'Indisponível', alias: 'indisponivel', canWrite: true })
    const chat = conversation(agent)
    service.store.saveTerminalAccess(false)
    const context = { agent, conversation: chat, run: { workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }
    expect(broker.tools(context).map(tool => tool.name)).not.toContain('workspace_run_command')
    await expect(broker.callTool(context, 'workspace_run_command', { command: 'npm --version' })).rejects.toThrow(/desativada/)
    expect(service.store.approvals()).toEqual([])
  })
  it('não oferece escrita, skills ou terminal a um agente permanente sem escrita', () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Somente leitura', alias: 'leitura', canWrite: false })
    const chat = conversation(agent)
    const names = broker.tools({ agent, run: { workspaceId: chat.workspaceId } }).map(tool => tool.name)
    expect(names).not.toContain('workspace_write')
    expect(names).not.toContain('save_skill')
    expect(names).not.toContain('workspace_run_command')
    expect(names).toContain('workspace_read')
  })
  it('recusa escrita também no broker, mesmo com uma chamada forjada e aprovação automática', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Leitor', alias: 'leitor', canWrite: false, approvalMode: 'automatic' })
    const chat = conversation(agent), workspace = service.store.workspace(chat.workspaceId)
    const context = { agent, conversation: chat, run: { id: 'forged-run', workspaceId: workspace.id, workspacePath: workspace.path }, message: { id: 'forged-message' } }
    await expect(broker.callTool(context, 'workspace_write', { path: 'forbidden.txt', content: 'dados sintéticos' })).rejects.toThrow(/permissão/i)
    expect(existsSync(join(workspace.path, 'forbidden.txt'))).toBe(false)
  })
  it('a política de escrita negada do workspace também impede comandos arbitrários', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Editor', alias: 'editor', canWrite: true })
    const chat = conversation(agent), workspace = service.store.workspace(chat.workspaceId)
    service.store.saveWorkspace({ ...workspace, permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, computerUse: 'inherit', filesWrite: 'deny' } })
    const context = { agent, conversation: chat, run: { workspaceId: workspace.id, workspacePath: workspace.path } }
    expect(broker.tools(context).map(tool => tool.name)).not.toContain('workspace_run_command')
    await expect(broker.callTool(context, 'workspace_run_command', { command: 'Write-Output audit' })).rejects.toThrow(/workspace|permissão/i)
  })
  it('um agente sem navegador é bloqueado antes de abrir qualquer sessão', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Sem navegador', alias: 'semweb', computerUse: false })
    const chat = conversation(agent)
    const context = { agent, conversation: chat, run: { workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }
    expect(broker.tools(context).map(tool => tool.name)).not.toContain('browser_open')
    await expect(broker.callTool(context, 'browser_open', { url: 'https://example.com' })).rejects.toThrow(/bloqueado/i)
  })
})

describe('auditoria de isolamento e falha dos runtimes', () => {
  it('recupera checkpoint persistido em uma thread nova com o pedido literal', async () => {
    const { service, codex, conversation, sends } = setup()
    const agent = service.saveAgent({ instructions: 'Apenas a fixture.', name: 'Continuidade', alias: 'continuidade' })
    const chat = conversation(agent)
    service.store.saveCheckpoint({ id: 'checkpoint-audit', conversationId: chat.id, agentId: agent.id, runId: 'prior-run', summary: 'Contador corrigido; falta conferir tipos.', decisions: ['Preservar os testes'], pending: ['Executar typecheck'], createdAt: new Date().toISOString() })
    sends.push(service.send(chat.id, 'Continue sem reescrever os testes.'))
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    expect(codex.inputs[0]).toContain('Contador corrigido; falta conferir tipos.')
    expect(codex.inputs[0]).toContain('Preservar os testes')
    expect(codex.inputs[0]).toContain('Pedido atual:\nContinue sem reescrever os testes.')
    codex.complete(codex.threads[0])
  })
  it.skipIf(process.platform !== 'win32')('interromper um comando encerra também o processo filho no Windows', async () => {
    const { service, broker, conversation, directory } = setup()
    const agent = service.saveAgent({ instructions: 'Somente a fixture.', name: 'Cancelamento', alias: 'cancelamento', canWrite: true })
    const chat = conversation(agent), ready = join(directory, 'ready'), marker = join(directory, 'child-survived'), script = join(directory, 'child.cjs')
    // Margem para o taskkill iniciar mesmo durante builds; não altera o timeout de produção.
    writeFileSync(script, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(ready)},'ready');setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'survived'),7000)`)
    const signal = new AbortController()
    vi.spyOn(service as unknown as { requestApproval(): Promise<boolean> }, 'requestApproval').mockResolvedValue(true)
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
    const pending = broker.callTool({ agent, conversation: chat, signal: signal.signal, run: { id: 'cancel-run', workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }, 'workspace_run_command', { command: `& ${quote(process.execPath)} ${quote(script)}` })
    // Anexa o tratamento antes de abortar para evitar rejeições sem observador.
    const result = pending.catch(error => error)
    try {
      await vi.waitFor(() => expect(existsSync(ready)).toBe(true), { timeout: 5000 })
      signal.abort()
      expect(await result).toContain('Execução interrompida.')
      expect(existsSync(marker)).toBe(false)
    } finally {
      signal.abort()
      await result
    }
  }, 15000)
  it('preserva falha de turno recebida antes da resposta de turn/start', async () => {
    const { service, codex, conversation, sends } = setup()
    vi.spyOn(codex, 'send').mockImplementation(async () => {
      codex.emit('event', { method: 'turn/completed', params: { threadId: codex.threads[0], turn: { id: 'shared-turn', status: 'failed', error: { message: 'Falha antecipada sintética' } } } })
      return { turn: { id: 'shared-turn', status: 'inProgress' } }
    })
    const agent = service.saveAgent({ instructions: 'Apenas a fixture.', name: 'Falha', alias: 'falha' })
    const chat = conversation(agent)
    const send = service.send(chat.id, 'Tarefa sintética'); sends.push(send); await send
    expect(service.store.runs()[0].status).toBe('failed')
    expect(service.history(chat.id).at(-1)?.text).toContain('Falha antecipada sintética')
  })
  it('remove o listener de interrupção após resolver uma aprovação', async () => {
    const { service, codex, conversation, sends } = setup()
    const agent = service.saveAgent({ instructions: 'Apenas a fixture.', name: 'Aprovação', alias: 'aprovacao' })
    const chat = conversation(agent)
    sends.push(service.send(chat.id, 'Aguarde.'))
    await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('shared-turn'))
    const internal = service as unknown as { contexts: Map<string, { signal: AbortSignal }>; requestApproval(context: unknown, kind: string, details: unknown): Promise<boolean> }
    const context = [...internal.contexts.values()][0]
    const remove = vi.spyOn(context.signal, 'removeEventListener')
    const pending = internal.requestApproval(context, 'command', { command: 'fixture' })
    const approval = service.store.approvals().find(item => item.status === 'pending')!
    await service.respondApproval(approval.id, false)
    expect(await pending).toBe(false)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    codex.complete(codex.threads[0])
  })
  it('executa npm no terminal real com o ambiente mínimo de ferramentas do sistema', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Verifique apenas a versão do npm.', name: 'Terminal', alias: 'terminal', canWrite: true })
    const chat = conversation(agent)
    vi.spyOn(service as unknown as { requestApproval(): Promise<boolean> }, 'requestApproval').mockResolvedValue(true)
    const result = await broker.callTool({ agent, conversation: chat, run: { id: 'npm-run', workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }, 'workspace_run_command', { command: 'npm --version' })
    expect(result).toMatch(/\d+\.\d+\.\d+/)
    expect(result).not.toMatch(/LASTEXITCODE|VariableIsUndefined/)
  }, 15000)
  it('comando curto do agente aparece como sessão PTY e devolve código de falha com evidência', async () => {
    const { service, broker, conversation } = setup()
    const agent = service.saveAgent({ instructions: 'Somente a fixture.', name: 'Pty', alias: 'pty', canWrite: true })
    const chat = conversation(agent)
    vi.spyOn(service as unknown as { requestApproval(): Promise<boolean> }, 'requestApproval').mockResolvedValue(true)
    const events: string[] = []
    service.on('workspace-event', event => { if (event.type === 'agentTerminal') events.push(event.event) })
    const result = String(await broker.callTool({ agent, conversation: chat, run: { id: 'pty-run', workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }, 'workspace_run_command', { command: `& ${JSON.stringify(process.execPath)} -e "console.log('SAIDA-PTY'); process.exit(4)"` }))
    expect(result).toContain('SAIDA-PTY')
    expect(result).toContain('Código de saída: 4.')
    expect(result).toMatch(/Evidência: /)
    expect(events[0]).toBe('started')
    expect(events.at(-1)).toBe('finished')
    expect(service.agentTerminalSessions(chat.id, chat.workspaceId)[0]).toMatchObject({ mode: 'command', status: 'failed', exitCode: 4, agentName: 'Pty' })
  }, 20000)
  it('processo longo segue ativo, consulta status, só para no escopo dono e o dispose limpa', async () => {
    const { service, broker, conversation, directory } = setup()
    const agent = service.saveAgent({ instructions: 'Somente a fixture.', name: 'Servidor', alias: 'servidor', canWrite: true })
    const chat = conversation(agent), other = conversation(service.saveAgent({ instructions: 'Outra.', name: 'Outra', alias: 'outra', canWrite: true }))
    const script = join(directory, 'server.cjs')
    writeFileSync(script, "console.log('SERVIDOR-PRONTO'); setInterval(() => {}, 1000)")
    vi.spyOn(service as unknown as { requestApproval(): Promise<boolean> }, 'requestApproval').mockResolvedValue(true)
    const context = { agent, conversation: chat, run: { id: 'dev-run', workspaceId: chat.workspaceId, workspacePath: service.store.workspace(chat.workspaceId).path } }
    const started = String(await broker.callTool(context, 'workspace_start_process', { command: `& ${JSON.stringify(process.execPath)} ${JSON.stringify(script)}` }))
    const sessionId = /Sessão: ([\w-]+)/.exec(started)![1]
    await vi.waitFor(() => expect(service.agentTerminalSessions(chat.id, chat.workspaceId)[0].output).toContain('SERVIDOR-PRONTO'), { timeout: 10000 })
    expect(String(await broker.callTool(context, 'workspace_process_status', { session_id: sessionId }))).toContain(': running')
    await expect(broker.callTool({ ...context, conversation: other, run: { ...context.run, workspaceId: other.workspaceId } }, 'workspace_stop_process', { session_id: sessionId })).rejects.toThrow(/escopo/)
    expect(() => service.agentTerminalStop(sessionId, other.id, other.workspaceId)).toThrow(/escopo/)
    expect(() => service.agentTerminalSessions(chat.id, other.workspaceId)).toThrow(/não pertence/)
    await broker.callTool(context, 'workspace_stop_process', { session_id: sessionId })
    await vi.waitFor(() => expect(service.agentTerminalSessions(chat.id, chat.workspaceId)[0].status).toBe('interrupted'), { timeout: 10000 })
    const evidence = service.store.db.prepare('SELECT data FROM v9_command_evidence WHERE run_id = ?').all('dev-run') as { data: string }[]
    expect(evidence.map(item => JSON.parse(item.data).status)).toEqual(['interrupted'])
    const second = String(await broker.callTool(context, 'workspace_start_process', { command: `& ${JSON.stringify(process.execPath)} ${JSON.stringify(script)}` }))
    const secondId = /Sessão: ([\w-]+)/.exec(second)![1]
    service.agentTerminals.terminateAll()
    await vi.waitFor(() => expect(service.agentTerminals.get(secondId, { workspaceId: chat.workspaceId, conversationId: chat.id }).status).toBe('interrupted'), { timeout: 10000 })
    // O Windows libera a pasta de trabalho do console do PTY logo após a saída; evita EPERM na limpeza da fixture.
    await new Promise(resolve => setTimeout(resolve, 1500))
  }, 30000)
  it('um turno com o mesmo id em outra thread não encerra esta execução', async () => {
    const { service, codex, conversation, sends } = setup()
    const a = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'A', alias: 'a' }), b = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'B', alias: 'b' })
    const first = conversation(a), second = conversation(b)
    sends.push(service.send(first.id, 'Aguarde.'), service.send(second.id, 'Aguarde.'))
    await vi.waitFor(() => expect(service.store.runs().filter(run => run.turnId).length).toBe(2))
    codex.complete(service.store.runs().find(run => run.conversationId === first.id)!.threadId!)
    await vi.waitFor(() => expect(service.store.runs().find(run => run.conversationId === first.id)?.status).toBe('completed'))
    expect(service.store.runs().find(run => run.conversationId === second.id)?.status).toBe('running')
    codex.complete(service.store.runs().find(run => run.conversationId === second.id)!.threadId!)
  })
  it('desconectar Codex libera sua espera e preserva o trabalho de Claude', async () => {
    const { service, codex, claude, conversation, sends } = setup()
    const a = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Codex', alias: 'cx', runtime: 'codex' }), b = service.saveAgent({ instructions: 'Execute apenas a tarefa sintética da auditoria.', name: 'Claude', alias: 'cl', runtime: 'claude' })
    const first = conversation(a), second = conversation(b)
    let settled = false
    sends.push(service.send(first.id, 'Aguarde.').then(() => { settled = true }), service.send(second.id, 'Aguarde.'))
    await vi.waitFor(() => expect(service.store.runs().filter(run => run.turnId).length).toBe(2))
    codex.emit('disconnected', new Error('falha sintética'))
    await vi.waitFor(() => expect(service.store.runs().find(run => run.conversationId === first.id)?.status).toBe('failed'))
    expect(service.store.runs().find(run => run.conversationId === second.id)?.status).toBe('running')
    await vi.waitFor(() => expect(settled).toBe(true))
    claude.complete(claude.threads[0])
  })
})
