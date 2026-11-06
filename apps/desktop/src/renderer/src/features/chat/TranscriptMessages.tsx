import { createContext, useContext } from 'react'
import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import type { Agent, Approval, Conversation, FileChange, Message } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { ToolCallTree } from '@/components/dsh'
import { CompletedFileReview } from '../diff/CompletedFileReview'
import { DelegationCard } from './DelegationCard'
import { MessageItem } from './MessageItem'
import { PolitronToolApproval } from './PolitronToolApproval'
import { DshToolGroup, ReasoningDisclosure, RunningTurnStatus } from './TranscriptBlocks'
import { DELEGATION_TOOL, NOTE_TOOL } from './assistant-ui-adapter'
import { activityToolCall } from './tool-call'
import { messagesInTurn, turnHeaderText, type Turn } from './turns'
import css from './Transcript.module.css'

const INLINE_REVIEW_LABEL = 'Arquivos modificados nesta resposta'

/** Dados V1 e callbacks que as mensagens do assistant-ui precisam; o runtime só carrega a ordem e as partes. */
export interface TranscriptContextValue {
  messagesById: Map<string, Message>
  /** Id da mensagem assistant do turno → turno. */
  turnsById: Map<string, Turn>
  /** Respostas que mostram avatar e nome do Boo. */
  booReplies: Set<string>
  /** Resposta cujo rodapé fica sempre visível. */
  alwaysActionsId: string | undefined
  lastTurnId: string | undefined
  lastMessageByRun: Map<string, string>
  approvalsByRun: Map<string, Approval[]>
  appliedByMessage: Map<string, FileChange[]>
  conversationsById: Map<string, Conversation>
  agentOf: (id: string | null) => Agent | undefined
  focusedMessageId?: string | null
  canCancelQueued: boolean
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
}
export const TranscriptContext = createContext<TranscriptContextValue | null>(null)
const useTranscript = () => { const value = useContext(TranscriptContext); if (!value) throw new Error('TranscriptContext ausente'); return value }

/** Agrupa ferramentas seguidas e delegações seguidas; raciocínio, texto e notas ficam soltos. */
const GROUP_BY = (part: { type: string; toolName?: string }) =>
  part.type !== 'tool-call' ? null : part.toolName === DELEGATION_TOOL ? ['group-delegation'] as const : part.toolName === NOTE_TOOL ? null : ['group-tool'] as const

/** Id da mensagem V1 de uma parte do runtime (texto/raciocínio: parentId; ferramenta: toolCallId). */
const partMessageId = (part: { type: string; toolCallId?: string; parentId?: string }) => part.type === 'tool-call' ? part.toolCallId : part.parentId

function useExtras() {
  const ctx = useTranscript()
  const applied = (message: Message) => ctx.appliedByMessage.get(message.id) && <CompletedFileReview changes={ctx.appliedByMessage.get(message.id)!} label={INLINE_REVIEW_LABEL} />
  const approvals = (message: Message) => message.runId && ctx.lastMessageByRun.get(message.runId) === message.id && (ctx.approvalsByRun.get(message.runId) || []).map(approval => <PolitronToolApproval key={approval.id} approval={approval} onNotice={ctx.onNotice} />)
  return { ctx, applied, approvals }
}

export function UserTurn() {
  const { ctx, applied, approvals } = useExtras()
  const id = useAuiState(state => state.message.id)
  const message = ctx.messagesById.get(id)
  if (!message) return null
  const isLast = ctx.lastTurnId === `turn:${message.id}`
  return <MessagePrimitive.Root data-part="user" data-turn-start="" className={`${css.userTurn}${ctx.focusedMessageId === id ? ` ${css.focused}` : ''}`}>
    <MessageItem message={message} agent={ctx.agentOf(message.agentId)} relatedConversation={undefined} onOpenRelatedConversation={ctx.onOpenRelatedConversation} onNotice={ctx.onNotice} canSpeak={false} canCancelQueued={ctx.canCancelQueued} presentation="dsh" alwaysShowActions={isLast} />
    {applied(message)}{approvals(message)}
  </MessagePrimitive.Root>
}

