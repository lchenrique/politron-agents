// @vitest-environment node
import type { ClaudeInternals, CodexInternals, RuntimeEvent } from './test-support'
import { EventEmitter } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT, SCHEMA_VERSION, WorkspaceStore } from './store'
import { OpenCodeApiRuntime } from './opencode-api'
import { CodexRuntime } from './codex'
import { ClaudeRuntime } from './claude'
import { SessionUnavailableError } from './agent-runtime'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
const temporary = (prefix: string) => { const directory = mkdtempSync(join(tmpdir(), prefix)); directories.push(directory); return directory }

class AmbiguousRuntime extends EventEmitter {
  threadIds: string[] = []
  inputs: string[] = []
  failResume = false
  failNextSend = false
  emitBeforeFailure = false
  failAfterTool = false
  toolCalls = 0
  async models() { return [] }
  async thread(_agent: import('../../shared/v9').Agent, _directory: string, _tools: import('./codex').DynamicTool[], threadId?: string) {
    const id = threadId || `thread-${this.threadIds.length + 1}`
    this.threadIds.push(id)
    if (threadId && this.failResume) { this.failResume = false; throw new SessionUnavailableError('stale thread') }
    return { id, history: threadId ? 'retained' as const : 'empty' as const }
  }
  async send(threadId: string, input: string) {
    this.inputs.push(input)
    if (this.failNextSend) {
      this.failNextSend = false
      if (this.emitBeforeFailure) this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId: 'turn-ambiguous', delta: 'O provedor já começou a responder.' } })
      throw new Error('Timeout after request may have reached provider.')
    }
    const turnId = `turn-${this.inputs.length}`
    setTimeout(() => {
      if (this.failAfterTool && this.inputs.length > 1) {
        this.toolCalls++
        this.emit('event', { id: 'tool-started', method: 'item/tool/call', params: { threadId, turnId, tool: 'workspace_list', arguments: { path: '.' } } })
        return
      }
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: 'Resposta inicial.' } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
    }, 0)
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  respond(id?: number | string) {
    if (id !== 'tool-started') return
    setTimeout(() => this.emit('event', { method: 'turn/completed', params: { threadId: this.threadIds.at(-1), turn: { id: `turn-${this.inputs.length}`, status: 'failed', error: { message: 'Falha após iniciar a ferramenta.' } } } }), 0)
  }
  async interrupt() {}
  close() {}
}

