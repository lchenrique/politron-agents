import { Bot } from 'lucide-react'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { MessageItem } from './MessageItem'

export function MessageList({ messages, conversations, agentOf, selectedAgents, onOpenRelatedConversation, onNotice }: {
  messages: Message[]
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
        return <MessageItem
          key={message.id}
          message={message}
          agent={agent}
          relatedConversation={relatedConversation}
          onOpenRelatedConversation={onOpenRelatedConversation}
          onNotice={onNotice}
        />
      })}
      {!messages.length && <div className="mx-auto mt-[9vh] max-w-xl text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="size-6" /></div>
        <h1 className="text-xl font-semibold tracking-tight">O que vamos fazer hoje?</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Escreva sua tarefa. Sem menção, todos os participantes recebem; use @menção para direcionar a mensagem.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{selectedAgents.map(agent => <span key={agent.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"><Avatar agent={agent} /> @{agent.alias}</span>)}</div>
      </div>}
    </div>
  </div>
}
