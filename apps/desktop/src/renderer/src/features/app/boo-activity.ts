import type { Message, Run } from '../../../../shared/v9'
import { activityCategory } from '../../../../shared/activity'
import type { AgentAvatarState } from './Avatar'
import type { PoliExpression } from './PoliAvatar'

export interface BooActivity {
  state: AgentAvatarState
  expression?: PoliExpression
  detail?: string
  runId?: string
}

/** Presença do agente nesta conversa. Histórico e atividades de outro turno não acionam gestos. */
export function booActivity(agentId: string, conversationId: string | undefined, runs: Run[], messages: Message[]): BooActivity {
  if (!conversationId) return { state: 'idle' }
  const scoped = runs.filter(run => run.agentId === agentId && run.conversationId === conversationId)
  const active = scoped.filter(run => ['queued', 'running', 'waiting'].includes(run.status))
  const waiting = active.find(run => run.status === 'waiting')
  if (waiting) return { state: 'waiting', expression: 'thinking', detail: 'Aguardando aprovação', runId: waiting.id }
  if (!active.length) {
    const latest = [...scoped].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).at(0)
    if (latest?.status === 'failed') return { state: 'idle', expression: 'thinking', detail: 'A tarefa falhou. Confira os detalhes no chat.' }
    if (latest?.status === 'interrupted' || latest?.status === 'cancelled') return { state: 'idle', expression: 'idle', detail: 'Tarefa interrompida' }
    return { state: 'idle' }
  }
  const running = new Set(active.filter(run => run.status === 'running').map(run => run.id))
  const tool = messages.filter(message => message.role === 'activity' && message.agentId === agentId && message.conversationId === conversationId
    && message.runId && running.has(message.runId) && (message.tool ? message.tool.status === 'running' && !message.tool.finishedAt : message.status === 'running'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
  return {
    state: 'working',
    expression: tool && activityCategory(tool.text) === 'edit' ? 'coding' : 'thinking',
    detail: tool ? tool.text.split('\n')[0].slice(0, 180) : 'Processando pedido…',
    runId: tool?.runId || (active.find(run => run.status === 'running') || active[0]).id,
  }
}
