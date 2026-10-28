import type { Message } from '../../../../shared/v9'

/** Linha do histórico: uma mensagem ou, no lugar das atividades seguidas de um run, o grupo inteiro. */
export type ChatRow = Message & { activities?: Message[] }

const groupable = (message: Message) => message.role === 'activity' && !!message.runId && !message.delegationId && !message.relatedConversationId

/** Agrupa atividades seguidas do mesmo run e oculta respostas vazias já concluídas (sobram quando o texto final nasce depois do trabalho). */
export function chatRows(messages: Message[]): ChatRow[] {
  const rows: ChatRow[] = []
  for (const message of messages) {
    if (message.role === 'assistant' && message.runId && message.status === 'completed' && !message.text.trim()) continue
    // Mensagens na fila ficam nos cartões acima do campo; removidas da fila nunca entram no chat.
    if (message.role === 'user' && (message.status === 'queued' || message.status === 'cancelled')) continue
    const last = rows.at(-1)
    if (groupable(message) && last?.activities && last.runId === message.runId) last.activities.push(message)
    else rows.push(groupable(message) ? { ...message, activities: [message] } : message)
  }
  return rows
}
