import { describe, expect, it } from 'vitest'
import type { Agent, Conversation, Run, Snapshot } from '../../../../shared/v9'
import { assistantPlaceholder, emptySnapshot } from '../app/appShellShared'
import { deriveDelegations, isDelegationActive } from './pwa-agent-model'

const agent = (id: string, name: string, role?: 'chief'): Agent => ({ ...assistantPlaceholder, id, name, alias: name.toLowerCase(), role, color: '#786bea' })
const conversation = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id, kind: 'direct', name: id, agentIds: [], workspaceId: 'free', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-30T10:00:00Z', ...over,
})
const snapshot = (runs: Run[]): Snapshot => ({
  ...emptySnapshot,
  agents: [agent('chief', 'Atlas', 'chief'), agent('luna', 'Luna')],
  conversations: [
    conversation('chief-chat', { agentIds: ['chief'] }),
    conversation('old-task', { agentIds: ['luna'], name: 'Tarefa antiga', parentConversationId: 'chief-chat' }),
  ],
  runs,
})

describe('deriveDelegations', () => {
  it('não mostra como ativa uma delegação cuja execução já saiu da janela do snapshot', () => {
    // O gateway só leva as execuções mais recentes; sem nenhuma execução da conversa filha, ela não pode ficar "trabalhando" para sempre.
    const [delegation] = deriveDelegations(snapshot([]))
    expect(delegation.conversationId).toBe('old-task')
    expect(delegation.state).toBe('done')
    expect(isDelegationActive(delegation)).toBe(false)
  })
})