describe('continuidade real de sessão', () => {
  it('OpenCode (API) só informa histórico retido enquanto a instância mantém a conversa em memória', async () => {
    const directory = temporary('politron-opencode-continuity-')
    const first = new OpenCodeApiRuntime(async () => 'chave-de-teste-com-tamanho-valido')
    const created = await first.thread({ ...ASSISTANT, runtime: 'opencode' }, directory, [])
    expect(created.history).toBe('empty')
    expect((await first.thread({ ...ASSISTANT, runtime: 'opencode' }, directory, [], created.id)).history).toBe('retained')
    first.close()

    const restarted = new OpenCodeApiRuntime(async () => 'chave-de-teste-com-tamanho-valido')
    expect((await restarted.thread({ ...ASSISTANT, runtime: 'opencode' }, directory, [], created.id)).history).toBe('empty')
    restarted.close()
  })

  it('Codex só declara retained depois de thread/resume aceito', async () => {
    const runtime = new CodexRuntime()
    vi.spyOn(runtime, 'start').mockResolvedValue()
    const request = vi.spyOn(runtime, 'request').mockResolvedValue({ thread: { id: 'codex-resumed' } })
    await expect(runtime.thread(ASSISTANT, temporary('politron-codex-session-'), [], 'saved-id')).resolves.toEqual({ id: 'codex-resumed', history: 'retained' })
    expect(request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({ threadId: 'saved-id' }))
    request.mockRejectedValueOnce(new Error('resume indisponível'))
    await expect(runtime.thread(ASSISTANT, tmpdir(), [], 'missing-id')).rejects.toThrow('resume indisponível')
  })

  it('só classifica como sessão perdida o erro de resume Codex inequívoco', async () => {
    const runtime = new CodexRuntime()
    const pending = (method: string) => new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000)
      ;(runtime as unknown as CodexInternals).pending.set(1, { method, resolve, reject, timer })
    })
    const stale = pending('thread/resume')
    ;(runtime as unknown as CodexInternals).receive({ id: 1, error: { code: -32600, message: 'thread/resume failed: no rollout found for thread id 01234567-89ab-cdef-0123-456789abcdef' } })
    await expect(stale).rejects.toBeInstanceOf(SessionUnavailableError)

    const configuration = pending('thread/resume')
    ;(runtime as unknown as CodexInternals).receive({ id: 1, error: { code: -32600, message: 'failed to load configuration: thread not found in invalid config' } })
    await expect(configuration).rejects.not.toBeInstanceOf(SessionUnavailableError)
  })

  it('Claude identifica sessão inexistente somente no erro de abertura antes de init', async () => {
    const directory = temporary('politron-claude-missing-session-')
    const sdk = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID missing-session'] }
      },
      close: vi.fn(),
    }))
    const runtime = new ClaudeRuntime(directory, async () => null, sdk as unknown as NonNullable<ConstructorParameters<typeof ClaudeRuntime>[2]>)
    ;(runtime as unknown as ClaudeInternals).executable = 'claude'
    const thread = await runtime.thread(ASSISTANT, directory, [], 'missing-session')
    const events: RuntimeEvent[] = []
    runtime.on('event', event => events.push(event))
    await expect(runtime.send(thread.id, 'Não reenvie automaticamente além da abertura segura.')).rejects.toBeInstanceOf(SessionUnavailableError)
    expect(events.some(event => event.method === 'item/agentMessage/delta' || event.method === 'item/tool/call')).toBe(false)
    runtime.close()
  })

  it('não repete um turno após timeout genérico de uma sessão que estava retida', async () => {
    const directory = temporary('politron-ambiguous-resume-')
    const runtime = new AmbiguousRuntime()
    const service = new AppService(directory, runtime as unknown as ConstructorParameters<typeof AppService>[1])
    try {
      const conversation = service.saveConversation({ name: 'Sem repetição' })
      await service.send(conversation.id, 'Primeiro pedido')
      runtime.failNextSend = true
      runtime.emitBeforeFailure = true
      await service.send(conversation.id, 'Segundo pedido ambíguo')
      expect(runtime.threadIds).toHaveLength(2)
      expect(runtime.threadIds[1]).toBe(runtime.threadIds[0])
      expect(runtime.inputs).toHaveLength(2)
      expect(service.store.runs().map(run => run.status)).toEqual(['completed', 'failed'])
    } finally { service.dispose() }
  })

  it('renova binding só após confirmação explícita de sessão inexistente e envia uma vez', async () => {
    const directory = temporary('politron-stale-binding-')
    const runtime = new AmbiguousRuntime()
    const service = new AppService(directory, runtime as unknown as ConstructorParameters<typeof AppService>[1])
    try {
      const conversation = service.saveConversation({ name: 'Binding antigo' })
      await service.send(conversation.id, 'Primeiro pedido')
      runtime.failResume = true
      await service.send(conversation.id, 'Pedido após sessão perdida')
      expect(runtime.threadIds).toEqual(['thread-1', 'thread-1', 'thread-3'])
      expect(runtime.inputs).toHaveLength(2)
      expect(runtime.inputs[1]).toContain('Primeiro pedido')
      expect(runtime.inputs[1]).toContain('Pedido após sessão perdida')
      expect(service.store.runs().map(run => run.status)).toEqual(['completed', 'completed'])
    } finally { service.dispose() }
  })

  it('não reenvia um turno depois que uma ferramenta já foi iniciada', async () => {
    const directory = temporary('politron-tool-no-retry-')
    const runtime = new AmbiguousRuntime()
    const service = new AppService(directory, runtime as unknown as ConstructorParameters<typeof AppService>[1])
    try {
      const conversation = service.saveConversation({ name: 'Ferramenta sem repetição' })
      await service.send(conversation.id, 'Primeiro pedido')
      runtime.failAfterTool = true
      await service.send(conversation.id, 'Segundo pedido com ferramenta')
      expect(runtime.toolCalls).toBe(1)
      expect(runtime.inputs).toHaveLength(2)
      expect(service.store.runs().map(run => run.status)).toEqual(['completed', 'failed'])
    } finally { service.dispose() }
  })

  it('migra schema 7 uma vez, preserva binding antigo sem alegar runtime conhecido e cria backup', () => {
    const directory = temporary('politron-schema7-session-')
    const database = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    database.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','7');
      INSERT INTO v9_sessions VALUES ('conversation:agent','persisted-thread');`)
    database.close()

    const store = new WorkspaceStore(directory)
    try {
      expect(SCHEMA_VERSION).toBe(12)
      expect(store.sessionBinding('conversation:agent')).toEqual({ key: 'conversation:agent', threadId: 'persisted-thread', runtime: null, contextVersion: 0, deliveredDigests: {} })
      store.putSessionBinding({ key: 'new-binding', threadId: 'thread-2', runtime: 'codex', contextVersion: 1, deliveredDigests: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`message-${index}`, `hash-${index}`])) })
      expect(Object.keys(store.sessionBinding('new-binding')!.deliveredDigests)).toHaveLength(40)
      store.deleteSessionBinding('new-binding')
      expect(store.sessionBinding('new-binding')).toBeUndefined()
    } finally { store.close() }
    expect(readdirSync(directory).some(file => file.startsWith('politron-v9.backup-schema7-'))).toBe(true)

    const reopened = new WorkspaceStore(directory)
    try { expect(reopened.sessionBinding('conversation:agent')?.threadId).toBe('persisted-thread') } finally { reopened.close() }
  })
})
