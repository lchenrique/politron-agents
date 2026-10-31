// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Query, SDKMessage, query } from '@anthropic-ai/claude-agent-sdk'
import { ASSISTANT } from './store'
import { ClaudeRuntime } from './claude'
import { effectiveRuntimeAgent } from './runtime-permissions'
import { AppService } from './workspace'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

const directories: string[] = []
const runtimes: ClaudeRuntime[] = []
const services: AppService[] = []
const initialized = { type: 'system', subtype: 'init', session_id: 'claude-session' } as SDKMessage
const success = { type: 'result', subtype: 'success', is_error: false } as SDKMessage
class NoopRuntime extends EventEmitter { close() {} }

function setup(stream: (closed: Promise<void>) => AsyncGenerator<SDKMessage>) {
  const directoryPromise = mkdtemp(join(tmpdir(), 'politron-claude-lifecycle-'))
  let closeStream!: () => void
  const closed = new Promise<void>(resolve => { closeStream = resolve })
  let session: AsyncGenerator<SDKMessage> & { close: ReturnType<typeof vi.fn> }
  const querySdk = vi.fn(() => {
    session = stream(closed) as typeof session
    session.close = vi.fn(() => closeStream())
    return session as any
  })
  return directoryPromise.then(async directory => {
    directories.push(directory)
    const runtime = new ClaudeRuntime(directory, async () => null, querySdk as any)
    ;(runtime as any).executable = 'claude'
    const threadId = (await runtime.thread(ASSISTANT, directory, [])).id
    runtimes.push(runtime)
    const events: any[] = []
    runtime.on('event', event => events.push(event))
    return { runtime, threadId, events, session: () => session! }
  })
}

afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  for (const runtime of runtimes.splice(0)) runtime.close()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function terminal(events: any[]) {
  await vi.waitFor(() => expect(events.filter(event => event.method === 'turn/completed')).toHaveLength(1))
  return events.find(event => event.method === 'turn/completed')
}

describe('ciclo de vida do turno Claude', () => {
  it('encerra com falha se o stream chegar a EOF depois do init sem result', async () => {
    const context = await setup(async function* () { yield initialized })

    await context.runtime.request('turn/start', { threadId: context.threadId, input: [{ text: 'Teste' }] })
    const event = await terminal(context.events)

    expect(event.params.turn.status).toBe('failed')
    expect(context.session().close).toHaveBeenCalledOnce()
  })

  it('emite exatamente um término de sucesso para init, result e EOF', async () => {
    const context = await setup(async function* () { yield initialized; yield success })

    await context.runtime.request('turn/start', { threadId: context.threadId, input: [{ text: 'Teste' }] })
    const event = await terminal(context.events)

    expect(event.params.turn.status).toBe('completed')
    expect(context.events.filter(item => item.method === 'turn/completed')).toHaveLength(1)
  })

  it('falha a solicitação e emite um término se o stream quebrar antes do init', async () => {
    const context = await setup(async function* () { throw new Error('falha antes do init') })

    await expect(context.runtime.request('turn/start', { threadId: context.threadId, input: [{ text: 'Teste' }] })).rejects.toThrow('falha antes do init')
    const event = await terminal(context.events)

    expect(event.params.turn.status).toBe('failed')
  })

  it('termina em falha depois de texto sem emitir um segundo evento terminal', async () => {
    const context = await setup(async function* () {
      yield initialized
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Resposta parcial' }] } } as SDKMessage
      throw new Error('falha depois do texto')
    })

    await context.runtime.request('turn/start', { threadId: context.threadId, input: [{ text: 'Teste' }] })
    const event = await terminal(context.events)

    expect(event.params.turn.status).toBe('failed')
    expect(context.events.some(item => item.method === 'item/agentMessage/delta' && item.params.delta === 'Resposta parcial')).toBe(true)
    expect(context.events.filter(item => item.method === 'turn/completed')).toHaveLength(1)
  })

  it('interrompe o turno, fecha sua consulta e rejeita somente a espera da ferramenta desse turno', async () => {
    const context = await setup(async function* (closed) { yield initialized; await closed })
    await context.runtime.request('turn/start', { threadId: context.threadId, input: [{ text: 'Teste' }] })
    const thread = (context.runtime as any).threads.get(context.threadId)
    const turn = thread.activeTurn
    let rejectTool!: (error: Error) => void
    const pendingTool = new Promise<void>((_, reject) => { rejectTool = reject })
    ;(context.runtime as any).waits.set('tool-call', { turn, resolve: vi.fn(), reject: rejectTool })
    const unrelatedReject = vi.fn()
    ;(context.runtime as any).waits.set('other-call', { turn: { id: 'another-turn' }, resolve: vi.fn(), reject: unrelatedReject })
    const toolRejection = pendingTool.then(() => '', error => String(error))

    await context.runtime.interrupt(context.threadId)
    const event = await terminal(context.events)
    expect(await toolRejection).toMatch(/encerrada|interrompida/i)

    expect(event.params.turn.status).toBe('interrupted')
    expect(context.session().close).toHaveBeenCalledOnce()
    expect(unrelatedReject).not.toHaveBeenCalled()
  })

  it('libera a fila para o próximo envio após falha do Claude sem result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'politron-claude-queue-'))
    directories.push(directory)
    let queryCount = 0
    const querySdk = vi.fn(() => {
      const current = queryCount++
      const session = (async function* () {
        yield { ...initialized, session_id: `queue-session-${current}` }
        if (current === 0) return
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Segunda tarefa concluída.' }] } } as SDKMessage
        yield success
      })() as AsyncGenerator<SDKMessage> & { close: ReturnType<typeof vi.fn> }
      session.close = vi.fn()
      return session as any
    })
    const claude = new ClaudeRuntime(directory, async () => null, querySdk as any)
    ;(claude as any).executable = 'claude'
    runtimes.push(claude)
    const service = new AppService(directory, new NoopRuntime() as any, claude)
    services.push(service)
    const agent = service.saveAgent({ name: 'Claude', alias: 'claude', instructions: 'Responda à tarefa.', runtime: 'claude', canWrite: false })
    const conversation = service.saveConversation({ kind: 'direct', name: 'Fila Claude', agentIds: [agent.id] })

    await service.send(conversation.id, 'Primeira tarefa')
    expect(service.store.runs().at(-1)?.status).toBe('failed')
    await service.send(conversation.id, 'Segunda tarefa')

    expect(service.store.runs().map(run => run.status)).toEqual(['failed', 'completed'])
    expect(service.store.history(conversation.id).some(message => message.text === 'Segunda tarefa concluída.')).toBe(true)
    expect(querySdk).toHaveBeenCalledTimes(2)
  })
})

