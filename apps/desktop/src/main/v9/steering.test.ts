import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'
import { CodexRuntime } from './codex'
import { messageDigest } from './conversation-context'

class Runtime extends EventEmitter {
  async models() { return [] }
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
  send = vi.fn(async () => ({ turn: { id: 'turn-test', status: 'inProgress' } }))
  respond() {}
  async interrupt() {}
  close() {}
}
const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})
function setup(supported: boolean) {
  const runtime = new Runtime()
  const steer = vi.fn(async () => {})
  if (supported) Object.assign(runtime, { steer })
  const directory = mkdtempSync(join(tmpdir(), 'politron-steer-'))
  directories.push(directory)
  const service = new AppService(directory, runtime)
  services.push(service)
  const conversation = service.store.saveConversation({})
  const complete = () => runtime.emit('event', { method: 'turn/completed', params: { threadId: 'thread-test', turn: { id: 'turn-test', status: 'completed' } } })
  const sendNow = (input: string) => service.send(conversation.id, input, undefined, undefined, undefined, false, true, false,
    { requestId: '10000000-0000-4000-8000-000000000099', delivery: 'now', returnAfterAcceptance: true })
  return { service, runtime, steer, conversation, complete, sendNow }
}

it('acrescenta a instrução à execução existente, sem iniciar outra tarefa ou resposta', async () => {
  const { service, runtime, steer, conversation, complete, sendNow } = setup(true)
  const first = service.send(conversation.id, 'Implemente a tela')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-test'))
  expect(service.snapshot().steeringRuntimes).toContain('codex')
  await sendNow('Use o tema do projeto')
  expect(steer).toHaveBeenCalledWith('thread-test', 'turn-test', 'Use o tema do projeto')
  expect(runtime.send).toHaveBeenCalledTimes(1)
  expect(service.store.runs()).toHaveLength(1)
  expect(service.store.history(conversation.id).filter(message => message.role === 'assistant')).toHaveLength(1)
  expect(service.store.history(conversation.id).find(message => message.text === 'Use o tema do projeto')?.status).toBe('completed')
  const correction = service.store.history(conversation.id).find(message => message.text === 'Use o tema do projeto')!
  const bindingKey = (service.store.db.prepare('SELECT key FROM v9_sessions LIMIT 1').get() as { key: string }).key
  expect(service.store.sessionBinding(bindingKey)?.deliveredDigests[correction.id]).toBe(messageDigest(correction))
  complete(); await first
})

it('recusa envio durante execução quando o provedor não implementa o recurso', async () => {
  const { service, runtime, conversation, complete, sendNow } = setup(false)
  const first = service.send(conversation.id, 'Implemente a tela')
  await vi.waitFor(() => expect(service.store.runs()[0]?.turnId).toBe('turn-test'))
  expect(service.snapshot().steeringRuntimes).not.toContain('codex')
  await expect(sendNow('Outra instrução')).rejects.toThrow(/não aceita novas instruções/)
  expect(runtime.send).toHaveBeenCalledTimes(1)
  expect(service.store.history(conversation.id).some(message => message.text === 'Outra instrução')).toBe(false)
  complete(); await first
})

it('usa o ID do turno esperado no protocolo Codex', async () => {
  const runtime = new CodexRuntime()
  const request = vi.spyOn(runtime, 'request').mockResolvedValue({ turnId: 'turn-current' })
  await runtime.steer('thread-current', 'turn-current', 'Inclua acessibilidade')
  expect(request).toHaveBeenCalledWith('turn/steer', { threadId: 'thread-current', expectedTurnId: 'turn-current', input: [{ type: 'text', text: 'Inclua acessibilidade' }] })
})

it('envia anexos somente como localImage do protocolo Codex, sem inserir paths no texto', async () => {
  const runtime = new CodexRuntime()
  const request = vi.spyOn(runtime, 'request').mockResolvedValue({ turn: { id: 'turn-image', status: 'inProgress' } })
  await runtime.send('thread-current', { text: 'Descreva esta imagem.', images: [{ path: 'C:/private/host/capture.png', mimeType: 'image/png' }] })
  expect(request).toHaveBeenCalledWith('turn/start', {
    threadId: 'thread-current',
    input: [{ type: 'text', text: 'Descreva esta imagem.' }, { type: 'localImage', path: 'C:/private/host/capture.png' }],
  }, 600000)
})
