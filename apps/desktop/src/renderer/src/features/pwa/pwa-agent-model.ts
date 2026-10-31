import { ASSISTANT_ID, type Agent, type Conversation, type Run, type Snapshot } from '../../../../shared/v9'

export type PwaTab = 'chief' | 'boos' | 'projects'
export type PwaPresence = 'idle' | 'working' | 'waiting'
export type PwaDelegationState = 'working' | 'waiting' | 'done' | 'failed'

export const ACTIVE_RUN_STATUSES: readonly Run['status'][] = ['queued', 'running', 'waiting']

export const chiefOf = (snapshot: Snapshot): Agent | undefined =>
  snapshot.agents.find(agent => agent.role === 'chief' && agent.temporaryStatus !== 'retired')

const byNewest = (a: Conversation, b: Conversation) => b.createdAt.localeCompare(a.createdAt)

/** Conversa privada mais recente com o agente, na mesma regra usada pelo AppShell ao abrir um agente. */
export function directConversationWith(snapshot: Snapshot, agentId: string): Conversation | undefined {
  const freeIds = new Set(snapshot.workspaces.filter(workspace => workspace.kind === 'free').map(workspace => workspace.id))
  return snapshot.conversations
    .filter(item => !item.archived && !item.parentConversationId && item.kind === 'direct' && item.agentIds.length === 1 && item.agentIds[0] === agentId && freeIds.has(item.workspaceId))
    .sort(byNewest)[0]
}

export const chiefConversation = (snapshot: Snapshot): Conversation | undefined => {
  const chief = chiefOf(snapshot)
  return chief ? directConversationWith(snapshot, chief.id) : undefined
}

/** Qual aba da navegação inferior representa a conversa aberta. */
export function tabForConversation(snapshot: Snapshot, conversation: Conversation | undefined): PwaTab {
  if (!conversation) return 'projects'
  const chief = chiefOf(snapshot)
  const free = snapshot.workspaces.find(workspace => workspace.id === conversation.workspaceId)?.kind === 'free'
  if (chief && free && conversation.kind === 'direct' && conversation.agentIds.length === 1 && conversation.agentIds[0] === chief.id) return 'chief'
  if (free && conversation.kind === 'direct' && conversation.agentIds.length === 1 && !conversation.parentConversationId) return 'boos'
  return 'projects'
}

export interface PwaBoo { agent: Agent; state: PwaPresence; detail: string }

/** Boos da equipe (Chief primeiro) com o que cada um faz agora, a partir das execuções ativas do snapshot. */
export function booOverview(snapshot: Snapshot, agentStates: Record<string, PwaPresence>): PwaBoo[] {
  const chief = chiefOf(snapshot)
  const team = snapshot.agents.filter(agent => agent.id !== chief?.id && agent.role !== 'chief' && agent.temporaryStatus !== 'retired')
  const conversationName = (id: string) => snapshot.conversations.find(item => item.id === id)?.name
  return [...(chief ? [chief] : []), ...team].map(agent => {
    const state = agentStates[agent.id] || 'idle'
    const active = snapshot.runs.filter(run => run.agentId === agent.id && ACTIVE_RUN_STATUSES.includes(run.status)).at(-1)
    const detail = state === 'idle' ? 'Disponível'
      : state === 'waiting' ? 'Aguardando você'
      : `Trabalhando em ${(active && conversationName(active.conversationId)) || 'uma tarefa'}`
    return { agent, state, detail }
  })
}

export interface PwaDelegation {
  id: string
  conversationId: string
  title: string
  agent?: Agent
  agentName: string
  state: PwaDelegationState
  at: string
}

const stateOfRun = (status: Run['status'] | undefined): PwaDelegationState =>
  status === 'waiting' ? 'waiting' : status === 'completed' ? 'done' : status === 'failed' || status === 'interrupted' || status === 'cancelled' ? 'failed' : 'working'

/**
 * Delegações do Chief: conversas privadas filhas das conversas dele (parentConversationId, derivado de v9_delegations),
 * com o estado da execução mais recente. Mais recentes primeiro.
 */
export function deriveDelegations(snapshot: Snapshot): PwaDelegation[] {
  const chief = chiefOf(snapshot)
  if (!chief) return []
  const chiefConversationIds = new Set(snapshot.conversations.filter(item => item.agentIds.includes(chief.id)).map(item => item.id))
  return snapshot.conversations
    .filter(item => item.parentConversationId && chiefConversationIds.has(item.parentConversationId))
    .map(item => {
      const latest = snapshot.runs.filter(run => run.conversationId === item.id).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).at(-1)
      const agentId = latest?.agentId || item.agentIds[0]
      const agent = agentId === ASSISTANT_ID ? snapshot.assistant : snapshot.agents.find(candidate => candidate.id === agentId)
      return {
        id: item.id, conversationId: item.id, title: item.name, agent, agentName: agent?.name || 'Boo',
        state: latest ? stateOfRun(latest.status) : 'done', at: latest?.createdAt || item.updatedAt || item.createdAt,
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

export const isDelegationActive = (delegation: PwaDelegation) => delegation.state === 'working' || delegation.state === 'waiting'

/** Mensagem de aviso quando uma delegação muda de estado; undefined quando nada mudou de forma relevante. */
export function delegationNotice(previous: PwaDelegationState | undefined, next: PwaDelegation): string | undefined {
  if (!previous || previous === next.state) return undefined
  if (next.state === 'done') return `${next.agentName} terminou: ${next.title}`
  if (next.state === 'failed') return `${next.agentName} não concluiu: ${next.title}`
  if (next.state === 'waiting' && previous === 'working') return `${next.agentName} precisa de você: ${next.title}`
  return undefined
}
