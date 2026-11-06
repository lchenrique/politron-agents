import { ASSISTANT_ID, type Agent, type Run, type Snapshot } from '../../../../shared/v9'

export type DelegationState = 'working' | 'waiting' | 'done' | 'failed'
export interface ChiefDelegation {
  id: string
  conversationId: string
  title: string
  agent?: Agent
  agentName: string
  state: DelegationState
  at: string
}

const stateOfRun = (status: Run['status'] | undefined): DelegationState =>
  status === 'waiting' ? 'waiting' : status === 'completed' ? 'done' : status === 'failed' || status === 'interrupted' || status === 'cancelled' ? 'failed' : 'working'

const taskTitle = (name: string, agentName: string): string => {
  const prefix = agentName.trim() + ' · '
  return name.startsWith(prefix) ? name.slice(prefix.length).trim() || name : name
}

/** Conversas descendentes do Chief com o estado da execução mais recente. */
export function deriveDelegations(snapshot: Snapshot): ChiefDelegation[] {
  const chief = snapshot.agents.find(agent => agent.role === 'chief' && agent.temporaryStatus !== 'retired')
  if (!chief) return []
  const chiefConversationIds = new Set(snapshot.conversations.filter(item => item.agentIds.includes(chief.id)).map(item => item.id))
  return snapshot.conversations
    .filter(item => item.parentConversationId && chiefConversationIds.has(item.parentConversationId))
    .map(item => {
      const latest = snapshot.runs.filter(run => run.conversationId === item.id).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).at(-1)
      const agentId = latest?.agentId || item.agentIds[0]
      const agent = agentId === ASSISTANT_ID ? snapshot.assistant : snapshot.agents.find(candidate => candidate.id === agentId)
      return {
        id: item.id, conversationId: item.id, title: taskTitle(item.name, agent?.name || ''), agent, agentName: agent?.name || 'Boo',
        state: latest ? stateOfRun(latest.status) : 'done', at: latest?.createdAt || item.updatedAt || item.createdAt,
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

export const isDelegationActive = (delegation: ChiefDelegation) => delegation.state === 'working' || delegation.state === 'waiting'
