import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy, Volume2, LoaderCircle, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Message, MessageAttachment } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'
import { RunProgress } from './RunProgress'
import { speakVoice, stopVoice } from '../voice/voice-player'
import { Message as ChatMessage, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import { Trace, TraceLine, TraceTitle } from '@/components/ui/trace'
import { MessageMarkdown } from './MessageMarkdown'
import { StreamingText } from './StreamingText'
import { MessageBubble as PastaMessageBubble } from '@/components/ai/message-bubble'

const COPY_FEEDBACK_MS = 2000
const COPY_SUCCESS_NOTICE = 'Mensagem copiada.'
const COPY_FAILURE_NOTICE = 'Não foi possível copiar a mensagem. Verifique o acesso à área de transferência.'

function messageTime(createdAt: string) {
  const date = new Date(createdAt)
  if (!createdAt || Number.isNaN(date.getTime())) return null
  return { short: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), full: date.toLocaleString('pt-BR') }
}

function sameAttachments(previous?: MessageAttachment[], next?: MessageAttachment[]) {
  return previous === next || (!!previous && !!next && previous.length === next.length && previous.every((item, index) => {
    const other = next[index]
    return item.id === other.id && item.name === other.name && item.mimeType === other.mimeType && item.size === other.size
  }))
}

/** Copia o texto bruto da mensagem. O conteúdo nunca vai para log nem para o aviso; só o resultado é comunicado. */
function CopyMessageButton({ text, onNotice, className }: { text: string; onNotice: (value: string) => void; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível')
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onNotice(COPY_SUCCESS_NOTICE)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { timer.current = null; setCopied(false) }, COPY_FEEDBACK_MS)
    } catch {
      setCopied(false)
      onNotice(COPY_FAILURE_NOTICE)
    }
  }
  return <Button type="button" size="icon" variant="ghost" className={'size-6 text-muted-foreground ' + (className || '')}
    aria-label={copied ? 'Mensagem copiada' : 'Copiar mensagem'} title="Copiar mensagem" onClick={() => void copy()}>
    {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
  </Button>
}

function AttachmentPreview({ conversationId, attachment, onNotice }: { conversationId: string; attachment: MessageAttachment; onNotice: (value: string) => void }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    setSource('')
    void window.appAPI.readAttachment(conversationId, attachment.id).then(({ mimeType, bytes }) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || bytes.byteLength !== attachment.size || bytes.byteLength > 20 * 1024 * 1024) throw new Error('O anexo de imagem é inválido ou expirou.')
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      objectUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }))
      if (disposed) URL.revokeObjectURL(objectUrl)
      else setSource(objectUrl)
    }).catch(error => { if (!disposed) onNotice(errorText(error)) })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [conversationId, attachment.id, attachment.size, onNotice])
  return <figure className="max-w-full overflow-hidden rounded-lg border border-border/70 bg-muted/30">
    {source ? <img src={source} alt={attachment.name} loading="lazy" className="max-h-96 max-w-full object-contain" /> : <div role="status" className="px-3 py-2 text-xs text-muted-foreground">Carregando {attachment.name}…</div>}
    <figcaption className="truncate px-2 py-1 text-[11px] text-muted-foreground">{attachment.name}</figcaption>
  </figure>
}

