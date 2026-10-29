// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'
import type { AgentRuntime } from './agent-runtime'

const directories: string[] = []
const services: AppService[] = []
afterEach(() => { for (const service of services.splice(0)) service.dispose(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis)

type Step = { method: string; params?: Record<string, unknown>; id?: string }
/** Um roteiro por turno (send); cada turno ganha um id próprio e termina com turn/completed. */
class MultiTurnRuntime extends EventEmitter {
  readonly inputs: string[] = []
  private script: Step[] = []
  private turn = 0
  constructor(private readonly turns: Step[][]) { super() }
  async models() { return [] }
  async thread() { return { id: 'thread-1', history: 'empty' as const } }
  async send(_thread: string, input: string | { text: string }) {
    this.inputs.push(typeof input === 'string' ? input : input.text)
    const turnId = `turn-${++this.turn}`
    const steps = this.turns.shift() || [{ method: 'item/agentMessage/delta', params: { delta: 'ok' } }]
    this.script = [...steps, { method: 'turn/completed', params: { turn: { id: turnId, status: (steps as Step[] & { status?: string }).status || 'completed' } } }]
    setTimeout(() => this.next(turnId), 0)
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  private current = ''
  private next(turnId = this.current) {
    this.current = turnId
    const step = this.script.shift()
    if (!step) return
    this.emit('event', { id: step.id, method: step.method, params: { threadId: 'thread-1', turnId, ...step.params } })
    if (step.method !== 'item/tool/call') setTimeout(() => this.next(), 0)
  }
  respond() { setTimeout(() => this.next(), 0) }
  async interrupt(_threadId: string, _turnId: string) {}
  close() {}
}
class LateReflectionRuntime extends MultiTurnRuntime {
  readonly reflectionStarted: Promise<void>
  readonly interruptedTurns: string[] = []
  private markReflectionStarted!: () => void
  constructor(turns: Step[][]) {
    super(turns)
    this.reflectionStarted = new Promise(resolve => { this.markReflectionStarted = resolve })
  }
  override async send(threadId: string, input: string | { text: string }) {
    const text = typeof input === 'string' ? input : input.text
    if (!text.includes('Revisão interna')) return super.send(threadId, input)
    this.inputs.push(text)
    this.markReflectionStarted()
    await new Promise<void>(resolve => nativeSetTimeout(resolve, 20))
    return { thread: { id: threadId }, turn: { id: 'late-reflection', status: 'inProgress' } }
  }
  override async interrupt(_threadId: string, turnId: string) { this.interruptedTurns.push(turnId) }
}
let seq = 0
const tool = (name: string, args: Record<string, unknown> = {}): Step => ({ id: `t${++seq}`, method: 'item/tool/call', params: { tool: name, arguments: args } })
const say = (text: string): Step => ({ method: 'item/agentMessage/delta', params: { delta: text } })
const work = (count: number) => [...Array.from({ length: count }, () => tool('workspace_list', { path: '.' })), say('Feito.')]
const failed = (steps: Step[]) => Object.assign(steps, { status: 'failed' })

function setup(turns: Step[][]) {
  const directory = mkdtempSync(join(tmpdir(), 'politron-reflection-')); directories.push(directory)
  const runtime = new MultiTurnRuntime(turns)
  const service = new AppService(directory, runtime as unknown as AgentRuntime)
  services.push(service)
  const conversation = service.saveConversation({ name: 'Aprender' })
  return { service, runtime, conversation }
}
const reflections = (runtime: MultiTurnRuntime) => runtime.inputs.filter(input => input.includes('Revisão interna'))

describe('autoaprendizado no fim da execução', () => {
  it('após trabalho relevante pede uma revisão oculta na mesma thread e registra o aprendizado', async () => {
    const { service, runtime, conversation } = setup([
      work(5),
      [tool('save_skill', { operation: 'create', slug: 'listar-raiz', name: 'Listar raiz', description: 'Quando precisar ver a raiz.', content: 'Use workspace_list.' }), say('Gravei a skill listar-raiz.')],
    ])
    await service.send(conversation.id, 'Explore o projeto')
    expect(runtime.inputs).toHaveLength(2)
    expect(reflections(runtime)).toHaveLength(1)
    const history = service.store.history(conversation.id)
    expect(history.some(message => message.text.includes('Gravei'))).toBe(false)
    expect(history.some(message => message.text.includes('Revisão interna'))).toBe(false)
    expect(history.filter(message => message.role === 'assistant' && message.text.trim()).map(message => message.text)).toEqual(['Feito.'])
    expect(history.filter(message => message.role === 'activity').at(-1)?.text).toBe('Aprendizado · Listar raiz')
    expect(service.store.runs()[0]!.status).toBe('completed')
  })

  it('não repete a revisão (sem laço) mesmo que a revisão use várias ferramentas, e só aceita ferramentas de skill nela', async () => {
    const { service, runtime, conversation } = setup([work(6), [...Array.from({ length: 6 }, () => tool('list_skills')), tool('workspace_list', { path: '.' }), say('nada a aprender')]])
    await service.send(conversation.id, 'Explore')
    expect(runtime.inputs).toHaveLength(2)
    const activities = service.store.history(conversation.id).filter(message => message.role === 'activity')
    expect(activities).toHaveLength(6)
  })

  it('erro de ferramenta corrigido dispara a revisão mesmo com poucas chamadas', async () => {
    const { service, runtime, conversation } = setup([[tool('workspace_read', { path: 'nao-existe.txt' }), tool('workspace_list', { path: '.' }), say('Ok.')]])
    await service.send(conversation.id, 'Leia')
    expect(reflections(runtime)).toHaveLength(1)
  })

  it('não revisa execução trivial, em modo plano ou que falhou', async () => {
    const trivial = setup([work(2)])
    await trivial.service.send(trivial.conversation.id, 'Oi')
    expect(trivial.runtime.inputs).toHaveLength(1)

    const plan = setup([work(6)])
    await plan.service.send(plan.conversation.id, 'Planeje', undefined, undefined, undefined, false, true, true)
    expect(plan.runtime.inputs).toHaveLength(1)

    const broken = setup([failed(work(6))])
    await broken.service.send(broken.conversation.id, 'Quebre')
    expect(broken.service.store.runs()[0]!.status).toBe('failed')
    expect(broken.runtime.inputs).toHaveLength(1)
  })

  it('a mensagem enfileirada roda depois da revisão, na mesma thread', async () => {
    const { service, runtime, conversation } = setup([work(5), [say('nada a aprender')], [say('Segunda resposta.')]])
    const first = service.send(conversation.id, 'Primeira')
    await vi.waitFor(() => expect(runtime.inputs).toHaveLength(1))
    const second = service.send(conversation.id, 'Segunda')
    await Promise.all([first, second])
    expect(runtime.inputs).toHaveLength(3)
    expect(runtime.inputs[1]).toContain('Revisão interna')
    expect(runtime.inputs[2]).toContain('Segunda')
    const replies = service.store.history(conversation.id).filter(message => message.role === 'assistant' && message.text.trim()).map(message => message.text)
    expect(replies).toEqual(['Feito.', 'Segunda resposta.'])
  })

  it('libera a fila quando o envio da revisão retorna depois que seu prazo já expirou', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-reflection-late-')); directories.push(directory)
    const runtime = new LateReflectionRuntime([work(5), [say('Segunda resposta.')]])
    const service = new AppService(directory, runtime as unknown as AgentRuntime); services.push(service)
    const conversation = service.saveConversation({ name: 'Fila após revisão' })
    const schedule = globalThis.setTimeout.bind(globalThis)
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
      schedule(callback, delay === 60_000 ? 1 : delay, ...args)) as typeof setTimeout)
    try {
      const first = service.send(conversation.id, 'Primeira tarefa')
      void first.catch(() => undefined)
      await runtime.reflectionStarted
      expect(service.store.runs().find(run => run.input === 'Primeira tarefa')?.status).toBe('completed')

      const second = service.send(conversation.id, 'Segunda tarefa')
      void second.catch(() => undefined)
      expect(service.store.runs().find(run => run.input === 'Segunda tarefa')?.status).toBe('queued')
      await new Promise<void>(resolve => nativeSetTimeout(resolve, 40))

      expect(runtime.inputs.some(input => input.includes('Segunda tarefa'))).toBe(true)
      expect(runtime.interruptedTurns).toContain('late-reflection')
      await Promise.all([first, second])
    } finally { timer.mockRestore() }
  })

  it('o turno recebe a lista curta de skills disponíveis', async () => {
    const { service, runtime, conversation } = setup([work(1)])
    await (service as unknown as { skills: { save: (input: object) => Promise<unknown> } }).skills.save({ operation: 'create', slug: 'deploy-coolify', name: 'Deploy no Coolify', description: 'Quando subir o front.', content: 'Passos.' })
    await service.send(conversation.id, 'Oi')
    expect(runtime.inputs[0]).toContain('Skills disponíveis')
    expect(runtime.inputs[0]).toContain('Deploy no Coolify (slug deploy-coolify): Quando subir o front.')
  })
})
