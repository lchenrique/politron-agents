import type { Agent, Message, Run, Snapshot } from '../../../../shared/v9'

export type DeskState = 'working' | 'thinking' | 'waiting' | 'queued' | 'idle'
export interface Desk {
  agent: Agent
  state: DeskState
  /** Passo atual em uma linha ("Edição · src/app.ts") ou o estado em palavras. */
  detail: string
  /** Conversa da execução ativa, para abrir direto onde o agente está trabalhando. */
  conversationId?: string
  /** A execução ativa foi pedida por um Chief (delegação). */
  fromChief: boolean
}

const ACTIVE: Run['status'][] = ['queued', 'running', 'waiting']
const RANK: Record<DeskState, number> = { waiting: 0, working: 1, thinking: 2, queued: 3, idle: 4 }

/** Estado de cada agente somando todas as conversas: o mais urgente vence (aprovação > trabalho > pensando > fila). */
export function officeDesks(snapshot: Pick<Snapshot, 'agents' | 'runs' | 'messages'>): Desk[] {
  const runsById = new Map(snapshot.runs.map(run => [run.id, run]))
  const agentsById = new Map(snapshot.agents.map(agent => [agent.id, agent]))
  const runningTools = new Map<string, Message>()
  for (const message of snapshot.messages) {
    if (message.role !== 'activity' || !message.runId) continue
    const running = message.tool ? message.tool.status === 'running' && !message.tool.finishedAt : message.status === 'running'
    const previous = runningTools.get(message.runId)
    if (running && (!previous || previous.createdAt < message.createdAt)) runningTools.set(message.runId, message)
  }
  return snapshot.agents.filter(agent => !agent.temporary || agent.temporaryStatus === 'working').map(agent => {
    const desks = snapshot.runs.filter(run => run.agentId === agent.id && ACTIVE.includes(run.status)).map((run): Omit<Desk, 'agent'> => {
      const parent = run.parentId ? runsById.get(run.parentId) : undefined
      const fromChief = !!parent && agentsById.get(parent.agentId)?.role === 'chief'
      if (run.status === 'waiting') return { state: 'waiting', detail: 'Aguardando sua aprovação', conversationId: run.conversationId, fromChief }
      if (run.status === 'queued') return { state: 'queued', detail: 'Na fila', conversationId: run.conversationId, fromChief }
      const tool = runningTools.get(run.id)
      return tool
        ? { state: 'working', detail: tool.text.split('\n')[0]!.slice(0, 140), conversationId: run.conversationId, fromChief }
        : { state: 'thinking', detail: 'Pensando…', conversationId: run.conversationId, fromChief }
    }).sort((a, b) => RANK[a.state] - RANK[b.state])
    return { agent, ...(desks[0] || { state: 'idle' as const, detail: 'Livre', fromChief: false }) }
  })
}

/** Chief primeiro (mesa de destaque), depois quem está ativo, depois os demais por nome. */
export function deskOrder(desks: Desk[]): Desk[] {
  return [...desks].sort((a, b) => Number(b.agent.role === 'chief') - Number(a.agent.role === 'chief') || RANK[a.state] - RANK[b.state] || a.agent.name.localeCompare(b.agent.name, 'pt-BR'))
}
