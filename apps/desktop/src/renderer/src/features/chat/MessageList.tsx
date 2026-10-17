import { useLayoutEffect, useRef } from 'react'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import type { Approval, FileChange } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { MessageItem } from './MessageItem'
import { DiffCard } from '../diff/DiffCard'
import { PolitronToolApproval } from './PolitronToolApproval'
import { PoliAvatar } from '../app/PoliAvatar'
import { assistantPlaceholder } from '../app/appShellShared'

/** Distância do fim ainda considerada "no final", para decidir se um novo evento deve puxar o scroll junto. */
const STICK_TO_BOTTOM_PX = 96

export function MessageList({ messages, fileChanges, approvals, conversations, agentOf, selectedAgents, onOpenRelatedConversation, onNotice }: {
  messages: Message[]
  fileChanges: FileChange[]
  approvals: Approval[]
  conversations: Conversation[]
  agentOf: (id: string | null) => Agent | undefined
  selectedAgents: Agent[]
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Só gruda no final se o usuário já estava lá; rolar pra ler o histórico não é interrompido por uma resposta chegando.
  const stickToBottom = useRef(true)
  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX
  }
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || !stickToBottom.current) return
    element.scrollTop = element.scrollHeight
  }, [messages, fileChanges, approvals])
  return <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-8">
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {messages.map(message => {
        const agent = agentOf(message.agentId)
        const relatedConversation = message.relatedConversationId ? conversations.find(item => item.id === message.relatedConversationId) : undefined
        const changes = fileChanges.filter(change => change.runId === message.runId)
        const runApprovals = approvals.filter(approval => approval.runId === message.runId)
        return <div key={message.id} className="space-y-2">
          <MessageItem message={message} agent={agent} showAgentAvatar={selectedAgents.length > 1} relatedConversation={relatedConversation} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} />
          {runApprovals.map(approval => <PolitronToolApproval key={approval.id} approval={approval} onNotice={onNotice} />)}
          {!!changes.length && <section aria-label="Arquivos alterados neste turno" className="space-y-1.5 border-l-2 border-primary/30 pl-3"><p className="text-[11px] font-medium text-muted-foreground">Arquivos alterados · {changes.length}</p>{changes.map(change => <div key={change.id} className="rounded-lg border border-border/60 bg-card/40"><div className="flex items-center justify-between gap-3 px-3 pt-2 text-[11px]"><span className="truncate font-mono">{change.path}</span><span className={change.status === 'applied' ? 'text-emerald-600' : change.status === 'unchanged' ? 'text-muted-foreground' : 'text-amber-600'}>{change.status === 'applied' ? `+${change.additions} −${change.deletions}` : change.status === 'unchanged' ? 'Sem alterações' : change.status === 'failed' ? 'Falhou' : 'Resultado incerto'}{change.binary ? ' · binário' : ''}{change.truncated ? ' · diff parcial' : ''}</span></div>{!change.binary && <DiffCard block={{ filePath: change.path, originalContent: change.before, modifiedContent: change.after }} />}</div>)}</section>}
        </div>
      })}
      {!messages.length && <div className="mx-auto mt-[9vh] max-w-xl text-center">
        <div className="mx-auto mb-5 flex min-h-28 items-center justify-center" aria-label={selectedAgents.length > 1 ? `Equipe: ${selectedAgents.map(agent => agent.name).join(', ')}` : undefined}>
          {selectedAgents.length === 0
            ? <PoliAvatar agent={{ ...assistantPlaceholder, name: 'Pits' }} size={112} />
            : selectedAgents.length === 1
              ? selectedAgents[0].avatar
                ? <span className="inline-flex size-28 overflow-hidden rounded-full border border-border/60" style={{ backgroundColor: selectedAgents[0].color }}><img className="size-full object-cover" src={selectedAgents[0].avatar} alt={`Avatar de ${selectedAgents[0].name}`} /></span>
                : <PoliAvatar agent={selectedAgents[0]} size={112} />
              : <div className="flex items-center justify-center -space-x-3">{selectedAgents.slice(0, 3).map((agent, index) => <span key={agent.id} className="relative rounded-full ring-4 ring-background" style={{ zIndex: 3 - index }}><Avatar agent={agent} size="md" /></span>)}{selectedAgents.length > 3 && <span className="relative z-0 -ml-1 inline-flex size-14 items-center justify-center rounded-full border border-border bg-card text-xs font-medium text-muted-foreground">+{selectedAgents.length - 3}</span>}</div>}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">O que vamos fazer hoje?</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Escreva sua tarefa. Sem menção, todos os participantes recebem; use @menção para direcionar a mensagem.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{selectedAgents.map(agent => <span key={agent.id} className="inline-flex items-center rounded-xl border border-border/70 bg-card/30 px-3 py-1.5 text-xs text-muted-foreground"><span className="text-left"><strong className="block font-medium text-foreground">{agent.name}</strong><span className="block text-[11px]">@{agent.alias}</span></span></span>)}</div>
      </div>}
    </div>
  </div>
}
