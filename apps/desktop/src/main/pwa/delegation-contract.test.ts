// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { PwaGateway } from './gateway'
import { AttachmentStore } from './attachment-store'
import { WorkspaceStore } from '../v9/store'
import { normalizeSnapshot } from '../../renderer/src/pwa/remote-api'
import { deriveDelegations } from '../../renderer/src/features/pwa/pwa-agent-model'
import type { Delegation, Run } from '../../shared/v9'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

/** Ponta a ponta: store real (v9_delegations) -> gateway real (/api/rpc v9:snapshot) -> normalizeSnapshot do PWA -> painel de delegações. */
describe('contrato do painel de delegações do PWA', () => {
  it('leva o vínculo parentConversationId do store até deriveDelegations, com o estado da execução', async () => {
    const dataDir = mkdtempSync(resolve(tmpdir(), 'boobot-delegation-contract-'))
    const store = new WorkspaceStore(dataDir)
    cleanup.push(async () => { store.db.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 }) })
    const chief = store.saveAgent({ name: 'Atlas', role: 'chief', instructions: 'Coordene.' })
    const luna = store.saveAgent({ name: 'Luna', instructions: 'Revise.' })
    const rex = store.saveAgent({ name: 'Rex', instructions: 'Teste.' })
    const chat = store.saveConversation({ name: 'Chief', agentIds: [chief.id] })
    const lunaTask = store.saveConversation({ name: 'Luna · revisar login', workspaceId: chat.workspaceId, agentIds: [luna.id] })
    const rexTask = store.saveConversation({ name: 'Rex · escrever testes', workspaceId: chat.workspaceId, agentIds: [rex.id] })
    const other = store.saveConversation({ name: 'Conversa avulsa da Luna', agentIds: [luna.id] })
    const now = new Date().toISOString()
    const delegation = (id: string, target: string, recipient: string): Delegation => ({
      id, idempotencyKey: id, rootRunId: 'r', parentRunId: 'r', childRunId: `run-${id}`, requesterAgentId: chief.id, recipientAgentId: recipient,
      sourceConversationId: chat.id, targetConversationId: target, sourceMessageId: 'm1', requestMessageId: 'm2', resultMessageId: 'm3',
      task: id, status: 'running', result: '', error: '', createdAt: now, updatedAt: now,
    })
    store.putDelegation(delegation('d1', lunaTask.id, luna.id))
    store.putDelegation(delegation('d2', rexTask.id, rex.id))
    const run = (id: string, conversationId: string, agentId: string, status: Run['status'], createdAt: string): Run => ({
      id, conversationId, agentId, rootId: id, parentId: null, ancestry: [agentId], status, threadId: null, turnId: null, messageId: '', input: 'segredo',
      agent: store.agent(agentId), workspaceId: chat.workspaceId, workspacePath: '', createdAt,
    })
    store.putRun(run('run-lunaTask', lunaTask.id, luna.id, 'running', '2026-10-30T10:00:00.000Z'))
    store.putRun(run('run-rexTask', rexTask.id, rex.id, 'completed', '2026-10-30T10:05:00.000Z'))

    const assets = await mkdtemp(resolve(tmpdir(), 'boobot-delegation-contract-gw-'))
    const host = { id: 'local', name: 'PC' }
    const gateway = new PwaGateway({
      assets, host: () => host, now: () => 12_000,
      attachments: new AttachmentStore(resolve(assets, 'attachments'), () => 12_000),
      dispatch: async method => (method === 'v9:snapshot' ? store.snapshot() : null),
    })
    cleanup.push(async () => { await gateway.close(); await rm(assets, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 }) })
    const base = `http://127.0.0.1:${await gateway.listen(0)}`
    const headers = { 'Content-Type': 'application/json', Origin: base, 'X-Boobot-PWA': '1' }
    const paired = await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: gateway.issueCode().code }) })
    const cookie = paired.headers.get('set-cookie')!.split(';')[0]
    const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ method: 'v9:snapshot', args: [] }) })
    expect(response.status).toBe(200)
    const wire = (await response.json() as { result: { conversations: { id: string; parentConversationId?: string }[]; runs: { input: string }[] } }).result

    // Na fiação: filhas carregam o vínculo; o pai e a conversa avulsa não; o input antigo não vaza.
    expect(wire.conversations.find(item => item.id === lunaTask.id)?.parentConversationId).toBe(chat.id)
    expect(wire.conversations.find(item => item.id === rexTask.id)?.parentConversationId).toBe(chat.id)
    expect(wire.conversations.find(item => item.id === chat.id)?.parentConversationId).toBeUndefined()
    expect(wire.conversations.find(item => item.id === other.id)?.parentConversationId).toBeUndefined()
    expect(JSON.stringify(wire.runs)).not.toContain('segredo')

    // No PWA: o painel mostra só as delegações do Chief, com o estado da execução mais recente.
    const delegations = deriveDelegations(normalizeSnapshot(wire))
    expect(delegations.map(item => [item.conversationId, item.agentName, item.state])).toEqual([
      [rexTask.id, 'Rex', 'done'],
      [lunaTask.id, 'Luna', 'working'],
    ])
  })
})

describe('contrato da prévia de conversa: gateway → normalizeSnapshot', () => {
  it('a prévia da última mensagem sobrevive à normalização do PWA, sem campos extras', () => {
    const snapshot = normalizeSnapshot({ agents: [], workspaces: [], conversations: [{ id: 'c1', name: 'Chief', kind: 'direct', agentIds: [], archived: false, lastMessage: { text: 'Pronto ✓', author: 'Chief', role: 'assistant', createdAt: '2026-10-31T10:00:00Z', extra: 'x' } }], messages: [], runs: [], approvals: [] })
    expect(snapshot.conversations[0]!.lastMessage).toEqual({ text: 'Pronto ✓', author: 'Chief', role: 'assistant', createdAt: '2026-10-31T10:00:00Z' })
  })
})
