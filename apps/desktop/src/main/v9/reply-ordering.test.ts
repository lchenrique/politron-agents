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

type Step = { method: string; params?: Record<string, unknown>; id?: string }
/** Runtime roteirizado: cada etapa é emitida em ordem; uma chamada de ferramenta pausa até o Politron responder. */
class ScriptedRuntime extends EventEmitter {
  constructor(private readonly script: Step[]) { super() }
  private threadId = 'thread-1'
  private turnId = 'turn-1'
  async models() { return [] }
  async thread() { return { id: this.threadId, history: 'empty' as const } }
  async send() { setTimeout(() => this.next(), 0); return { turn: { id: this.turnId, status: 'inProgress' } } }
  private next() {
    const step = this.script.shift()
    if (!step) return
    this.emit('event', { id: step.id, method: step.method, params: { threadId: this.threadId, turnId: this.turnId, ...step.params } })
    if (step.method !== 'item/tool/call') setTimeout(() => this.next(), 0)
  }
  respond() { setTimeout(() => this.next(), 0) }
  async interrupt() {}
  close() {}
}
const tool = (id: string, name: string, args: Record<string, unknown>): Step => ({ id, method: 'item/tool/call', params: { tool: name, arguments: args } })
const done: Step = { method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } }

async function play(script: Step[], during?: (service: AppService, conversationId: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'politron-reply-order-')); directories.push(directory)
  const service = new AppService(directory, new ScriptedRuntime(script) as unknown as AgentRuntime)
  services.push(service)
  const conversation = service.saveConversation({ name: 'Ordem' })
  const sending = service.send(conversation.id, 'Abra o site')
  await during?.(service, conversation.id)
  await sending
  const history = service.store.history(conversation.id).filter(message => message.role !== 'user')
  const runId = history[0]!.runId!
  return { service, history, runId, run: service.store.runs().find(item => item.id === runId)! }
}

describe('ordem da resposta depois do trabalho', () => {
  it('mantém o preâmbulo, registra a atividade e cria a resposta final no fim (Codex, com item id)', async () => {
    const { history, run, service } = await play([
      { method: 'item/agentMessage/delta', params: { itemId: 'i1', delta: 'Vou abrir o site.' } },
      { method: 'item/completed', params: { item: { type: 'agentMessage', id: 'i1', text: 'Vou abrir o site.' } } },
      tool('t1', 'workspace_list', { path: '.' }),
      { method: 'item/agentMessage/delta', params: { itemId: 'i2', delta: 'Pronto' } },
      { method: 'item/agentMessage/delta', params: { itemId: 'i2', delta: ', abri.' } },
      { method: 'item/completed', params: { item: { type: 'agentMessage', id: 'i2', text: 'Pronto, abri.' } } },
      done,
    ])
    expect(history.map(message => [message.role, message.text, message.status])).toEqual([
      ['assistant', 'Vou abrir o site.', 'completed'],
      ['activity', 'Leitura · .', 'completed'],
      ['assistant', 'Pronto, abri.', 'completed'],
    ])
    expect(new Set(history.map(message => message.runId))).toEqual(new Set([run.id]))
    expect(run.status).toBe('completed')
    // run.messageId acompanha a última resposta do run.
    expect(run.messageId).toBe(history[2]!.id)
    expect(service.store.message(history[0]!.id)?.text).toBe('Vou abrir o site.')
  })

  it('separa o texto acumulado de runtimes sem item id (Pi/OpenCode/CLI)', async () => {
    const { history } = await play([
      { method: 'item/agentMessage/delta', params: { delta: 'Antes.' } },
      tool('t1', 'workspace_run_command_inexistente', {}),
      { method: 'item/agentMessage/delta', params: { delta: 'Depois.' } },
      { method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Antes.\n\nDepois.' } } },
      done,
    ])
    expect(history.map(message => [message.role, message.text])).toEqual([
      ['assistant', 'Antes.'],
      ['activity', 'Ferramenta · workspace_run_command_inexistente'],
      ['assistant', 'Depois.'],
    ])
  })

  it('sem preâmbulo, a mensagem inicial fica vazia e concluída e a resposta vem depois da atividade', async () => {
    const { history } = await play([tool('t1', 'workspace_list', {}), { method: 'item/agentMessage/delta', params: { delta: 'Fim.' } }, done])
    expect(history.map(message => [message.role, message.text, message.status])).toEqual([
      ['assistant', '', 'completed'],
      ['activity', 'Leitura · .', 'completed'],
      ['assistant', 'Fim.', 'completed'],
    ])
  })

  it('aprovações e perguntas marcam a mensagem atual do run', async () => {
    const { history } = await play([
      { method: 'item/agentMessage/delta', params: { delta: 'Olhando.' } },
      tool('t1', 'workspace_list', {}),
      { method: 'item/agentMessage/delta', params: { delta: 'Preciso confirmar.' } },
      tool('t2', 'ask_user', { question: 'Qual?', options: ['A', 'B'] }),
      { method: 'item/agentMessage/delta', params: { delta: ' Feito.' } },
      done,
    ], async (service, conversationId) => {
      await vi.waitFor(() => expect(service.store.approvals().some(item => item.kind === 'question' && item.status === 'pending')).toBe(true))
      const replies = service.store.history(conversationId).filter(message => message.role === 'assistant')
      expect(replies.map(message => message.status)).toEqual(['completed', 'waiting'])
      await service.answerQuestion(service.store.approvals().find(item => item.status === 'pending')!.id, 'A')
      expect(service.store.history(conversationId).filter(message => message.role === 'assistant').at(-1)!.status).toBe('running')
    })
    expect(history.map(message => [message.role, message.text, message.status])).toEqual([
      ['assistant', 'Olhando.', 'completed'],
      ['activity', 'Leitura · .', 'completed'],
      ['assistant', 'Preciso confirmar. Feito.', 'completed'],
    ])
  })
})
