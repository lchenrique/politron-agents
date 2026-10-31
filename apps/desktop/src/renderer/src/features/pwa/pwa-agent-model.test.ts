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

describe('títulos das tarefas delegadas', () => {
  it('tiram o nome do Boo repetido no começo e mantêm o resto', async () => {
    const { taskTitle } = await import('./pwa-agent-model')
    expect(taskTitle('Freya · Redesenhar o board', 'Freya')).toBe('Redesenhar o board')
    expect(taskTitle('Board · Corrigir selects', 'Freya')).toBe('Board · Corrigir selects')
    const running = { id: 'r1', agentId: 'luna', conversationId: 'old-task', status: 'running', createdAt: '2026-10-30T11:00:00Z' } as Run
    const base = snapshot([running])
    const [delegation] = deriveDelegations({ ...base, conversations: base.conversations.map(item => item.id === 'old-task' ? { ...item, name: 'Luna · Revisar login' } : item) })
    expect(delegation).toMatchObject({ title: 'Revisar login', agentName: 'Luna', state: 'working' })
  })
})
