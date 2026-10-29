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
  const directory = mkdtempSync(join(tmpdir(), 'politron-tool-activity-')); directories.push(directory)
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

describe('registro estruturado das ferramentas', () => {
  it('grava nome, argumentos, estado, horários e saída na atividade, mantendo o texto antigo', async () => {
    const { history } = await play([tool('t1', 'workspace_list', { path: '.' }), { method: 'item/agentMessage/delta', params: { delta: 'Fim.' } }, done])
    const activity = history.find(message => message.role === 'activity')!
    expect(activity.text).toBe('Leitura · .')
    expect(activity.tool).toMatchObject({ name: 'workspace_list', path: '.', status: 'completed', args: JSON.stringify({ path: '.' }, null, 2) })
    expect(Date.parse(activity.tool!.finishedAt!)).toBeGreaterThanOrEqual(Date.parse(activity.tool!.startedAt))
    expect(typeof activity.tool!.output).toBe('string')
  })

  it('marca falha com a mensagem de erro e redige URLs e segredos nos argumentos', async () => {
    const secret = `sk-${'a'.repeat(24)}`
    const { history } = await play([tool('t1', 'workspace_read', { path: 'nao-existe.txt', nota: `https://example.com/x?token=abc ${secret}` }), done])
    const activity = history.find(message => message.role === 'activity')!
    expect(activity.tool!.status).toBe('failed')
    expect(activity.tool!.output).toBeTruthy()
    expect(activity.tool!.args).toContain('https://example.com/x')
    expect(activity.tool!.args).not.toContain('token=abc')
    expect(activity.tool!.args).not.toContain(secret)
  })

  it('registra o resumo de raciocínio do motor como atividade própria', async () => {
    const { history } = await play([{ method: 'item/completed', params: { item: { type: 'reasoning', id: 'r1', summary: ['**Plano**\nListar a pasta.'] } } }, { method: 'item/agentMessage/delta', params: { delta: 'Ok.' } }, done])
    const reasoning = history.find(message => message.tool?.name === 'reasoning')!
    expect(reasoning.text).toBe('Raciocínio')
    expect(reasoning.tool!.output).toBe('**Plano**\nListar a pasta.')
    // Item de raciocínio vazio não vira linha.
    const empty = await play([{ method: 'item/completed', params: { item: { type: 'reasoning', id: 'r2', summary: [] } } }, done])
    expect(empty.history.some(message => message.tool?.name === 'reasoning')).toBe(false)
  })

  it('a última resposta do run registra quando terminou', async () => {
    const { history } = await play([{ method: 'item/agentMessage/delta', params: { delta: 'Oi.' } }, done])
    expect(history.at(-1)!.finishedAt).toBeTruthy()
  })
})
