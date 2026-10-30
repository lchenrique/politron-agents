import { ArrowUpRight, Ban, Check, CircleAlert, Clock3, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Message, Run, RunStatus } from '../../../../shared/v9'
import { delegationTitle } from '../../../../shared/delegation-title'
import { Avatar } from '../app/Avatar'
import { isDelegationOrigin } from '../chat/turns'

type DelegationStatus = RunStatus | 'unknown'
export interface DelegationOverviewEntry {
  id: string
  conversationId: string
  agent?: Agent
  agentName: string
  task: string
  status: DelegationStatus
  depth: number
}

function statusLabel(status: DelegationStatus): string {
  switch (status) {
    case 'queued': return 'Na fila'
    case 'running': return 'Trabalhando'
    case 'waiting': return 'Aguardando'
    case 'completed': return 'Concluído'
    case 'failed': return 'Falhou'
    case 'interrupted': case 'cancelled': return 'Cancelado'
    default: return 'Sem status recente'
  }
}

function StatusMark({ status }: { status: DelegationStatus }) {
  if (status === 'queued' || status === 'running') return <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
  if (status === 'waiting') return <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
  if (status === 'completed') return <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />
  if (status === 'failed') return <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
  if (status === 'interrupted' || status === 'cancelled') return <Ban aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
  return <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
}

function latestRun(runs: Run[], conversationId: string): Run | undefined {
  return runs.filter(run => run.conversationId === conversationId)
    .reduce<Run | undefined>((latest, run) => !latest || run.createdAt >= latest.createdAt ? run : latest, undefined)
}

function messageTask(message: Message, run?: Run): string {
  return message.delegationTask || run?.input || /^Pedido para [^:]+: ([\s\S]*?)(?:\r?\n|$)/.exec(message.text)?.[1] || ''
}

/** Deriva a árvore das mensagens de origem e das relações/run já presentes no snapshot. */
export function buildDelegationOverviewEntries({ conversationId, messages, conversations, runs, agents }: {
  conversationId: string
  messages: Message[]
  conversations: Conversation[]
  runs: Run[]
  agents: Agent[]
}): DelegationOverviewEntry[] {
  const conversationsById = new Map(conversations.map(conversation => [conversation.id, conversation]))
  const agentsById = new Map(agents.map(agent => [agent.id, agent]))
  const directOrigins = messages.filter(message => message.conversationId === conversationId && isDelegationOrigin(message))
  const directTargets = new Set(directOrigins.map(message => message.relatedConversationId).filter((id): id is string => !!id))
  const childrenByParent = new Map<string, Conversation[]>()
  for (const conversation of conversations) {
    if (!conversation.parentConversationId) continue
    const children = childrenByParent.get(conversation.parentConversationId) || []
    children.push(conversation)
    childrenByParent.set(conversation.parentConversationId, children)
  }
  for (const children of childrenByParent.values()) children.sort((a, b) => (a.updatedAt || a.createdAt).localeCompare(b.updatedAt || b.createdAt))

  const entries: DelegationOverviewEntry[] = []
  const seenDelegations = new Set<string>()
  const seenFallbackConversations = new Set<string>()
  const expandedConversations = new Set<string>()
  const expandFallbacks = (parentId: string, depth: number, ancestors: Set<string>, skipTargets = new Set<string>()) => {
    if (expandedConversations.has(parentId)) return
    expandedConversations.add(parentId)
    for (const conversation of childrenByParent.get(parentId) || []) {
      if (ancestors.has(conversation.id) || skipTargets.has(conversation.id) || seenFallbackConversations.has(conversation.id)) continue
      seenFallbackConversations.add(conversation.id)
      const run = latestRun(runs, conversation.id)
      const agent = (run && agentsById.get(run.agentId)) || (run?.agent) || agentsById.get(conversation.agentIds[0] || '')
      entries.push({
        id: `conversation:${conversation.id}`,
        conversationId: conversation.id,
        agent,
        agentName: agent?.name || conversation.name,
        task: run?.input || conversation.name,
        status: run?.status || 'unknown',
        depth,
      })
      expandFallbacks(conversation.id, depth + 1, new Set([...ancestors, conversation.id]))
    }
  }

  for (const message of directOrigins) {
    const targetId = message.relatedConversationId
    if (!targetId) continue
    const key = message.delegationId || `message:${message.id}`
    if (seenDelegations.has(key)) continue
    seenDelegations.add(key)
    const conversation = conversationsById.get(targetId)
    const run = latestRun(runs, targetId)
    const agent = (message.agentId && agentsById.get(message.agentId)) || (run && agentsById.get(run.agentId)) || run?.agent
    entries.push({
      id: `delegation:${key}`,
      conversationId: targetId,
      agent,
      agentName: agent?.name || message.author,
      task: messageTask(message, run),
      status: run?.status || message.status,
      depth: 0,
    })
    if (conversation && !expandedConversations.has(targetId)) {
      expandFallbacks(targetId, 1, new Set([conversationId, targetId]))
    }
  }
  expandFallbacks(conversationId, 0, new Set([conversationId]), directTargets)
  return entries
}

export function DelegationOverview({ conversationId, messages = [], conversations = [], runs = [], agents = [], onOpenConversation = () => undefined }: {
  conversationId?: string
  messages?: Message[]
  conversations?: Conversation[]
  runs?: Run[]
  agents?: Agent[]
  onOpenConversation?: (conversationId: string) => void
}) {
  const entries = conversationId ? buildDelegationOverviewEntries({ conversationId, messages, conversations, runs, agents }) : []
  return <section aria-label="Agentes delegados" className="flex h-full min-h-0 flex-col overflow-y-auto p-3 sm:p-4">
    <h2 className="mb-3 text-sm font-semibold text-foreground">Agentes desta conversa</h2>
    {!entries.length ? <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">Nenhuma delegação nesta conversa.</p>
      : <ul className="space-y-1" data-testid="delegation-overview-list">
        {entries.map(entry => <li key={entry.id} data-testid="delegation-entry" data-depth={entry.depth} data-status={entry.status} className="min-w-0 rounded-lg border border-border/70 bg-card/30 p-2.5" style={{ marginInlineStart: `${Math.min(entry.depth, 5) * 18}px` }}>
          <div className="flex min-w-0 items-center gap-2">
            {entry.agent ? <Avatar agent={entry.agent} size="xs" /> : <span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground" title={entry.agentName}>{entry.agentName}</p>
              <p className="truncate text-[11px] text-muted-foreground" title={entry.task}>{delegationTitle(entry.task || 'Pedido')}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground" aria-label={`Status: ${statusLabel(entry.status)}`}><StatusMark status={entry.status} />{statusLabel(entry.status)}</span>
            <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full shrink-0" aria-label={`Abrir conversa de ${entry.agentName}`} title="Abrir conversa" onClick={() => onOpenConversation(entry.conversationId)}><ArrowUpRight aria-hidden="true" className="size-3.5" /></Button>
          </div>
        </li>)}
      </ul>}
  </section>
}
