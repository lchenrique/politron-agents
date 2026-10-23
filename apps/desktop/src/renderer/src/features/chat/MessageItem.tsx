import { memo, useState } from 'react'
import { Volume2, LoaderCircle, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'
import { RunProgress } from './RunProgress'
import { speakVoice, stopVoice } from '../voice/voice-player'
import { Message as ChatMessage, MessageContent, MessageHeader } from '@/components/ui/message'
import { Trace, TraceLine, TraceTitle } from '@/components/ui/trace'
import { MessageMarkdown } from './MessageMarkdown'
import { MessageBubble as PastaMessageBubble } from '@/components/ai/message-bubble'

export const MessageItem = memo(function MessageItem({ message, agent, relatedConversation, onOpenRelatedConversation, onNotice }: {
  message: Message
  agent?: Agent
  relatedConversation: Conversation | undefined
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
}) {
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'speaking'>('idle')
  const speak = async () => {
    if (audioState !== 'idle') { stopVoice(); setAudioState('idle'); return }
    setAudioState('loading')
    try {
      await speakVoice(message.text, () => setAudioState('speaking'), { agentId: message.agentId || agent?.id })
    } catch (error) { onNotice(errorText(error)) }
    finally { setAudioState('idle') }
  }
  const human = message.role === 'user'
  if (message.role === 'activity') return <Trace role="status" className="my-1.5 max-w-3xl"><TraceLine status={message.status === 'running' ? 'running' : message.status === 'failed' ? 'error' : message.status === 'queued' ? 'pending' : 'complete'}><TraceTitle>{message.text}</TraceTitle></TraceLine>
    {relatedConversation && <button onClick={() => onOpenRelatedConversation(relatedConversation.id)} className="ml-6 mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline">Abrir conversa relacionada: {relatedConversation.name}</button>}
    {message.delegationId && ['queued', 'running', 'waiting'].includes(message.status) && <button onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(error => onNotice(errorText(error)))} className="ml-6 mt-1 text-xs font-medium text-destructive underline-offset-4 hover:underline">Cancelar pedido</button>}
  </Trace>
  return <ChatMessage align={human ? 'end' : 'start'} className="mb-6">
    <MessageContent className={human ? 'w-fit max-w-[85%] gap-1' : 'max-w-[90%] gap-1'}>
      {!human && <MessageHeader className="mb-1 flex items-center gap-2 px-0 text-foreground">
        <span className="font-bold" title={agent?.name || message.author} style={agent?.color ? { color: agent.color } : undefined}>@{agent?.alias || message.author}</span>
        {message.role === 'assistant' && message.status === 'completed' && message.text.trim() && <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" aria-label={audioState === 'idle' ? 'Ouvir resposta do agente' : 'Parar áudio do agente'} title="Ouvir com a voz do Boo ou a voz geral. Configure em Voz em tempo real." onClick={() => void speak()}>{audioState === 'loading' ? <LoaderCircle className="size-3.5 animate-spin" /> : audioState === 'speaking' ? <Square className="size-3" /> : <Volume2 className="size-3.5" />}</Button>}
        {message.status === 'waiting' && <span className="font-normal text-amber-600">aguarda sua aprovação</span>}
        {message.status === 'queued' && <span className="font-normal text-muted-foreground">na fila</span>}
        {message.status === 'failed' && <span className="font-normal text-destructive">falhou</span>}
        {message.status === 'interrupted' && <span className="font-normal text-muted-foreground">cancelada</span>}
      </MessageHeader>}
      {!human && message.role === 'assistant' && <RunProgress status={message.status} agentName={agent?.name || message.author} />}
      {human ? <><PastaMessageBubble from="user" status={message.status === 'failed' ? 'failed' : message.status === 'queued' || message.status === 'running' ? 'sending' : 'sent'} className="whitespace-pre-wrap">{message.text}</PastaMessageBubble>{message.status === 'failed' && <span className="text-xs text-destructive">Falha no envio da instrução.</span>}</>
        : <MessageMarkdown>{message.text || (message.status === 'running' ? ' ' : '')}</MessageMarkdown>}
    </MessageContent>
  </ChatMessage>
}, (previous, next) => previous.message.id === next.message.id
  && previous.message.role === next.message.role
  && previous.message.status === next.message.status
  && previous.message.text === next.message.text
  && previous.message.author === next.message.author
  && previous.message.agentId === next.message.agentId
  && previous.message.runId === next.message.runId
  && previous.message.delegationId === next.message.delegationId
  && previous.agent?.id === next.agent?.id
  && previous.agent?.name === next.agent?.name
  && previous.agent?.alias === next.agent?.alias
  && previous.agent?.color === next.agent?.color
  && previous.relatedConversation?.id === next.relatedConversation?.id
  && previous.relatedConversation?.name === next.relatedConversation?.name
  && previous.onOpenRelatedConversation === next.onOpenRelatedConversation
  && previous.onNotice === next.onNotice)
