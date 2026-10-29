import type { Message } from '../../../../shared/v9'
import { formatRunDuration } from './tool-call'

/**
 * Turnos da transcrição no modelo do DSH (ui-chat, MIT): um turno é a mensagem do usuário e todo o trabalho e as
 * respostas dos agentes até a próxima mensagem do usuário. Funções puras, testadas sem DOM.
 */

export type TurnStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted'

/** Bloco dentro do turno. `reply` é texto do agente; o resto é processo (recolhe quando o turno termina). */
export type TurnItem =
  | { kind: 'reply'; id: string; message: Message; /** Primeiro bloco de uma resposta: mostra avatar e nome do Boo. */ boo: boolean }
  | { kind: 'tools'; id: string; messages: Message[] }
  | { kind: 'reasoning'; id: string; message: Message }
  | { kind: 'delegations'; id: string; messages: Message[] }
  | { kind: 'note'; id: string; message: Message }

export interface Turn {
  id: string
  user?: Message
  items: TurnItem[]
  status: TurnStatus
  startedAt?: number
  finishedAt?: number
  /** Chamadas de ferramenta (sem raciocínio nem delegações). */
  toolCount: number
  /** Ids de todas as mensagens visíveis do turno (busca e foco). */
  messageIds: string[]
}

/** Mensagens originais que pertencem ao turno, na ordem apresentada. */
export function messagesInTurn(turn: Turn): Message[] {
  const messages: Message[] = turn.user ? [turn.user] : []
  for (const item of turn.items) {
    if (item.kind === 'tools' || item.kind === 'delegations') messages.push(...item.messages)
    else messages.push(item.message)
  }
  return messages
}

const ACTIVE = new Set<Message['status']>(['queued', 'running', 'waiting'])

const groupable = (message: Message) => message.role === 'activity' && !!message.runId && !message.delegationId && !message.relatedConversationId
/** Mensagem de origem na conversa que delegou; o pedido espelhado na conversa privada não entra no cartão. Textos antigos não têm delegationTask. */
export const isDelegationOrigin = (message: Message) => message.role === 'activity' && !!message.delegationId && !!message.relatedConversationId && !message.author.startsWith('Pedido de ')
  && (message.delegationTask !== undefined || /^Pedido (para|concluído por) /.test(message.text))
/** Linhas "Delegação · Boo" (ask_agent) e "Delegação · Consultar resultado": o cartão já mostra pedido e status. */
const askAgentActivity = (message: Message) => message.role === 'activity' && message.text.startsWith('Delegação · ')
const isReasoning = (message: Message) => message.role === 'activity' && message.tool?.name === 'reasoning'

const time = (value: string | undefined) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : undefined }

function statusOf(messages: Message[]): TurnStatus {
  const replies = messages.filter(message => message.role === 'assistant')
  if (replies.some(message => message.status === 'waiting')) return 'waiting'
  if (replies.some(message => ACTIVE.has(message.status)) || messages.some(message => message.role === 'activity' && (message.tool?.status === 'running' || message.status === 'running'))) return 'running'
  const last = replies.at(-1)?.status
  if (last === 'failed') return 'failed'
  if (last === 'interrupted' || last === 'cancelled') return 'interrupted'
  return 'completed'
}

function finishTurn(turn: Turn, raw: Message[]): Turn {
  turn.status = statusOf(raw)
  const times = raw.flatMap(message => [time(message.createdAt), time(message.finishedAt), time(message.tool?.finishedAt)]).filter((value): value is number => value !== undefined)
  turn.startedAt = time(turn.user?.createdAt) ?? (times.length ? Math.min(...times) : undefined)
  turn.finishedAt = times.length ? Math.max(...times) : undefined
  // Resposta de cada Boo: o primeiro texto do turno e cada troca de autor ganham o cabeçalho.
  let lastAgent: string | null | undefined
  for (const item of turn.items) {
    if (item.kind !== 'reply' || !item.message.text.trim()) continue
    const agent = item.message.agentId ?? item.message.author
    item.boo = agent !== lastAgent
    lastAgent = agent
  }
  return turn
}

