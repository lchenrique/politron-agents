import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'

export function MessageItem({ message, agent, relatedConversation, onOpenRelatedConversation, onNotice }: {
  message: Message
  agent?: Agent
  relatedConversation: Conversation | undefined
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
}) {
  const human = message.role === 'user'
  return <article className={`flex gap-3 ${human ? 'justify-end' : 'justify-start'}`}>
    {!human && <Avatar agent={agent} size="md" state={message.status === 'waiting' ? 'waiting' : ['running', 'queued'].includes(message.status) ? 'working' : 'idle'} />}
    <div className={`min-w-0 max-w-[85%] ${human ? 'rounded-2xl bg-accent px-4 py-3' : 'pt-0.5'}`}>
      <div className={`mb-1.5 flex items-center gap-2 text-xs font-medium ${human ? 'justify-end text-muted-foreground' : 'text-foreground'}`}>
        {human ? 'Você' : agent?.name || message.author}
        {message.status === 'running' && <span className="font-normal text-muted-foreground">está trabalhando</span>}
        {message.status === 'waiting' && <span className="font-normal text-amber-600">aguarda sua aprovação</span>}
        {message.status === 'queued' && <span className="font-normal text-muted-foreground">na fila</span>}
        {message.status === 'failed' && <span className="font-normal text-destructive">falhou</span>}
        {message.status === 'interrupted' && <span className="font-normal text-muted-foreground">cancelada</span>}
      </div>
      {human
        ? <div className="whitespace-pre-wrap text-sm leading-6">{message.text}</div>
        : message.role === 'activity'
          ? <>
              <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.text}</div>
              {relatedConversation && <button onClick={() => onOpenRelatedConversation(relatedConversation.id)} className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline">Abrir conversa relacionada: {relatedConversation.name}</button>}
              {message.delegationId && ['queued', 'running', 'waiting'].includes(message.status) && <button onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(error => onNotice(errorText(error)))} className="ml-3 mt-2 text-xs font-medium text-destructive underline-offset-4 hover:underline">Cancelar pedido</button>}
            </>
          : <div className="prose prose-sm dark:prose-invert max-w-none break-words text-[14px] leading-6 prose-p:my-2 prose-pre:overflow-auto prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-3 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text || (message.status === 'running' ? ' ' : '')}</ReactMarkdown>
              {message.status === 'running' && !message.text && <span className="inline-block h-4 w-1 animate-pulse rounded bg-primary/70" />}
            </div>}
    </div>
    {human && <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">EU</span>}
  </article>
}
