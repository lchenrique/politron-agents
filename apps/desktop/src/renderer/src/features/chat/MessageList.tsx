import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import type { Approval, FileChange } from '../../../../shared/v9'
import { MessageItem } from './MessageItem'
import { DelegationCard } from './DelegationCard'
import { PolitronToolApproval } from './PolitronToolApproval'
import { CompletedFileReview } from '../diff/CompletedFileReview'
import { ActivityParts, RuntimeMessage } from './AssistantUIMessageBridge'
import { buildTurns, endsWithReply, finalReply, foldsAway, messagesInTurn, turnFoldable, turnHeaderText, type TurnItem } from './turns'
import { TurnNavigator } from './TurnNavigator'
import { useTurnNavigation } from './useTurnNavigation'
import { DshToolGroup, ReasoningDisclosure, RunningTurnStatus } from './TranscriptBlocks'
import css from './Transcript.module.css'

const INLINE_REVIEW_LABEL = 'Arquivos modificados nesta resposta'

/** Distância do fim ainda considerada "no final", para decidir se um novo evento deve puxar o scroll junto. */
const STICK_TO_BOTTOM_PX = 96

const ESTIMATED_TURN_HEIGHT = 220
const OVERSCAN_PX = 900

export function MessageList({ messages: sourceMessages, fileChanges, reviewRunId = null, approvals, conversations, agentOf, selectedAgents, onOpenRelatedConversation, onNotice, hasOlderMessages, onLoadOlder, focusedMessageId, hasNewerMessages, onReturnToLatest, canCancelQueued = false, workspaceName }: {
  messages: Message[]
  fileChanges: FileChange[]
  /** Run cuja revisão já aparece acima do composer; não é repetido no histórico. */
  reviewRunId?: string | null
  approvals: Approval[]
  conversations: Conversation[]
  agentOf: (id: string | null) => Agent | undefined
  selectedAgents: Agent[]
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
  const messagesById = useMemo(() => new Map(sourceMessages.map(message => [message.id, message])), [sourceMessages])
  const lastMessageByRun = useMemo(() => {
    const result = new Map<string, string>()
    for (const turn of turns) for (const id of turn.messageIds) {
      const message = messagesById.get(id)
      if (message?.runId) result.set(message.runId, message.id)
    }
    return result
  }, [turns, messagesById])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)
  const [measurementVersion, setMeasurementVersion] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [enteringTurnId, setEnteringTurnId] = useState<string | null>(null)
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(() => new Set())
  const lastMessageId = useRef<string | null>(null)
  const hasInitializedMessageList = useRef(false)
  const lastFocusedId = useRef<string | null>(null)
  const heights = useRef(new Map<string, number>())
  const turnNodes = useRef(new Map<string, HTMLDivElement>())
  const pendingAnchor = useRef<{ id: string; offset: number } | null>(null)
  const readingAnchor = useRef<{ id: string; offset: number } | null>(null)
  const firstTurnId = useRef(turns[0]?.id)
  const viewingOlder = useRef(!!hasNewerMessages)
  const scrollFrame = useRef<number | null>(null)
  const turnRefs = useRef(new Map<string, (node: HTMLDivElement | null) => void>())
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const conversationsById = useMemo(() => new Map(conversations.map(conversation => [conversation.id, conversation])), [conversations])
  const approvalsByRun = useMemo(() => {
    const result = new Map<string, Approval[]>()
    for (const approval of approvals) { const items = result.get(approval.runId); if (items) items.push(approval); else result.set(approval.runId, [approval]) }
    return result
  }, [approvals])
  // Escritas confirmadas ficam sob a resposta que as produziu (FileChange.messageId). Falhas, resultados
  // indeterminados e escritas sem mudança nunca aparecem como aplicados. O registro também precisa pertencer
  // ao run da mensagem; sem essa coerência nada é atribuído. Arrays estáveis evitam recalcular diffs ao rolar.
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
  // Só gruda no final se o usuário já estava lá; rolar pra ler o histórico não é interrompido por uma resposta chegando.
  const stickToBottom = useRef(true)
  const itemHeights = useMemo(() => {
    // A versão invalida o memo quando o ResizeObserver altera o mapa mantido em ref.
    void measurementVersion
    return turns.map(turn => heights.current.get(turn.id) || ESTIMATED_TURN_HEIGHT)
  }, [turns, measurementVersion])
  const offsets = useMemo(() => {
    const result = new Array<number>(itemHeights.length + 1)
    result[0] = 0
    for (let index = 0; index < itemHeights.length; index++) result[index + 1] = result[index] + itemHeights[index] + 24
    return result
  }, [itemHeights])
  const offsetsRef = useRef(offsets)
  offsetsRef.current = offsets
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  const firstVisible = useMemo(() => {
    let low = 0, high = turns.length
    while (low < high) { const mid = (low + high) >>> 1; if (offsets[mid + 1] < scrollTop) low = mid + 1; else high = mid }
    return low
  }, [turns.length, offsets, scrollTop])
  const startIndex = Math.max(0, firstVisible - Math.ceil(OVERSCAN_PX / ESTIMATED_TURN_HEIGHT))
  let endIndex = startIndex
  while (endIndex < turns.length && offsets[endIndex] < scrollTop + viewportHeight + OVERSCAN_PX) endIndex++
  const visibleTurns = turns.slice(startIndex, endIndex)
  const focusedTurnIndex = focusedMessageId ? turns.findIndex(turn => turn.messageIds.includes(focusedMessageId)) : -1
  const focusedTurnId = focusedTurnIndex >= 0 ? turns[focusedTurnIndex]?.id : undefined
  const setTurnNode = useCallback((id: string, node: HTMLDivElement | null) => {
    const previous = turnNodes.current.get(id)
    if (previous && resizeObserver.current) resizeObserver.current.unobserve(previous)
    if (!node) { turnNodes.current.delete(id); return }
    turnNodes.current.set(id, node)
    resizeObserver.current?.observe(node)
  }, [])
  const turnRef = (id: string) => {
    let callback = turnRefs.current.get(id)
    if (!callback) { callback = node => setTurnNode(id, node); turnRefs.current.set(id, callback) }
    return callback
  }
  useEffect(() => {
    if (!focusedTurnId) return
    setExpandedTurns(previous => previous.has(focusedTurnId) ? previous : new Set(previous).add(focusedTurnId))
  }, [focusedTurnId])
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const updateViewport = () => setViewportHeight(scrollRef.current?.clientHeight || 800)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver.current = new ResizeObserver(entries => {
        let changed = false
        let anchorCaptured = false
        for (const entry of entries) {
          if (entry.target === element) { updateViewport(); continue }
          const id = (entry.target as HTMLElement).dataset.turnId
          if (!id) continue
          const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height
          if (Math.abs((heights.current.get(id) || 0) - height) > 1) {
            if (!changed && !stickToBottom.current) {
              const currentOffsets = offsetsRef.current
              const currentTurns = turnsRef.current
              let index = 0
              while (index < currentTurns.length - 1 && currentOffsets[index + 1] < element.scrollTop) index++
              if (currentTurns[index]) pendingAnchor.current = { id: currentTurns[index].id, offset: element.scrollTop - currentOffsets[index] }
              anchorCaptured = true
            }
            heights.current.set(id, height); changed = true
          }
        }
        if (changed) { if (!anchorCaptured && !stickToBottom.current) pendingAnchor.current = readingAnchor.current; setMeasurementVersion(current => current + 1) }
      })
      resizeObserver.current.observe(element)
      for (const node of turnNodes.current.values()) resizeObserver.current.observe(node)
    }
    return () => { window.removeEventListener('resize', updateViewport); resizeObserver.current?.disconnect(); resizeObserver.current = null; if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current) }
  }, [])
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (viewingOlder.current && !hasNewerMessages) {
      stickToBottom.current = true
      pendingAnchor.current = null
      readingAnchor.current = null
    }
    viewingOlder.current = !!hasNewerMessages
    const ids = new Set(turns.map(turn => turn.id))
    for (const id of turnRefs.current.keys()) if (!ids.has(id)) { turnRefs.current.delete(id); heights.current.delete(id) }
    const firstChanged = firstTurnId.current !== turns[0]?.id
    firstTurnId.current = turns[0]?.id
    if (!focusedMessageId) lastFocusedId.current = null
    if (focusedMessageId && focusedMessageId !== lastFocusedId.current) {
      const index = focusedTurnIndex
      if (index >= 0) {
        stickToBottom.current = false
        lastFocusedId.current = focusedMessageId
        pendingAnchor.current = null
        element.scrollTop = offsets[index]
        setScrollTop(element.scrollTop)
        setHasNewMessages(false)
        return
      }
    }
    if (firstChanged && !stickToBottom.current && !pendingAnchor.current) pendingAnchor.current = readingAnchor.current
    if (pendingAnchor.current) {
      const anchor = pendingAnchor.current
      const index = turns.findIndex(turn => turn.id === anchor.id)
      if (index >= 0) { element.scrollTop = offsets[index] + anchor.offset; setScrollTop(element.scrollTop) }
      pendingAnchor.current = null
      return
    }
    const latestId = turns.at(-1)?.messageIds.at(-1) || null
    const latestTurnId = turns.at(-1)?.id || null
    if (hasInitializedMessageList.current && latestId && latestId !== lastMessageId.current && latestTurnId) setEnteringTurnId(latestTurnId)
    hasInitializedMessageList.current = true
    if (stickToBottom.current) { element.scrollTop = element.scrollHeight; setScrollTop(element.scrollTop); setHasNewMessages(false) }
    else if (lastMessageId.current && latestId !== lastMessageId.current) setHasNewMessages(true)
    lastMessageId.current = latestId
  }, [turns, offsets, fileChanges, approvals, focusedMessageId, focusedTurnIndex, hasNewerMessages])
  const loadOlder = async () => {
    const element = scrollRef.current
    if (!element || !onLoadOlder || loadingOlder || !hasOlderMessages) return
    stickToBottom.current = false
    const anchor = turns[firstVisible]
    if (anchor) pendingAnchor.current = { id: anchor.id, offset: element.scrollTop - offsets[firstVisible] }
    setLoadingOlder(true)
    try { await onLoadOlder() } catch (error) { onNotice(error instanceof Error ? error.message : 'Não foi possível carregar mensagens anteriores.'); pendingAnchor.current = null }
    finally { setLoadingOlder(false) }
  }
  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX
    if (stickToBottom.current) setHasNewMessages(false)
    if (scrollFrame.current !== null) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null
      const top = element.scrollTop
      let index = 0
      while (index < turns.length - 1 && offsets[index + 1] < top) index++
      if (turns[index]) readingAnchor.current = { id: turns[index].id, offset: top - offsets[index] }
      setScrollTop(top)
    })
  }
  const goToLatest = () => {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setHasNewMessages(false)
  }
  const navigateToTurn = useTurnNavigation({ turns, offsets, visibleTurns, scrollTop, scrollRef, turnNodes, setScrollTop, setHasNewMessages, stickToBottom })
  return <div ref={scrollRef} onScroll={onScroll} style={{ overflowAnchor: 'none' }} className={css.scroll}>
    {hasNewerMessages && <div className={css.newer}><Button type="button" variant="outline" size={null} onClick={onReturnToLatest}>Voltar às mensagens recentes</Button></div>}
    {turns.length > 1 && <TurnNavigator count={turns.length} activeIndex={firstVisible} onNavigate={navigateToTurn} />}
    <div className={css.column}>
    {hasOlderMessages && <div className={css.older}><Button type="button" variant="outline" size={null} disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}</Button></div>}
    {hasNewMessages && <div className={css.toBottomSlot}><Button type="button" variant="ghost" size="icon" className={css.toBottom} onClick={goToLatest} aria-label="Ir para as mensagens mais recentes" title="Ir para as mensagens mais recentes"><ArrowDown aria-hidden="true" /></Button></div>}
      {startIndex > 0 && <div aria-hidden="true" style={{ height: offsets[startIndex] }} />}
    {visibleTurns.map(turn => {
      const expanded = expandedTurns.has(turn.id)
      const foldable = turnFoldable(turn)
      const header = turnHeaderText(turn)
      const latestReply = finalReply(turn)
      const showLatestActions = !!latestReply && endsWithReply(turn) && turn.id === turns.at(-1)?.id
      const turnItems = messagesInTurn(turn)
      const appliedExtra = (message: Message) => appliedByMessage.get(message.id) && <CompletedFileReview changes={appliedByMessage.get(message.id)!} label={INLINE_REVIEW_LABEL} />
      const approvalExtra = (message: Message) => message.runId && lastMessageByRun.get(message.runId) === message.id && (approvalsByRun.get(message.runId) || []).map(approval => <PolitronToolApproval key={approval.id} approval={approval} onNotice={onNotice} />)
      const extras = (message: Message) => <>{appliedExtra(message)}{approvalExtra(message)}</>
      return <section key={turn.id} ref={turnRef(turn.id)} data-turn-id={turn.id} className={`${css.turn}${enteringTurnId === turn.id ? ' chat-message-enter' : ''}`} onAnimationEnd={event => { if (event.target === event.currentTarget && enteringTurnId === turn.id) setEnteringTurnId(null) }}>
        {turn.user && <RuntimeMessage message={turn.user} data-part="user" className={focusedMessageId === turn.user.id ? css.focused : undefined}>
          <MessageItem message={turn.user} agent={agentOf(turn.user.agentId)} relatedConversation={undefined} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} canSpeak={false} canCancelQueued={canCancelQueued} presentation="dsh" alwaysShowActions={turn.id === turns.at(-1)?.id} />
          {extras(turn.user)}
        </RuntimeMessage>}
        {header && <div data-part="header">{foldable
          ? <button type="button" className={css.header} aria-expanded={expanded} onClick={() => setExpandedTurns(previous => { const next = new Set(previous); if (next.has(turn.id)) next.delete(turn.id); else next.add(turn.id); return next })}>
            <span className={css.headerLabel}>{header}</span><ChevronDown className={css.headerChevron} aria-hidden="true" />
          </button>
          : <div className={css.header} aria-live="polite"><span className={css.headerLabel}>{header}</span></div>}
        </div>}
        {turn.items.map((item: TurnItem) => {
          if (!expanded && foldable && foldsAway(item)) return null
          if (item.kind === 'reply') {
            const message = item.message
            return <RuntimeMessage key={item.id} message={message} data-part="reply" className={focusedMessageId === message.id ? css.focused : undefined}>
              <MessageItem message={message} agent={agentOf(message.agentId)} relatedConversation={undefined} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} presentation="dsh" showAgent={item.boo} alwaysShowActions={showLatestActions && latestReply?.id === message.id} />
              {extras(message)}
            </RuntimeMessage>
          }
          if (item.kind === 'tools') {
            const active = turn.status === 'running'
            return <div key={item.id} data-part="process">
              <DshToolGroup messages={item.messages} turnActive={active} agent={agentOf(item.messages[0]?.agentId ?? null)} autoOpen={!!focusedMessageId && item.messages.some(message => message.id === focusedMessageId)}>
                {item.messages.map(message => <RuntimeMessage key={message.id} message={message} toolActive={active} className={focusedMessageId === message.id ? css.focused : undefined}>
                  <ActivityParts />
                  {appliedExtra(message)}
                </RuntimeMessage>)}
              </DshToolGroup>
              {item.messages.map(message => <div key={`approval:${message.id}`} data-part="extra">{approvalExtra(message)}</div>)}
            </div>
          }
          if (item.kind === 'reasoning') {
            const message = item.message
            return <RuntimeMessage key={item.id} message={message} data-part="process" className={focusedMessageId === message.id ? css.focused : undefined}>
              <ReasoningDisclosure message={message} autoOpen={focusedMessageId === message.id} />{extras(message)}
            </RuntimeMessage>
          }
          if (item.kind === 'delegations') {
            return <div key={item.id} data-part="extra" data-message-id={item.messages[0]?.id}>
              <DelegationCard delegations={item.messages} agentOf={agentOf} conversationsById={conversationsById} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} />
            </div>
          }
          const message = item.message
          const relatedConversation = message.relatedConversationId ? conversationsById.get(message.relatedConversationId) : undefined
          return <RuntimeMessage key={item.id} message={message} data-part="extra" className={css.note}>
            <span>{message.text}</span>
            {relatedConversation && <Button type="button" variant="link" size={null} onClick={() => onOpenRelatedConversation(relatedConversation.id)} className={css.noteLink}>Abrir conversa relacionada: {relatedConversation.name}</Button>}
            {message.delegationId && ['queued', 'running', 'waiting'].includes(message.status) && <Button type="button" variant="link" size={null} onClick={() => void window.appAPI.cancelDelegation(message.delegationId!).catch(error => onNotice(error instanceof Error ? error.message : 'Não foi possível cancelar a delegação.'))} className={css.noteLink} data-tone="danger">Cancelar pedido</Button>}
            {extras(message)}
          </RuntimeMessage>
        })}
        {(turn.status === 'running' || turn.status === 'waiting') && <RunningTurnStatus turn={turn} />}
      </section>
    })}
      {endIndex < turns.length && <div aria-hidden="true" style={{ height: Math.max(0, offsets[turns.length] - offsets[endIndex]) }} />}
      {!turns.length && <div className={css.empty} data-testid="chat-empty-state">
        <h2 className={css.emptyTitle}>Como posso ajudar?</h2>
        <div className={css.emptyWorkspace} data-testid="chat-empty-workspace">
          <FolderOpen aria-hidden="true" size={15} strokeWidth={1.7} />
          <span>{workspaceName || 'Sem projeto'}</span>
          {workspaceName && <ChevronDown aria-hidden="true" size={14} strokeWidth={1.7} />}
        </div>
      </div>}
    </div>
  </div>
}
