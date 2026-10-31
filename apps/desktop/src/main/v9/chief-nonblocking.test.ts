import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService, MAX_CONTINUATION_DEPTH } from './workspace'
import { WorkspaceQueue, chiefLaneKey } from './routing'
import type { Agent, Run } from '../../shared/v9'

/** Runtime falso: segura ou falha apenas os turnos dos agentes escolhidos, para separar Chief e Boo. */
class FakeRuntime extends EventEmitter {
  started = 0
  holdAgents = new Set<string>()
  failAgents = new Set<string>()
  agentByThread = new Map<string, string>()
  inputs: { agent: string; input: string }[] = []
  async thread(agent: Agent) {
    this.started++
    const id = `thread-${this.started}`
    this.agentByThread.set(id, agent.name)
    return { id, history: 'empty' as const }
  }
  async request(_method: string, params?: { threadId?: string }) {
    const threadId = params?.threadId || `thread-${this.started}`
    const turnId = `turn-${threadId.split('-').at(-1)}`
    const agent = this.agentByThread.get(threadId) || ''
    const fail = this.failAgents.has(agent)
    if (!this.holdAgents.has(agent)) setTimeout(() => {
      if (!fail) this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resposta de ${agent}.` } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: fail ? 'failed' : 'completed', ...(fail ? { error: { message: 'Falha simulada do Boo.' } } : {}) } } })
    })
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  async send(threadId: string, input: string) { this.inputs.push({ agent: this.agentByThread.get(threadId) || '', input }); return this.request('turn/start', { threadId }) }
  respond() {}
  async interrupt() {}
  async models() { return [] }
  close() {}
}

type Internals = { active: Map<string, AbortController>; callTool(context: unknown, name: string, args: Record<string, unknown>, callId: string): Promise<string> }
// Cada teste sobe um AppService com SQLite; sob a suíte inteira em paralelo 5 s é pouco.
vi.setConfig({ testTimeout: 30000 })
const dirs: string[] = []
const services: AppService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) { try { service.dispose() } catch { /* já liberado */ } }
  for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 })
}, 30000)

function setup(runtime: FakeRuntime) {
  const directory = mkdtempSync(join(tmpdir(), 'politron-chief-nonblocking-')); dirs.push(directory)
  const service = new AppService(directory, runtime as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  const chief = service.saveAgent({ name: 'Chefe', alias: 'chefe', instructions: 'Coordena.', canWrite: true, role: 'chief' })
  const worker = service.saveAgent({ name: 'Operário', alias: 'operario', instructions: 'Executa.', canWrite: false })
  const conversation = service.saveConversation({ kind: 'group', name: 'Equipe', agentIds: [chief.id, worker.id], workspacePath: directory })
  const run = { id: 'run-chief', conversationId: conversation.id, agentId: chief.id, rootId: 'run-chief', parentId: null, ancestry: [chief.id], status: 'running', threadId: null, turnId: null, messageId: 'chief-message', input: 'Pedido do usuário', agent: chief, workspaceId: conversation.workspaceId, workspacePath: directory, createdAt: new Date().toISOString() } as Run
  service.store.putRun(run)
  ;(service as unknown as Internals).active.set(run.id, new AbortController())
  const context = { run, conversation, agent: chief, message: { id: run.messageId, conversationId: conversation.id, agentId: chief.id, author: chief.name, role: 'assistant', text: '', status: 'running', runId: run.id, createdAt: run.createdAt } }
  const ask = (args: Record<string, unknown>, callId: string) => (service as unknown as Internals).callTool(context, 'ask_agent', { agent: worker.alias, ...args }, callId) as Promise<string>
  return { service, chief, worker, conversation, context, ask }
}

describe('Chief com delegação sem bloqueio', () => {
  it('ask_agent do Chief em mode=wait volta na hora com recibo e não segura o turno', async () => {
    const runtime = new FakeRuntime(); runtime.holdAgents.add('Operário')
    const { service, ask } = setup(runtime)
    const receipt = await Promise.race([ask({ task: 'Trabalho longo', mode: 'wait' }, 'call-wait'), new Promise<string>(resolve => setTimeout(() => resolve('TRAVADO'), 3000))])
    expect(receipt).not.toBe('TRAVADO')
    const delegation = service.store.delegations()[0]
    expect(receipt).toContain(delegation.id)
    expect(receipt).toContain('segundo plano')
    expect(['queued', 'running']).toContain(delegation.status)
    expect(delegation.continuationRunId).toBeUndefined()
  })

  it('mensagem do usuário é respondida pelo Chief enquanto o Boo ainda trabalha na pasta', async () => {
    const runtime = new FakeRuntime(); runtime.holdAgents.add('Operário')
    const { service, conversation, ask } = setup(runtime)
    await ask({ task: 'Trabalho longo', mode: 'background' }, 'call-bg')
    await vi.waitFor(() => expect(service.store.delegations()[0].status).toBe('running'))
    // Sem a faixa própria do Chief esta chamada ficaria atrás do Boo, que segura a pasta.
    await Promise.race([
      service.send(conversation.id, '@chefe como está o andamento?'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mensagem do usuário ficou presa atrás do Boo')), 5000)),
    ])
    const history = service.store.history(conversation.id)
    expect(history.find(message => message.role === 'user' && message.text.includes('andamento'))?.status).toBe('completed')
    expect(history.some(message => message.role === 'assistant' && message.author === 'Chefe' && message.text.includes('Resposta de Chefe.') && message.status === 'completed')).toBe(true)
    expect(service.store.delegations()[0].status).toBe('running')
  })

  it('término do Boo notifica e acorda o Chief uma única vez, mesmo sem missão aberta', async () => {
    const runtime = new FakeRuntime()
    const { service, conversation, ask } = setup(runtime)
    expect(service.store.openMission(conversation.id)).toBeFalsy()
    await ask({ task: 'Pedido curto', mode: 'background' }, 'call-notify')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.continuationRunId).toBeTruthy())
    const continuationId = service.store.delegation(delegation.id)!.continuationRunId!
    await vi.waitFor(() => expect(service.store.run(continuationId)?.status).toBe('completed'))
    const wake = runtime.inputs.filter(item => item.agent === 'Chefe' && item.input.includes('Notificação automática') && item.input.includes('foi concluído'))
    expect(wake).toHaveLength(1)
    expect(wake[0].input).toContain('Resposta de Operário.')
    // Repetir a mesma chamada não acorda de novo nem reexecuta o Boo.
    await ask({ task: 'Pedido curto', mode: 'background' }, 'call-notify')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(service.store.runs().filter(run => run.agentId === service.store.delegation(delegation.id)!.requesterAgentId && run.parentId === 'run-chief')).toHaveLength(1)
    expect(runtime.inputs.filter(item => item.input.includes('Notificação automática'))).toHaveLength(1)
  })

  it('falha do Boo também notifica o Chief', async () => {
    const runtime = new FakeRuntime(); runtime.failAgents.add('Operário')
    const { service, ask } = setup(runtime)
    await ask({ task: 'Vai falhar', mode: 'background' }, 'call-fail')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.continuationRunId).toBeTruthy())
    expect(service.store.delegation(delegation.id)).toMatchObject({ status: 'failed' })
    await vi.waitFor(() => expect(runtime.inputs.some(item => item.agent === 'Chefe' && item.input.includes('falhou ou ficou bloqueado') && item.input.includes('Falha simulada do Boo.'))).toBe(true))
    // Espera a continuação do Chief terminar antes do teardown, senão o dispose fecha o banco com o turno ainda ativo.
    await vi.waitFor(() => expect(service.store.run(service.store.delegation(delegation.id)!.continuationRunId!)?.status).toBe('completed'))
  })

  it('notificações encadeadas têm teto: após MAX_CONTINUATION_DEPTH o Chief não é mais acordado (sem laço Chief↔Boo)', async () => {
    const runtime = new FakeRuntime()
    const { service, context, ask } = setup(runtime)
    // Cada continuação herda a profundidade do pai + 1.
    await ask({ task: 'Rodada 1', mode: 'background' }, 'call-depth-1')
    const first = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(first.id)?.continuationRunId).toBeTruthy())
    expect(service.store.run(service.store.delegation(first.id)!.continuationRunId!)?.continuationDepth).toBe(1)
    // No teto: o Boo ainda executa e conclui, mas ninguém é acordado de novo.
    context.run.continuationDepth = MAX_CONTINUATION_DEPTH
    await ask({ task: 'Rodada no teto', mode: 'background' }, 'call-depth-cap')
    const capped = service.store.delegations().find(item => item.id !== first.id)!
    await vi.waitFor(() => expect(service.store.delegation(capped.id)?.status).toBe('completed'))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(service.store.delegation(capped.id)?.continuationRunId).toBeUndefined()
    expect(runtime.inputs.filter(item => item.input.includes('Notificação automática'))).toHaveLength(1)
  })

  it('cancelar a delegação não acorda o Chief', async () => {
    const runtime = new FakeRuntime(); runtime.holdAgents.add('Operário')
    const { service, ask } = setup(runtime)
    await ask({ task: 'Será cancelado', mode: 'background' }, 'call-cancel')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.status).toBe('running'))
    await service.cancelDelegation(delegation.id)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(service.store.delegation(delegation.id)?.continuationRunId).toBeUndefined()
    expect(runtime.inputs.some(item => item.input.includes('Notificação automática'))).toBe(false)
  })

  it('Boo comum continua esperando em wait (comportamento preservado)', async () => {
    const runtime = new FakeRuntime()
    const { service, worker, conversation } = setup(runtime)
    const other = service.saveAgent({ name: 'Colega', alias: 'colega', instructions: 'Ajuda.', canWrite: false })
    const run = service.store.run('run-chief')!
    const context = { run: { ...run, agentId: worker.id, agent: worker }, conversation: service.store.conversation(conversation.id), agent: worker, message: { id: 'm', conversationId: conversation.id, agentId: worker.id, author: worker.name, role: 'assistant', text: '', status: 'running', runId: run.id, createdAt: run.createdAt } }
    const result = await (service as unknown as Internals).callTool(context, 'ask_agent', { agent: other.alias, task: 'Responda' }, 'call-plain')
    expect(result).toContain('Resposta de Colega.')
  })
})

describe('WorkspaceQueue: faixa do Chief e prioridade', () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 5))

  it('faixa do Chief roda mesmo com a pasta ocupada e com o limite global cheio', async () => {
    const queue = new WorkspaceQueue()
    const release: (() => void)[] = []
    const hold = (key: string) => queue.enqueue(key, new AbortController().signal, () => new Promise<void>(resolve => { release.push(resolve) }))
    const a = hold('pasta-a'), b = hold('pasta-b')
    await tick()
    let ran = false
    await queue.enqueue(chiefLaneKey('pasta-a', 'conversa'), new AbortController().signal, async () => { ran = true }, { lane: true })
    expect(ran).toBe(true)
    release.forEach(fn => fn()); await Promise.all([a, b])
  })

  it('mensagem prioritária passa na frente das notificações, sem furar outras prioritárias', async () => {
    const queue = new WorkspaceQueue()
    const order: string[] = []
    let release!: () => void
    const key = chiefLaneKey('pasta', 'conversa')
    const first = queue.enqueue(key, new AbortController().signal, () => new Promise<void>(resolve => { release = resolve }), { lane: true })
    await tick()
    const push = (name: string, priority: boolean) => queue.enqueue(key, new AbortController().signal, async () => { order.push(name) }, { lane: true, priority })
    const all = [push('notificação', false), push('usuário 1', true), push('usuário 2', true)]
    release(); await Promise.all([first, ...all])
    expect(order).toEqual(['usuário 1', 'usuário 2', 'notificação'])
  })
})

describe('delegação em worktree própria', () => {
  it('em projeto git, cada Boo delegado em segundo plano ganha uma worktree e os dois rodam ao mesmo tempo', async () => {
    const runtime = new FakeRuntime(); runtime.holdAgents.add('Operário'); runtime.holdAgents.add('Revisor')
    const { service, chief, conversation, context } = setup(runtime)
    const repo = conversation.workspaceId ? service.store.workspace(conversation.workspaceId).path : ''
    for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.email', 'qa@boobot.test'], ['config', 'user.name', 'QA']]) execFileSync('git', args, { cwd: repo })
    writeFileSync(join(repo, 'README.md'), 'teste'); execFileSync('git', ['add', '.'], { cwd: repo }); execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo })
    const reviewer = service.saveAgent({ name: 'Revisor', alias: 'revisor', instructions: 'Revisa.', canWrite: false })
    const internals = service as unknown as Internals
    await internals.callTool(context, 'ask_agent', { agent: 'operario', task: 'Tarefa A' }, 'call-a')
    await internals.callTool(context, 'ask_agent', { agent: reviewer.alias, task: 'Tarefa B' }, 'call-b')
    // Os dois Boos começam sem esperar um pelo outro, cada um na sua worktree.
    await vi.waitFor(() => expect(runtime.inputs.filter(item => item.agent !== chief.name)).toHaveLength(2), { timeout: 20000 })
    const children = service.store.runs().filter(run => run.agentId !== chief.id)
    expect(new Set(children.map(run => run.workspacePath)).size).toBe(2)
    for (const run of children) {
      expect(run.workspacePath).not.toBe(repo)
      expect(service.store.workspace(run.workspaceId).kind).toBe('worktree')
      expect(run.input).toMatch(/^\[Worktree isolada: branch boo\//)
    }
  })
})