/** Agrupa o histórico em turnos; mensagens anteriores à primeira do usuário formam um turno sem pergunta. */
export function buildTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  const hasDelegationCards = messages.some(isDelegationOrigin)
  let current: Turn | null = null
  let raw: Message[] = []
  const close = () => { if (current) turns.push(finishTurn(current, raw)); current = null; raw = [] }
  for (const message of messages) {
    // Respostas vazias concluídas são marcos internos do run; o texto final pode chegar numa mensagem seguinte.
    if (message.role === 'assistant' && message.runId && message.status === 'completed' && !message.text.trim()) continue
    // Mensagens na fila ficam nos cartões acima do campo; removidas da fila nunca entram no chat.
    if (message.role === 'user' && (message.status === 'queued' || message.status === 'cancelled')) continue
    if (message.role === 'user') {
      close()
      current = { id: `turn:${message.id}`, user: message, items: [], status: 'completed', toolCount: 0, messageIds: [message.id] }
      raw.push(message)
      continue
    }
    if (!current) current = { id: `turn:${message.id}`, items: [], status: 'completed', toolCount: 0, messageIds: [] }
    raw.push(message)
    if (hasDelegationCards && askAgentActivity(message)) continue
    const turn: Turn = current
    const last = turn.items.at(-1)
    turn.messageIds.push(message.id)
    if (isDelegationOrigin(message)) {
      if (last?.kind === 'delegations') last.messages.push(message)
      else turn.items.push({ kind: 'delegations', id: message.id, messages: [message] })
    } else if (isReasoning(message)) {
      turn.items.push({ kind: 'reasoning', id: message.id, message })
    } else if (groupable(message)) {
      turn.toolCount++
      if (last?.kind === 'tools' && last.messages[0]!.runId === message.runId) last.messages.push(message)
      else turn.items.push({ kind: 'tools', id: message.id, messages: [message] })
    } else if (message.role === 'activity') {
      turn.items.push({ kind: 'note', id: message.id, message })
    } else {
      turn.items.push({ kind: 'reply', id: message.id, message, boo: false })
    }
  }
  close()
  return turns
}

/** Itens que o turno concluído esconde atrás do cabeçalho; delegações ainda ativas continuam à vista. */
export function foldsAway(item: TurnItem): boolean {
  if (item.kind === 'reply') return false
  if (item.kind === 'delegations') return !item.messages.some(message => ACTIVE.has(message.status))
  return true
}

/** O DSH mantém abertos turnos que falharam ou foram interrompidos; só os concluídos recolhem. */
export const turnFoldable = (turn: Turn) => turn.status === 'completed' && turn.items.some(foldsAway)

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Cabeçalho do turno encerrado: "Concluído em 1min 23s · 3 ferramentas", "Falhou", "Interrompido"; null enquanto roda. */
export function turnHeaderText(turn: Turn): string | null {
  if (turn.status === 'running' || turn.status === 'waiting' || !turn.items.length) return null
  const tools = turn.toolCount ? ` · ${plural(turn.toolCount, 'ferramenta', 'ferramentas')}` : ''
  if (turn.status === 'failed') return `Falhou${tools}`
  if (turn.status === 'interrupted') return `Interrompido${tools}`
  if (turn.startedAt === undefined || turn.finishedAt === undefined) return `Concluído${tools}`
  // Como no DSH: mínimo de 1 s para o turno encerrado.
  return `Concluído em ${formatRunDuration(Math.max(1000, turn.finishedAt - turn.startedAt))}${tools}`
}

/** Texto da última resposta do turno (copiar/ouvir no rodapé). */
export function finalReply(turn: Turn): Message | undefined {
  for (let index = turn.items.length - 1; index >= 0; index--) {
    const item = turn.items[index]!
    if (item.kind === 'reply' && item.message.text.trim()) return item.message
  }
  return undefined
}

/** O rodapé fica sempre visível no último turno que termina em resposta; nos outros, só ao passar o mouse (DSH). */
export function endsWithReply(turn: Turn): boolean {
  const last = [...turn.items].reverse().find(item => item.kind !== 'reply' || item.message.text.trim())
  return last?.kind === 'reply'
}