export const MessageItem = memo(function MessageItem({ message, agent, relatedConversation, onOpenRelatedConversation, onNotice, canSpeak = true, canCancelQueued = false, quietProgress = false }: {
  message: Message
  agent?: Agent
  relatedConversation: Conversation | undefined
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
  canSpeak?: boolean
  canCancelQueued?: boolean
  /** O run já mostra a linha de atividade: não repete "está trabalhando". */
  quietProgress?: boolean
}) {
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'speaking'>('idle')
  const [cancelingQueued, setCancelingQueued] = useState(false)
  const cancelQueued = async () => {
    setCancelingQueued(true)
    try { await window.appAPI.cancelQueuedMessage(message.id) }
    catch (error) { onNotice(errorText(error)) }
    finally { setCancelingQueued(false) }
  }
  const speak = async () => {
    if (audioState !== 'idle') { stopVoice(); setAudioState('idle'); return }
    setAudioState('loading')
    try {
      await speakVoice(message.text, () => setAudioState('speaking'), { agentId: message.agentId || agent?.id })
    } catch (error) { onNotice(errorText(error)) }
    finally { setAudioState('idle') }
  }
  const human = message.role === 'user'
  const time = messageTime(message.createdAt)
  // Durante o streaming o texto ainda está incompleto; copiar só depois que a resposta assenta.
  const canCopy = !!message.text.trim() && (human || (message.status !== 'running' && message.status !== 'waiting'))
  if (message.role === 'activity') return <Trace role="status" className="my-1.5 max-w-3xl"><TraceLine status={message.status === 'running' ? 'running' : message.status === 'failed' ? 'error' : message.status === 'queued' ? 'pending' : 'complete'}><TraceTitle>{message.text}</TraceTitle></TraceLine>
    {relatedConversation && <Button variant="link" onClick={() => onOpenRelatedConversation(relatedConversation.id)} className="ml-6 mt-1 h-auto p-0 text-xs font-medium text-primary underline-offset-4 hover:underline">Abrir conversa relacionada: {relatedConversation.name}</Button>}
    {message.delegationId && ['queued', 'running', 'waiting'].includes(message.status) && <Button variant="link" onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(error => onNotice(errorText(error)))} className="ml-6 mt-1 h-auto p-0 text-xs font-medium text-destructive underline-offset-4 hover:underline">Cancelar pedido</Button>}
  </Trace>
  return <ChatMessage align={human ? 'end' : 'start'} className="mb-6">
    <MessageContent className={human ? 'w-fit max-w-[85%] gap-1' : 'max-w-[90%] gap-1'}>
      {!human && <MessageHeader className="mb-1 flex items-center gap-2 px-0 text-foreground">
        <span className="font-bold" title={agent?.name || message.author} style={agent?.color ? { color: agent.color } : undefined}>@{agent?.alias || message.author}</span>
        {time && <time dateTime={message.createdAt} title={time.full} className="font-normal tabular-nums text-muted-foreground">{time.short}</time>}
        {message.status === 'waiting' && <span className="font-normal text-warning">aguarda sua aprovação</span>}
        {message.status === 'queued' && <span className="font-normal text-muted-foreground">na fila</span>}
        {message.status === 'failed' && <span className="font-normal text-destructive">falhou</span>}
        {message.status === 'interrupted' && <span className="font-normal text-muted-foreground">cancelada</span>}
        <span role="group" aria-label="Ações da mensagem" className="ml-auto flex items-center gap-0.5 empty:hidden">
          {canCopy && <CopyMessageButton text={message.text} onNotice={onNotice} />}
          {canSpeak && message.role === 'assistant' && message.status === 'completed' && message.text.trim() && <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" aria-label={audioState === 'idle' ? 'Ouvir resposta do agente' : 'Parar áudio do agente'} title="Ouvir com a voz configurada no host." onClick={() => void speak()}>{audioState === 'loading' ? <LoaderCircle className="size-3.5 animate-spin" /> : audioState === 'speaking' ? <Square className="size-3" /> : <Volume2 className="size-3.5" />}</Button>}
        </span>
      </MessageHeader>}
      {!human && message.role === 'assistant' && !(quietProgress && message.status === 'running') && <RunProgress status={message.status} agentName={agent?.name || message.author} />}
      {human ? <><PastaMessageBubble from="user" status={message.status === 'failed' ? 'failed' : message.status === 'queued' || message.status === 'running' ? 'sending' : 'sent'} className="whitespace-pre-wrap">{message.text}</PastaMessageBubble>{message.status === 'failed' && <span className="text-xs text-destructive">Falha no envio da instrução.</span>}
        {message.attachments?.length ? <div className="mt-2 flex max-w-full flex-wrap gap-2">{message.attachments.map(attachment => <AttachmentPreview key={attachment.id} conversationId={message.conversationId} attachment={attachment} onNotice={onNotice} />)}</div> : null}
        {/* Ações do usuário aparecem ao passar o mouse ou focar; em telas sem hover ficam sempre visíveis. */}
        {(canCopy || time || (canCancelQueued && message.status === 'queued')) && <MessageFooter role="group" aria-label="Ações da mensagem" className="gap-1 px-0 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {time && <time dateTime={message.createdAt} title={time.full} className="font-normal tabular-nums">{time.short}</time>}
          {message.status === 'queued' && <span className="text-muted-foreground">Na fila</span>}
          {canCopy && <CopyMessageButton text={message.text} onNotice={onNotice} />}
          {canCancelQueued && message.status === 'queued' && <Button type="button" size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-destructive" aria-label="Cancelar mensagem na fila" title="Cancelar mensagem na fila" disabled={cancelingQueued} onClick={() => void cancelQueued()}>{cancelingQueued ? <LoaderCircle className="size-3.5 animate-spin" /> : <X className="size-3.5" />}</Button>}
        </MessageFooter>}</>
        : message.status === 'running' || message.status === 'waiting'
          ? <StreamingText text={message.text || ' '} />
          : <MessageMarkdown>{message.text}</MessageMarkdown>}
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
  && sameAttachments(previous.message.attachments, next.message.attachments)
  && previous.canCancelQueued === next.canCancelQueued
  && previous.quietProgress === next.quietProgress
  && previous.agent?.id === next.agent?.id
  && previous.agent?.name === next.agent?.name
  && previous.agent?.alias === next.agent?.alias
  && previous.agent?.color === next.agent?.color
  && previous.relatedConversation?.id === next.relatedConversation?.id
  && previous.relatedConversation?.name === next.relatedConversation?.name
  && previous.onOpenRelatedConversation === next.onOpenRelatedConversation
  && previous.canSpeak === next.canSpeak
  && previous.onNotice === next.onNotice)
