import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from './workspace'
import type { AgentRuntime } from './agent-runtime'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

class Runtime extends EventEmitter {
  private turn = 0
  async models() { return [] }
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
  send = vi.fn(async () => ({ turn: { id: `turn-${++this.turn}`, status: 'inProgress' } }))
  steer = vi.fn(async () => {})
  respond() {}
  interrupt = vi.fn(async () => {})
  close() {}
  complete(turnId: string) { this.emit('event', { method: 'turn/completed', params: { threadId: 'thread-test', turn: { id: turnId, status: 'completed' } } }) }
}

const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})
function setup(withSteering = false) {
  const runtime = new Runtime()
  if (!withSteering) Object.assign(runtime, { steer: undefined })
  const directory = mkdtempSync(join(tmpdir(), 'politron-queue-'))
  directories.push(directory)
  const service = new AppService(directory, runtime as unknown as AgentRuntime)
  services.push(service)
  const conversation = service.store.saveConversation({})
  const send = (text: string, requestId: string, delivery: 'queue' | 'now' = 'queue') => service.send(
    conversation.id, text, undefined, undefined, undefined, false, true, false,
    { requestId, delivery, returnAfterAcceptance: true },
  )
  return { service, runtime, conversation, send }
}
const requestId = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`

it('aceita mensagem explicitamente na fila durante execução sem steering', async () => {
  const { service, runtime, conversation, send } = setup(false)
  const first = service.send(conversation.id, 'Primeira tarefa')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))

  await send('Segunda tarefa', requestId('1'))

  const queuedUser = service.store.history(conversation.id).find(message => message.id === requestId('1'))
  expect(queuedUser).toMatchObject({ role: 'user', text: 'Segunda tarefa', status: 'queued' })
  expect(service.store.runs().filter(run => run.conversationId === conversation.id)).toHaveLength(2)
  expect(service.store.runs().find(run => run.inputMessageId === requestId('1'))?.status).toBe('queued')
  expect(runtime.send).toHaveBeenCalledTimes(1)

  runtime.complete('turn-1')
  await vi.waitFor(() => expect(service.store.runs().find(run => run.inputMessageId === requestId('1'))?.turnId).toBe('turn-2'))
  expect(service.store.message(requestId('1'))?.status).toBe('completed')
  runtime.complete('turn-2')
  await first
})

it('enfileira por padrão durante execução, mesmo quando o runtime aceita steering', async () => {
  const { service, runtime, conversation } = setup(true)
  const first = service.send(conversation.id, 'Primeira tarefa')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))

  const second = service.send(conversation.id, 'Mensagem padrão na fila')

  expect(runtime.steer).not.toHaveBeenCalled()
  expect(service.store.runs()).toHaveLength(2)
  expect(service.store.history(conversation.id).find(message => message.role === 'user' && message.text === 'Mensagem padrão na fila')).toMatchObject({ role: 'user', text: 'Mensagem padrão na fila', status: 'queued' })
  runtime.complete('turn-1')
  await vi.waitFor(() => expect(service.store.runs().find(run => run.input === 'Mensagem padrão na fila')?.turnId).toBe('turn-2'))
  runtime.complete('turn-2')
  await Promise.all([first, second])
})

it('delivery now usa steering somente quando explicitamente escolhido', async () => {
  const { service, runtime, conversation, send } = setup(true)
  const first = service.send(conversation.id, 'Primeira tarefa')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))

  await send('Acrescente um teste', requestId('2'), 'now')

  expect(runtime.steer).toHaveBeenCalledWith('thread-test', 'turn-1', 'Acrescente um teste')
  expect(runtime.send).toHaveBeenCalledTimes(1)
  expect(service.store.runs()).toHaveLength(1)
  runtime.complete('turn-1')
  await first
})

it('recusa Enviar agora sem steering ativo e nunca transforma em uma nova execução', async () => {
  const { service, runtime, conversation, send } = setup(true)
  await expect(send('Instrução sem execução ativa', requestId('7'), 'now')).rejects.toThrow(/steering compatível/i)
  expect(runtime.send).not.toHaveBeenCalled()
  expect(service.store.history(conversation.id)).toHaveLength(0)
})

it('requestId repetido na mesma conversa retorna a aceitação existente sem duplicar execução', async () => {
  const { service, runtime, conversation, send } = setup(false)
  const first = service.send(conversation.id, 'Primeira tarefa')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))
  const id = requestId('3')

  await send('Tarefa repetida', id)
  await send('Tarefa repetida', id)

  expect(service.store.history(conversation.id).filter(message => message.id === id)).toHaveLength(1)
  expect(service.store.runs().filter(run => run.inputMessageId === id)).toHaveLength(1)
  expect(runtime.send).toHaveBeenCalledTimes(1)
  runtime.complete('turn-1')
  await vi.waitFor(() => expect(service.store.runs().find(run => run.inputMessageId === id)?.turnId).toBe('turn-2'))
  runtime.complete('turn-2')
  await first
})

it('cancela apenas a mensagem ainda enfileirada sem parar a execução ativa', async () => {
  const { service, runtime, conversation, send } = setup(false)
  const first = service.send(conversation.id, 'Primeira tarefa')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-1'))
  const id = requestId('4')
  await send('Cancelar esta tarefa', id)

  await service.cancelQueuedMessage(id)

  expect(service.store.message(id)?.status).toBe('cancelled')
  expect(service.store.runs().find(run => run.inputMessageId === id)?.status).toBe('cancelled')
  expect(service.store.runs().find(run => run.turnId === 'turn-1')?.status).toBe('running')
  expect(runtime.interrupt).not.toHaveBeenCalled()
  runtime.complete('turn-1')
  await first
})
