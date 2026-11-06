import { describe, expect, it } from 'vitest'
import type { Agent, Conversation, Run, Snapshot } from '../../../../shared/v9'
import { assistantPlaceholder, emptySnapshot } from '../app/appShellShared'
import { deriveDelegations, isDelegationActive } from './delegation-model'

const agent = (id: string, name: string, role?: 'chief'): Agent => ({ ...assistantPlaceholder, id, name, alias: name.toLowerCase(), role, color: '#786bea' })
const conversation = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id, kind: 'direct', name: id, agentIds: [], workspaceId: 'free', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-30T10:00:00Z', ...over,
})
const snapshot = (runs: Run[]): Snapshot => ({
  ...emptySnapshot,
  agents: [agent('chief', 'Atlas', 'chief'), agent('luna', 'Luna')],
  conversations: [
    conversation('chief-chat', { agentIds: ['chief'] }),
    conversation('old-task', { agentIds: ['luna'], name: 'Luna · Tarefa antiga', parentConversationId: 'chief-chat' }),
  ],
  runs,
})

describe('delegações do Chief', () => {
  it('não deixa delegação sem run visível presa em andamento', () => {
    const [delegation] = deriveDelegations(snapshot([]))
    expect(delegation).toMatchObject({ conversationId: 'old-task', title: 'Tarefa antiga', state: 'done' })
    expect(isDelegationActive(delegation)).toBe(false)
  })

  it('mantém a delegação ativa enquanto o Boo executa', () => {
    const running = { id: 'r1', agentId: 'luna', conversationId: 'old-task', status: 'running', createdAt: '2026-10-30T11:00:00Z' } as Run
    const [delegation] = deriveDelegations(snapshot([running]))
    expect(delegation).toMatchObject({ title: 'Tarefa antiga', agentName: 'Luna', state: 'working' })
    expect(isDelegationActive(delegation)).toBe(true)
  })
})
