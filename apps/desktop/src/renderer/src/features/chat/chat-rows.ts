import type { Message } from '../../../../shared/v9'

/** Linha do histórico: uma mensagem ou, no lugar das atividades seguidas de um run (ou das delegações seguidas), o grupo inteiro. */
export type ChatRow = Message & { activities?: Message[]; delegations?: Message[] }

const groupable = (message: Message) => message.role === 'activity' && !!message.runId && !message.delegationId && !message.relatedConversationId
/** Mensagem de origem na conversa que delegou; o pedido espelhado na conversa privada não entra no cartão. Textos antigos não têm delegationTask. */
export const isDelegationOrigin = (message: Message) => message.role === 'activity' && !!message.delegationId && !!message.relatedConversationId && !message.author.startsWith('Pedido de ')
  && (message.delegationTask !== undefined || /^Pedido (para|concluído por) /.test(message.text))
/** Linhas "Delegação · Boo" (ask_agent) e "Delegação · Consultar resultado": o cartão já mostra pedido e status. */
const askAgentActivity = (message: Message) => message.role === 'activity' && message.text.startsWith('Delegação · ')

/** Agrupa atividades seguidas do mesmo run e delegações seguidas, e oculta respostas vazias já concluídas (sobram quando o texto final nasce depois do trabalho). */
export function chatRows(messages: Message[]): ChatRow[] {
  const rows: ChatRow[] = []
  const hasDelegationCards = messages.some(isDelegationOrigin)
  for (const message of messages) {
    if (message.role === 'assistant' && message.runId && message.status === 'completed' && !message.text.trim()) continue
    // Mensagens na fila ficam nos cartões acima do campo; removidas da fila nunca entram no chat.
    if (message.role === 'user' && (message.status === 'queued' || message.status === 'cancelled')) continue
    if (hasDelegationCards && askAgentActivity(message)) continue
    const last = rows.at(-1)
    if (isDelegationOrigin(message)) {
      if (last?.delegations) last.delegations.push(message)
      else rows.push({ ...message, delegations: [message] })
      continue
    }
    if (groupable(message) && last?.activities && last.runId === message.runId) last.activities.push(message)
    else rows.push(groupable(message) ? { ...message, activities: [message] } : message)
  }
  return rows
}
