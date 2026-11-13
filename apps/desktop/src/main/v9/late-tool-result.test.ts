// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from './workspace'
import type { AgentRuntime } from './agent-runtime'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

/** Runtime mínimo: permite emitir uma chamada de ferramenta e encerrar o turno quando o teste quiser. */
class Runtime extends EventEmitter {
  readonly sends: string[] = []
  private turns = 0
  async models() { return [] }
  async thread() { return { id: 'thread-1', history: 'empty' as const } }
  async send(_thread: string, input: string | { text: string }) {
    this.sends.push(typeof input === 'string' ? input : input.text)
    const turnId = `turn-${++this.turns}`
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  respond() {}
  async interrupt() {}
  close() {}
  toolCall(id: string, tool: string, args: Record<string, unknown>, turnId = `turn-${this.turns}`) {
    this.emit('event', { id, method: 'item/tool/call', params: { threadId: 'thread-1', turnId, tool, arguments: args } })
  }
  completeTurn(turnId = `turn-${this.turns}`) {
    this.emit('event', { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: turnId, status: 'completed' } } })
  }
}

const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

it('resultado de ferramenta que chega depois do turno vira uma continuação', async () => {
  const runtime = new Runtime()
  const directory = mkdtempSync(join(tmpdir(), 'politron-late-tool-'))
  directories.push(directory)
  const service = new AppService(directory, runtime as unknown as AgentRuntime)
  services.push(service)
  const agent = service.saveAgent({ name: 'Perguntadeira', alias: 'perguntadeira', instructions: 'Pergunte antes de agir.', approvalMode: 'ask' })
  const conversation = service.store.saveConversation({ name: 'Tardia', agentIds: [agent.id], kind: 'direct' })

  const first = service.send(conversation.id, 'Pergunte qual framework eu prefiro.')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))
  runtime.toolCall('call-1', 'ask_user', { question: 'Qual framework?', options: ['React', 'Vue'] })
  const approval = await vi.waitFor(() => {
    const pending = service.store.approvals().find(item => item.kind === 'question' && item.status === 'pending')
    expect(pending).toBeTruthy()
    return pending!
  })
  // O motor encerra o turno enquanto a pessoa ainda decide: é o caso real de uma resposta lenta.
  runtime.completeTurn('turn-1')
  await first
  expect(service.store.runs()[0]?.status).toBe('completed')

  await service.answerQuestion(approval.id, 'React')
  await vi.waitFor(() => expect(runtime.sends).toHaveLength(2))
  expect(runtime.sends[1]).toContain('Resultado real de ask_user')
  expect(runtime.sends[1]).toContain('React')
  const followUp = service.store.history(conversation.id).filter(message => message.role === 'user').at(-1)!
  expect(followUp.text).toContain('Resultado real de ask_user')
})

it('resposta rápida, com o turno aberto, não gera continuação extra', async () => {
  const runtime = new Runtime()
  const directory = mkdtempSync(join(tmpdir(), 'politron-late-tool-fast-'))
  directories.push(directory)
  const service = new AppService(directory, runtime as unknown as AgentRuntime)
  services.push(service)
  const agent = service.saveAgent({ name: 'Rápida', alias: 'rapida', instructions: 'Pergunte antes de agir.', approvalMode: 'ask' })
  const conversation = service.store.saveConversation({ name: 'Rápida', agentIds: [agent.id], kind: 'direct' })

  const first = service.send(conversation.id, 'Pergunte algo.')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))
  runtime.toolCall('call-2', 'ask_user', { question: 'Qual?', options: ['A', 'B'] })
  const approval = await vi.waitFor(() => {
    const pending = service.store.approvals().find(item => item.kind === 'question' && item.status === 'pending')
    expect(pending).toBeTruthy()
    return pending!
  })
  await service.answerQuestion(approval.id, 'A')
  await new Promise(resolve => setTimeout(resolve, 50))
  // Turno ainda em andamento: o resultado segue pelo caminho normal, sem mensagem nova.
  expect(runtime.sends).toHaveLength(1)
  runtime.completeTurn('turn-1')
  await first
})
