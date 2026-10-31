import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from './workspace'
import { PwaGateway } from '../pwa/gateway'
import { normalizeSnapshot } from '../../renderer/src/pwa/remote-api'
import { deriveDelegations, delegationNotice } from '../../renderer/src/features/pwa/pwa-agent-model'
import type { Agent, Run } from '../../shared/v9'

/** Runtime falso: o Boo "Operário" só termina quando o teste libera. */
class HoldingRuntime extends EventEmitter {
  started = 0
  agentByThread = new Map<string, string>()
  held: (() => void)[] = []
  async thread(agent: Agent) { this.started++; const id = `thread-${this.started}`; this.agentByThread.set(id, agent.name); return { id, history: 'empty' as const } }
  async request(_method: string, params?: { threadId?: string }) {
    const threadId = params?.threadId || `thread-${this.started}`
    const turnId = `turn-${threadId.split('-').at(-1)}-${Math.random().toString(36).slice(2, 6)}`
    const agent = this.agentByThread.get(threadId) || ''
    const finish = () => {
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resposta de ${agent}.` } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
    }
    if (agent === 'Operário') this.held.push(finish); else setTimeout(finish)
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  async send(threadId: string) { return this.request('turn/start', { threadId }) }
  respond() {}
  async interrupt() {}
  async models() { return [] }
  close() {}
}

type Internals = { active: Map<string, AbortController>; callTool(context: unknown, name: string, args: Record<string, unknown>, callId: string): Promise<string> }
const dirs: string[] = []
const services: AppService[] = []
const gateways: PwaGateway[] = []
afterEach(async () => {
  await Promise.all(gateways.splice(0).map(gateway => gateway.close()))
  for (const service of services.splice(0)) { try { service.dispose() } catch { /* já liberado */ } }
  for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 })
}, 30000)

describe('contrato Chief não bloqueante → snapshot → gateway PWA → painel de delegações', () => {
  it('a delegação do Chief aparece no painel como trabalhando e vira concluída quando o Boo termina e acorda o Chief', async () => {
    const runtime = new HoldingRuntime()
    const directory = mkdtempSync(join(tmpdir(), 'politron-chief-pwa-')); dirs.push(directory)
    const service = new AppService(directory, runtime as unknown as ConstructorParameters<typeof AppService>[1]); services.push(service)
    const chief = service.saveAgent({ name: 'Chefe', alias: 'chefe', instructions: 'Coordena.', canWrite: true, role: 'chief' })
    const worker = service.saveAgent({ name: 'Operário', alias: 'operario', instructions: 'Executa.', canWrite: false })
    const conversation = service.saveConversation({ kind: 'group', name: 'Equipe', agentIds: [chief.id, worker.id], workspacePath: directory })
    const run = { id: 'run-chief', conversationId: conversation.id, agentId: chief.id, rootId: 'run-chief', parentId: null, ancestry: [chief.id], status: 'running', threadId: null, turnId: null, messageId: 'chief-message', input: 'Pedido', agent: chief, workspaceId: conversation.workspaceId, workspacePath: directory, createdAt: new Date().toISOString() } as Run
    service.store.putRun(run)
    ;(service as unknown as Internals).active.set(run.id, new AbortController())
    const context = { run, conversation, agent: chief, message: { id: run.messageId, conversationId: conversation.id, agentId: chief.id, author: chief.name, role: 'assistant', text: '', status: 'running', runId: run.id, createdAt: run.createdAt } }

    // Gateway real do PWA, servindo o snapshot real do AppService (a mesma sanitização do celular).
    const gateway = new PwaGateway({ assets: resolve('src/main/pwa/assets'), host: () => ({ id: 'local', name: 'PC' }), dispatch: async method => (method === 'v9:snapshot' ? service.snapshot() : null) })
    gateways.push(gateway)
    const base = `http://127.0.0.1:${await gateway.listen(0)}`
    const headers = (cookie?: string) => ({ 'Content-Type': 'application/json', Origin: base, 'X-Boobot-PWA': '1', ...(cookie ? { Cookie: cookie } : {}) })
    const paired = await fetch(`${base}/api/pair`, { method: 'POST', headers: headers(), body: JSON.stringify({ code: gateway.issueCode().code }) })
    const cookie = paired.headers.get('set-cookie')!.split(';')[0]
    const pwaSnapshot = async () => {
      const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers: headers(cookie), body: JSON.stringify({ method: 'v9:snapshot', args: [] }) })
      return normalizeSnapshot(((await response.json()) as { result: unknown }).result)
    }

    const receipt = await (service as unknown as Internals).callTool(context, 'ask_agent', { agent: worker.alias, task: 'Trabalho longo', mode: 'wait' }, 'call-1')
    expect(receipt).toContain('segundo plano')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.status).toBe('running'))

    // 1) Em andamento: o vínculo parentConversationId sobrevive store → gateway → remote-api e o painel mostra o Boo trabalhando.
    const working = await pwaSnapshot()
    const child = working.conversations.find(item => item.id === delegation.targetConversationId)
    expect(child?.parentConversationId).toBe(conversation.id)
    const during = deriveDelegations(working)
    expect(during).toHaveLength(1)
    expect(during[0]).toMatchObject({ conversationId: delegation.targetConversationId, agentName: 'Operário', state: 'working' })

    // 2) O Boo termina: delegação concluída, Chief acordado uma única vez, painel mostra "done" e avisa.
    await vi.waitFor(() => expect(runtime.held.length).toBeGreaterThan(0))
    runtime.held.splice(0).forEach(finish => finish())
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.continuationRunId).toBeTruthy())
    await vi.waitFor(() => expect(service.store.run(service.store.delegation(delegation.id)!.continuationRunId!)?.status).toBe('completed'))
    const done = deriveDelegations(await pwaSnapshot())
    expect(done).toHaveLength(1)
    expect(done[0].state).toBe('done')
    expect(delegationNotice(during[0].state, done[0])).toContain('Operário terminou')
    // A própria conversa do Chief e a continuação dele não viram "delegação".
    expect(done.some(item => item.conversationId === conversation.id)).toBe(false)
  })
})