/** O turno inteiro do assistente: texto, ferramentas, raciocínio e delegações na ordem do V1, dentro de uma única mensagem. */
export function AssistantTurn() {
  const { ctx, applied, approvals } = useExtras()
  const id = useAuiState(state => state.message.id)
  const content = useAuiState(state => state.message.content)
  const turn = ctx.turnsById.get(id)
  if (!turn) return null
  const ids = content.map(partMessageId)
  const messageAt = (index: number) => ids[index] ? ctx.messagesById.get(ids[index]!) : undefined
  const focus = (messageId: string) => ctx.focusedMessageId === messageId ? css.focused : undefined
  const active = turn.status === 'running'
  const extras = (message: Message) => <>{applied(message)}{approvals(message)}</>
  // Aprovação mostra sob a última mensagem do run; se ela não virou parte (resposta vazia), cai no fim do turno.
  const rendered = new Set(content.flatMap(part => part.type === 'tool-call' && part.toolName === DELEGATION_TOOL ? [] : [partMessageId(part)]))
  const orphanRuns = [...new Set(messagesInTurn(turn).filter(message => message.runId && ctx.lastMessageByRun.get(message.runId) === message.id && !rendered.has(message.id)).map(message => message.runId!))]
  const header = turnHeaderText(turn)
  return <MessagePrimitive.Root className={css.turn} data-turn-start={turn.user ? undefined : ''}>
    <MessagePrimitive.GroupedParts groupBy={GROUP_BY} indicator="never">
      {({ part }) => {
        if (part.type === 'group-tool' || part.type === 'group-delegation') {
          const messages = (part as { indices: readonly number[] }).indices.map(messageAt).filter((message): message is Message => !!message)
          if (!messages.length) return null
          if (part.type === 'group-delegation') return <div data-part="extra" data-message-id={messages[0]!.id}>
            <DelegationCard delegations={messages} agentOf={ctx.agentOf} conversationsById={ctx.conversationsById} onOpenRelatedConversation={ctx.onOpenRelatedConversation} onNotice={ctx.onNotice} />
          </div>
          return <div data-part="process">
            <DshToolGroup messages={messages} turnActive={active} agent={ctx.agentOf(messages[0]!.agentId)} autoOpen={!!ctx.focusedMessageId && messages.some(message => message.id === ctx.focusedMessageId)}>
              {messages.map(message => <div key={message.id} data-message-id={message.id} className={focus(message.id)}>
                <ToolCallTree call={activityToolCall(message, active)} />
                {applied(message)}
              </div>)}
            </DshToolGroup>
            {messages.map(message => <div key={`approval:${message.id}`} data-part="extra">{approvals(message)}</div>)}
          </div>
        }
        const message = ctx.messagesById.get(partMessageId(part as { type: string; toolCallId?: string; parentId?: string }) ?? '')
        if (!message) return null
        if (part.type === 'text') return <div data-part="reply" data-message-id={message.id} className={focus(message.id)}>
          <MessageItem message={message} agent={ctx.agentOf(message.agentId)} relatedConversation={undefined} onOpenRelatedConversation={ctx.onOpenRelatedConversation} onNotice={ctx.onNotice} presentation="dsh" showAgent={ctx.booReplies.has(message.id)} alwaysShowActions={ctx.alwaysActionsId === message.id} />
          {extras(message)}
        </div>
        if (part.type === 'reasoning') return <div data-part="process" data-message-id={message.id} className={focus(message.id)}>
          <ReasoningDisclosure message={message} autoOpen={ctx.focusedMessageId === message.id} />{extras(message)}
        </div>
        if (part.type === 'tool-call') {
          const related = message.relatedConversationId ? ctx.conversationsById.get(message.relatedConversationId) : undefined
          return <div data-part="extra" data-message-id={message.id} className={`${css.note} ${focus(message.id) ?? ''}`}>
            <span>{message.text}</span>
            {related && <Button type="button" variant="link" size={null} onClick={() => ctx.onOpenRelatedConversation(related.id)} className={css.noteLink}>Abrir conversa relacionada: {related.name}</Button>}
            {message.delegationId && ['queued', 'running', 'waiting'].includes(message.status) && <Button type="button" variant="link" size={null} onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(error => ctx.onNotice(error instanceof Error ? error.message : 'Não foi possível cancelar a delegação.'))} className={css.noteLink} data-tone="danger">Cancelar pedido</Button>}
            {extras(message)}
          </div>
        }
        return null
      }}
    </MessagePrimitive.GroupedParts>
    {orphanRuns.map(runId => <div key={`approvals:${runId}`} data-part="extra">{(ctx.approvalsByRun.get(runId) || []).map(approval => <PolitronToolApproval key={approval.id} approval={approval} onNotice={ctx.onNotice} />)}</div>)}
    {(turn.status === 'running' || turn.status === 'waiting')
      ? <RunningTurnStatus turn={turn} />
      : header && <div data-part="header"><div className={css.header} aria-live="polite"><span className={css.headerLabel}>{header}</span></div></div>}
  </MessagePrimitive.Root>
}

/** Mensagem do runtime: usuário ou o turno do assistente. */
export function TranscriptMessage() {
  const role = useAuiState(state => state.message.role)
  return role === 'user' ? <UserTurn /> : <AssistantTurn />
}
