import type { Agent, Conversation, Message } from '../../../../shared/v9'
import type { Approval, FileChange } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { MessageItem } from './MessageItem'
import { DiffCard } from '../diff/DiffCard'
import { PitsMark } from '../app/PitsMark'

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
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-8">
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {messages.map(message => {
        const agent = agentOf(message.agentId)
        const relatedConversation = message.relatedConversationId ? conversations.find(item => item.id === message.relatedConversationId) : undefined
        const changes = fileChanges.filter(change => change.runId === message.runId)
        const runApprovals = approvals.filter(approval => approval.runId === message.runId)
        return <div key={message.id} className="space-y-2">
          <MessageItem message={message} agent={agent} relatedConversation={relatedConversation} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} />
          {runApprovals.map(approval => <section key={approval.id} aria-label="Aprovação de ferramenta" className="ml-10 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">{approval.kind === 'write' ? 'Alteração de arquivo' : 'Ação no navegador'}</h3><span className="text-[10px] text-muted-foreground">{approval.status === 'pending' ? 'Aguardando sua decisão' : approval.status === 'approved' ? 'Aprovada' : approval.status === 'denied' ? 'Negada' : 'Interrompida'}</span></div>{approval.details.path && <p className="mt-1 truncate font-mono text-xs">{approval.details.path}</p>}{approval.details.action && <p className="mt-1 break-words text-xs text-muted-foreground">{approval.details.action}</p>}{approval.details.path && approval.details.after !== undefined && <DiffCard block={{ filePath: approval.details.path, originalContent: approval.details.before || '', modifiedContent: approval.details.after || '' }} />}{approval.details.truncated && <p className="mt-1 text-[10px] text-muted-foreground">A prévia foi limitada a 200 KB.</p>}{approval.status === 'pending' && <div className="mt-3 flex justify-end gap-2"><button className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent" onClick={() => void window.appAPI.respondApproval(approval.id, false).catch(error => onNotice(String(error)))}>Negar</button><button className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90" onClick={() => void window.appAPI.respondApproval(approval.id, true).catch(error => onNotice(String(error)))}>Aprovar</button></div>}</section>)}
          {!!changes.length && <section aria-label="Arquivos alterados neste turno" className="space-y-1.5 border-l-2 border-primary/30 pl-3"><p className="text-[11px] font-medium text-muted-foreground">Arquivos alterados · {changes.length}</p>{changes.map(change => <div key={change.id} className="rounded-lg border border-border/60 bg-card/40"><div className="flex items-center justify-between gap-3 px-3 pt-2 text-[11px]"><span className="truncate font-mono">{change.path}</span><span className={change.status === 'applied' ? 'text-emerald-600' : change.status === 'unchanged' ? 'text-muted-foreground' : 'text-amber-600'}>{change.status === 'applied' ? `+${change.additions} −${change.deletions}` : change.status === 'unchanged' ? 'Sem alterações' : change.status === 'failed' ? 'Falhou' : 'Resultado incerto'}{change.binary ? ' · binário' : ''}{change.truncated ? ' · diff parcial' : ''}</span></div>{!change.binary && <DiffCard block={{ filePath: change.path, originalContent: change.before, modifiedContent: change.after }} />}</div>)}</section>}
        </div>
      })}
      {!messages.length && <div className="mx-auto mt-[9vh] max-w-xl text-center">
        <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-3xl bg-primary/10 p-3 text-primary"><PitsMark className="size-full" /></div>
        <h1 className="text-xl font-semibold tracking-tight">O que vamos fazer hoje?</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Escreva sua tarefa. Sem menção, todos os participantes recebem; use @menção para direcionar a mensagem.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{selectedAgents.map(agent => <span key={agent.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"><Avatar agent={agent} /> @{agent.alias}</span>)}</div>
      </div>}
    </div>
  </div>
}