describe('Acesso total no Claude', () => {
  it.each([{ planMode: true }, { boardReview: true }])('bloqueia ferramentas nativas no Claude com escopo %j, inclusive ao retomar', async scope => {
    const directory = await mkdtemp(join(tmpdir(), 'politron-claude-restricted-'))
    directories.push(directory)
    const querySdk = vi.fn<typeof query>(() => (async function* () { yield initialized; yield success })() as unknown as Query)
    const runtime = new ClaudeRuntime(directory, async () => null, querySdk)
    Object.assign(runtime, { executable: 'claude' })
    runtimes.push(runtime)
    const agent = effectiveRuntimeAgent({ ...ASSISTANT, runtimePermissionMode: 'bypass' as const }, scope)
    const thread = await runtime.thread(agent, directory, [], 'existing-session')
    await runtime.send(thread.id, 'Analise')
    const options = querySdk.mock.calls[0][0].options
    expect(options).toMatchObject({ permissionMode: 'default', allowDangerouslySkipPermissions: false, tools: [], resume: 'existing-session' })
    expect(options?.disallowedTools).toEqual(expect.arrayContaining(['Write', 'Edit', 'Bash', 'NotebookEdit', 'MultiEdit']))
  })

  it('libera as ferramentas nativas com bypass e mostra Bash como atividade', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'politron-claude-full-'))
    directories.push(directory)
    const querySdk = vi.fn(() => (async function* () {
      yield initialized
      yield { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'npm test' } }, { type: 'tool_use', id: 'tool-2', name: 'mcp__politron__workspace_read', input: {} }] } } as unknown as SDKMessage
      yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok', is_error: false }] } } as unknown as SDKMessage
      yield success
    })() as any)
    const runtime = new ClaudeRuntime(directory, async () => null, querySdk as any)
    ;(runtime as any).executable = 'claude'
    runtimes.push(runtime)
    const threadId = (await runtime.thread({ ...ASSISTANT, runtime: 'claude', runtimePermissionMode: 'bypass' }, directory, [])).id
    const events: any[] = []
    runtime.on('event', event => events.push(event))
    await runtime.request('turn/start', { threadId, input: [{ text: 'Rode os testes' }] })
    await terminal(events)
    const options = (querySdk.mock.calls[0] as any)[0].options
    expect(options.permissionMode).toBe('bypassPermissions')
    expect(options.tools).toBeUndefined()
    expect(options.disallowedTools).toEqual(['AskUserQuestion', 'ExitPlanMode'])
    const native = events.filter(event => event.params?.item?.type === 'nativeTool')
    expect(native.map(event => [event.method, event.params.item.id])).toEqual([['item/started', 'tool-1'], ['item/completed', 'tool-1']])
  })
})
