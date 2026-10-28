import { useState } from 'react'
import { Pencil, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Message } from '../../../../shared/v9'

/** Fila de mensagens: cartões que saem de trás do campo de texto, na ordem de envio. */
export function QueuedMessages({ messages, onEdit, onSendNow, onRemove }: {
  messages: Message[]
  onEdit: (message: Message) => Promise<void>
  onSendNow: (message: Message) => Promise<void>
  onRemove: (message: Message) => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  if (!messages.length) return null
  const act = (message: Message, action: (message: Message) => Promise<void>) => {
    setBusyId(message.id)
    void action(message).finally(() => setBusyId(current => current === message.id ? null : current))
  }
  return <section aria-label="Mensagens na fila"
    className="relative mx-3 -mb-3 max-h-40 overflow-y-auto rounded-t-xl border border-b-0 border-border bg-muted/70 px-2 pb-4 pt-1.5 transition-[translate,opacity] duration-200 ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none">
    <ul className="flex flex-col gap-1">
      {messages.map((message, index) => {
        const attachments = message.attachments?.length || 0
        const busy = busyId === message.id
        return <li key={message.id} className="flex items-center gap-2 rounded-lg bg-card/80 px-2 py-1 text-xs">
          <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-foreground">{message.text || 'Imagem'}</span>
            {attachments > 0 && <span className="text-muted-foreground">{attachments === 1 ? '1 anexo' : `${attachments} anexos`}</span>}
          </span>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Editar" title="Editar: volta para o campo de texto" disabled={busy} onClick={() => act(message, onEdit)}><Pencil className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" disabled={busy} onClick={() => act(message, onSendNow)}><Send className="size-3.5" />Enviar agora</Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 hover:text-destructive" aria-label="Remover" title="Remover da fila" disabled={busy} onClick={() => act(message, onRemove)}><Trash2 className="size-3.5" /></Button>
        </li>
      })}
    </ul>
  </section>
}
