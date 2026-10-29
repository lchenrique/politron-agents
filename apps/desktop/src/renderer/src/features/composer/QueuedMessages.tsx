import { useState } from 'react'
import { ChevronDown, Pencil, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Message } from '../../../../shared/v9'
import styles from './Composer.module.css'

/** Fila de mensagens: cartões que saem de trás do campo de texto, na ordem de envio. */
export function QueuedMessages({ messages, onEdit, onSendNow, onRemove }: {
  messages: Message[]
  onEdit: (message: Message) => Promise<void>
  onSendNow: (message: Message) => Promise<void>
  onRemove: (message: Message) => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  if (!messages.length) return null
  const act = (message: Message, action: (message: Message) => Promise<void>) => {
    setBusyId(message.id)
    void action(message).finally(() => setBusyId(current => current === message.id ? null : current))
  }
  return <section aria-label="Mensagens na fila"
    className={styles.queue}>
    <button type="button" aria-expanded={open} className={styles.queueHeader} onClick={() => setOpen(current => !current)}>
      <span>{messages.length} {messages.length === 1 ? 'mensagem na fila' : 'mensagens na fila'}</span>
      <ChevronDown aria-hidden className={styles.queueChevron} data-open={open} />
    </button>
    {open && <ul className={styles.queueList}>
      {messages.map((message, index) => {
        const attachments = message.attachments?.length || 0
        const busy = busyId === message.id
        return <li key={message.id} className={styles.queueItem}>
          <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-foreground" title={message.text.slice(0, 500)}>{message.text || 'Imagem'}</span>
            {attachments > 0 && <span className="text-muted-foreground">{attachments === 1 ? '1 anexo' : `${attachments} anexos`}</span>}
          </span>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Editar" title="Editar: volta para o campo de texto" disabled={busy} onClick={() => act(message, onEdit)}><Pencil className="size-3.5" /></Button>
          {/* Em painéis estreitos o texto da mensagem tem prioridade: a ação vira só ícone. */}
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" aria-label="Enviar agora" title="Enviar agora" disabled={busy} onClick={() => act(message, onSendNow)}><Send className="size-3.5" /><span className="hidden @lg:inline">Enviar agora</span></Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 hover:text-destructive" aria-label="Remover" title="Remover da fila" disabled={busy} onClick={() => act(message, onRemove)}><Trash2 className="size-3.5" /></Button>
        </li>
      })}
    </ul>}
  </section>
}
