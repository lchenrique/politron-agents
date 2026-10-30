import { useState } from 'react'
import { ArrowUpRight, Ban, Check, ChevronRight, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import { delegationTitle } from '../../../../shared/delegation-title'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import { MessageMarkdown } from './MessageMarkdown'

const ACTIVE = ['queued', 'running', 'waiting']
const COMPLETED_PREFIX = /^Pedido concluído por [^\n]*\n\n/

/** Lê a mensagem de origem: textos novos trazem delegationTask; os antigos só têm o texto de status (ou o nome da conversa). */
function delegationDetails(message: Message, relatedName?: string) {
  const completed = COMPLETED_PREFIX.exec(message.text)
  const running = /^Pedido para [^:\n]+: ([\s\S]*)\n[^\n]*$/.exec(message.text)
  const legacyName = relatedName?.replace(/^Pedido: /, '').split(' · ').slice(1).join(' · ')
  const task = message.delegationTask ?? running?.[1] ?? legacyName ?? ''
  const result = completed ? message.text.slice(completed[0].length) : ''
  const error = message.status === 'failed' ? /\nFalhou: ([\s\S]*)$/.exec(message.text)?.[1] || 'O pedido falhou.' : ''
  return { task, result, error }
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (ACTIVE.includes(status)) return <LoaderCircle role="img" aria-label="Trabalhando" className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
  if (status === 'completed') return <Check role="img" aria-label="Concluído" className="size-3.5 shrink-0 text-success" />
  if (status === 'failed') return <CircleAlert role="img" aria-label="Erro" className="size-3.5 shrink-0 text-destructive" />
  return <Ban role="img" aria-label="Cancelado" className="size-3.5 shrink-0 text-muted-foreground" />
}

function DelegationRow({ message, agent, related, onOpenRelatedConversation, onNotice }: {
  message: Message; agent?: Agent; related?: Conversation; onOpenRelatedConversation: (id: string) => void; onNotice: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const name = agent?.name || message.author
  const { task, result, error } = delegationDetails(message, related?.name)
  const summary = task ? delegationTitle(task) : 'Pedido'
  return <Collapsible open={open} onOpenChange={setOpen} asChild><li>
    <div className="flex items-center gap-1 px-1.5 py-1">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size={null} aria-label={`${open ? 'Recolher' : 'Ver'} pedido para ${name}`} className="flex h-auto min-w-0 flex-1 justify-start gap-2 rounded-md px-1.5 py-1 text-left text-xs font-normal text-muted-foreground">
          <ChevronRight aria-hidden="true" className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          {agent && <Avatar agent={agent} size="xs" />}
          <span className="shrink-0 font-medium text-foreground/85">{name}</span>
          <StatusIcon status={message.status} />
          <span className="min-w-0 flex-1 truncate" title={task || undefined}>{summary}</span>
        </Button>
      </CollapsibleTrigger>
      {related && <Button variant="ghost" size="icon" className="size-6 rounded-full shrink-0 text-muted-foreground" aria-label="Abrir conversa" title="Abrir conversa" onClick={() => onOpenRelatedConversation(related.id)}><ArrowUpRight className="size-3.5" /></Button>}
      {ACTIVE.includes(message.status) && <Button variant="ghost" size="icon" className="size-6 rounded-full shrink-0 text-muted-foreground hover:text-destructive" aria-label="Cancelar pedido" title="Cancelar pedido" onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(cause => onNotice(errorText(cause)))}><X className="size-3.5" /></Button>}
    </div>
    <CollapsibleContent className="space-y-2 px-9 pb-2 text-xs">
      {task && <section aria-label="Pedido completo"><p className="mb-0.5 font-medium text-muted-foreground">Pedido</p><p className="whitespace-pre-wrap break-words text-foreground/85">{task}</p></section>}
      {result && <section aria-label="Resultado"><p className="mb-0.5 font-medium text-muted-foreground">Resultado</p><div className="max-h-72 overflow-y-auto"><MessageMarkdown>{result}</MessageMarkdown></div></section>}
      {error && <p className="whitespace-pre-wrap break-words text-destructive">{error}</p>}
      {message.status === 'interrupted' && <p className="text-muted-foreground">Pedido cancelado.</p>}
    </CollapsibleContent>
  </li></Collapsible>
}

/** Uma rodada de delegação: um cartão compacto com uma linha por Boo, no estilo das linhas de atividade. */
export function DelegationCard({ delegations, agentOf, conversationsById, onOpenRelatedConversation, onNotice }: {
  delegations: Message[]
  agentOf: (id: string | null) => Agent | undefined
  conversationsById: Map<string, Conversation>
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
}) {
  const title = `Delegou para ${delegations.length} ${delegations.length === 1 ? 'Boo' : 'Boos'}`
  return <section aria-label={title} className="my-1.5 max-w-3xl rounded-lg border border-border/70 bg-muted/20">
    <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{title}</p>
    <ul className="divide-y divide-border/50 pb-0.5">
      {delegations.map(message => <DelegationRow key={message.id} message={message} agent={agentOf(message.agentId)} related={message.relatedConversationId ? conversationsById.get(message.relatedConversationId) : undefined} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} />)}
    </ul>
  </section>
}
