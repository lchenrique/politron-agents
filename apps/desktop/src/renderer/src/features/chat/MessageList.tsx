import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, FolderOpen } from 'lucide-react'
import { AssistantRuntimeProvider, ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'
import type { Agent, Approval, Conversation, FileChange, Message } from '../../../../shared/v9'
import { assistantIdOf, useTranscriptRuntime } from './assistant-ui-adapter'
import { TranscriptContext, TranscriptMessage, type TranscriptContextValue } from './TranscriptMessages'
import { buildTurns, endsWithReply, finalReply } from './turns'
import { TurnNavigator } from './TurnNavigator'
import { useTurnNavigation } from './useTurnNavigation'
import css from './Transcript.module.css'

type Pending = { restore: { firstId: string | undefined; height: number; top: number } | null; focus: string | null; bottom: boolean }

/** Roda depois que o runtime entrega mensagens ao DOM (mesmo commit): restaura a leitura, o foco e o fim. */
function ScrollCoordinator({ apply }: { apply: (firstId: string | undefined) => void }) {
  const messages = useAuiState(state => state.thread.messages)
  useLayoutEffect(() => { apply(messages[0]?.id) }, [messages, apply])
  return null
}

const renderMessage = () => <TranscriptMessage />

export function MessageList({ messages: sourceMessages, fileChanges, reviewRunId = null, approvals, conversations, agentOf, onOpenRelatedConversation, onNotice, hasOlderMessages, onLoadOlder, focusedMessageId, hasNewerMessages, onReturnToLatest, canCancelQueued = false, workspaceName }: {
  messages: Message[]
  fileChanges: FileChange[]
  /** Run cuja revisão já aparece acima do composer; não é repetido no histórico. */
  reviewRunId?: string | null
  approvals: Approval[]
  conversations: Conversation[]
  agentOf: (id: string | null) => Agent | undefined
  onOpenRelatedConversation: (id: string) => void
  onNotice: (value: string) => void
  hasOlderMessages?: boolean
  onLoadOlder?: () => Promise<unknown>
  focusedMessageId?: string | null
  hasNewerMessages?: boolean
  onReturnToLatest?: () => void
  canCancelQueued?: boolean
  /** Nome do workspace da conversa; a ausência é apresentada sem oferecer uma ação falsa de seleção. */
  workspaceName?: string
}) {
  const turns = useMemo(() => buildTurns(sourceMessages), [sourceMessages])
  const runtime = useTranscriptRuntime(turns)
  const viewport = useRef<HTMLDivElement>(null)
  const pending = useRef<Pending>({ restore: null, focus: null, bottom: false })
  const [loadingOlder, setLoadingOlder] = useState(false)
  const { activeIndex, onScroll, navigate } = useTurnNavigation(viewport)

  const messagesById = useMemo(() => new Map(sourceMessages.map(message => [message.id, message])), [sourceMessages])
  const lastMessageByRun = useMemo(() => {
    const result = new Map<string, string>()
    for (const turn of turns) for (const id of turn.messageIds) {
      const message = messagesById.get(id)
      if (message?.runId) result.set(message.runId, message.id)
    }
    return result
  }, [turns, messagesById])
  const conversationsById = useMemo(() => new Map(conversations.map(conversation => [conversation.id, conversation])), [conversations])
  const approvalsByRun = useMemo(() => {
    const result = new Map<string, Approval[]>()
    for (const approval of approvals) { const items = result.get(approval.runId); if (items) items.push(approval); else result.set(approval.runId, [approval]) }
    return result
  }, [approvals])
  // Escritas confirmadas ficam sob a resposta que as produziu (FileChange.messageId). Falhas, resultados
  // indeterminados e escritas sem mudança nunca aparecem como aplicados. O registro também precisa pertencer
  // ao run da mensagem; sem essa coerência nada é atribuído. Arrays estáveis evitam recalcular diffs.
  const appliedCache = useRef(new Map<string, FileChange[]>())
  // O streaming troca o array de mensagens a cada fragmento; a associação só muda quando muda o par id→run.
  const messageRuns = useMemo(() => sourceMessages.map(message => `${message.id}\u0000${message.runId || ''}`).join('\u0001'), [sourceMessages])
  const appliedByMessage = useMemo(() => {
    const runOfMessage = new Map(messageRuns ? messageRuns.split('\u0001').map(entry => entry.split('\u0000') as [string, string]) : [])
    const result = new Map<string, FileChange[]>()
    for (const change of fileChanges) {
      if (change.status !== 'applied' || (reviewRunId && change.runId === reviewRunId)) continue
      if (!change.runId || runOfMessage.get(change.messageId) !== change.runId) continue
      const items = result.get(change.messageId)
      if (items) items.push(change); else result.set(change.messageId, [change])
    }
    // Reaproveita o array anterior quando os registros são os mesmos, para a revisão não recalcular o diff.
    for (const [id, items] of result) {
      const previous = appliedCache.current.get(id)
      if (previous && previous.length === items.length && previous.every((change, index) => change === items[index])) result.set(id, previous)
    }
    appliedCache.current = result
    return result
  }, [messageRuns, fileChanges, reviewRunId])

  const context = useMemo<TranscriptContextValue>(() => {
    const last = turns.at(-1)
    const latest = last && endsWithReply(last) ? finalReply(last) : undefined
    return {
      messagesById, lastMessageByRun, approvalsByRun, appliedByMessage, conversationsById, agentOf, focusedMessageId, canCancelQueued, onOpenRelatedConversation, onNotice,
      turnsById: new Map(turns.map(turn => [assistantIdOf(turn), turn])),
      booReplies: new Set(turns.flatMap(turn => turn.items.flatMap(item => item.kind === 'reply' && item.boo ? [item.message.id] : []))),
      alwaysActionsId: latest?.id,
    }
  }, [turns, messagesById, lastMessageByRun, approvalsByRun, appliedByMessage, conversationsById, agentOf, focusedMessageId, canCancelQueued, onOpenRelatedConversation, onNotice])

  const apply = useCallback((firstId: string | undefined) => {
    const element = viewport.current
    if (!element) return
    const work = pending.current
    if (work.restore && work.restore.firstId !== firstId) {
      // Mensagens anteriores entraram acima: mantém a mesma linha na tela.
      element.scrollTop = work.restore.top + element.scrollHeight - work.restore.height
      work.restore = null
      return
    }
    if (work.focus) {
      const target = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(node => node.dataset.messageId === work.focus)
      if (target) { target.scrollIntoView({ block: 'start' }); work.focus = null }
      return
    }
    if (work.bottom) { element.scrollTop = element.scrollHeight; work.bottom = false }
  }, [])
  const viewingOlder = useRef(!!hasNewerMessages)
  useLayoutEffect(() => {
    if (viewingOlder.current && !hasNewerMessages) pending.current.bottom = true
    viewingOlder.current = !!hasNewerMessages
    if (focusedMessageId) pending.current.focus = focusedMessageId
    apply(runtime.thread.getState().messages[0]?.id)
  }, [focusedMessageId, hasNewerMessages, apply, runtime])

  const loadOlder = async () => {
    const element = viewport.current
    if (!element || !onLoadOlder || loadingOlder || !hasOlderMessages) return
    pending.current.restore = { firstId: runtime.thread.getState().messages[0]?.id, height: element.scrollHeight, top: element.scrollTop }
    setLoadingOlder(true)
    try { await onLoadOlder() } catch (error) { pending.current.restore = null; onNotice(error instanceof Error ? error.message : 'Não foi possível carregar mensagens anteriores.') }
    finally { setLoadingOlder(false) }
  }

  return <AssistantRuntimeProvider runtime={runtime}><TranscriptContext.Provider value={context}>
    <ThreadPrimitive.Root className={css.root}>
      <ThreadPrimitive.Viewport ref={viewport} onScroll={onScroll} autoScroll={!focusedMessageId && !hasNewerMessages} scrollToBottomOnInitialize={!focusedMessageId && !hasNewerMessages} className={css.scroll}>
        <ScrollCoordinator apply={apply} />
        {hasNewerMessages && <div className={css.newer}><Button type="button" variant="outline" size={null} onClick={onReturnToLatest}>Voltar às mensagens recentes</Button></div>}
        {turns.length > 1 && <TurnNavigator count={turns.length} activeIndex={activeIndex} onNavigate={navigate} />}
        <div className={css.column}>
          {hasOlderMessages && <div className={css.older}><Button type="button" variant="outline" size={null} disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}</Button></div>}
          <div className={css.messages}><ThreadPrimitive.Messages>{renderMessage}</ThreadPrimitive.Messages></div>
          {!turns.length && <div className={css.empty} data-testid="chat-empty-state">
            <h2 className={css.emptyTitle}>Como posso ajudar?</h2>
            <p className={css.emptyHint}>Escreva abaixo para começar. Enter envia, Shift+Enter quebra a linha.</p>
            <div className={css.emptyWorkspace} data-testid="chat-empty-workspace">
              <FolderOpen aria-hidden="true" size={15} strokeWidth={1.7} />
              <span>{workspaceName || 'Sem projeto'}</span>
              {workspaceName && <ChevronDown aria-hidden="true" size={14} strokeWidth={1.7} />}
            </div>
          </div>}
        </div>
        <ThreadPrimitive.ViewportFooter className={css.toBottomSlot}>
          <ThreadPrimitive.ScrollToBottom asChild>
            <Button type="button" variant="ghost" size="icon" className={css.toBottom} aria-label="Ir para as mensagens mais recentes" title="Ir para as mensagens mais recentes"><ArrowDown aria-hidden="true" /></Button>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  </TranscriptContext.Provider></AssistantRuntimeProvider>
}
