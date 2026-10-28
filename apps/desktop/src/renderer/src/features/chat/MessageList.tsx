import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Message } from '../../../../shared/v9'
import type { Approval, FileChange } from '../../../../shared/v9'
import { MessageItem } from './MessageItem'
import { ActivitySummary } from './ActivitySummary'
import { DelegationCard } from './DelegationCard'
import { chatRows } from './chat-rows'
import { PolitronToolApproval } from './PolitronToolApproval'
import { CompletedFileReview } from '../diff/CompletedFileReview'

const INLINE_REVIEW_LABEL = 'Arquivos modificados nesta resposta'

/** Distância do fim ainda considerada "no final", para decidir se um novo evento deve puxar o scroll junto. */
const STICK_TO_BOTTOM_PX = 96

const ESTIMATED_MESSAGE_HEIGHT = 180
const OVERSCAN_PX = 900

export function MessageList({ messages: sourceMessages, fileChanges, reviewRunId = null, approvals, conversations, agentOf, selectedAgents, onOpenRelatedConversation, onNotice, hasOlderMessages, onLoadOlder, focusedMessageId, hasNewerMessages, onReturnToLatest, canSpeak = true, canApprove = true, canCancelQueued = false }: {
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
  canSpeak?: boolean
  canApprove?: boolean
  canCancelQueued?: boolean
}) {
  const messages = useMemo(() => chatRows(sourceMessages), [sourceMessages])
  // Por run: se ainda trabalha, duração aproximada (primeira a última mensagem), última linha (recebe as aprovações) e se tem atividade.
  const runInfo = useMemo(() => {
    const result = new Map<string, { active: boolean; start: number; end: number; lastRowId: string; hasActivity: boolean }>()
    for (const message of messages) {
      if (!message.runId) continue
      const time = Date.parse(message.createdAt)
      const info = result.get(message.runId) || { active: false, start: time, end: time, lastRowId: message.id, hasActivity: false }
      const last = message.activities?.at(-1) || message
      info.active ||= message.role === 'assistant' && ['queued', 'running', 'waiting'].includes(message.status)
      info.start = Math.min(info.start, time); info.end = Math.max(info.end, Date.parse(last.createdAt))
      info.lastRowId = message.id; info.hasActivity ||= !!message.activities
      result.set(message.runId, info)
    }
    return result
  }, [messages])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)
  const [measurementVersion, setMeasurementVersion] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [enteringMessageId, setEnteringMessageId] = useState<string | null>(null)
  const lastMessageId = useRef<string | null>(null)
  const hasInitializedMessageList = useRef(false)
  const lastFocusedId = useRef<string | null>(null)
  const heights = useRef(new Map<string, number>())
  const messageNodes = useRef(new Map<string, HTMLDivElement>())
  const pendingAnchor = useRef<{ id: string; offset: number } | null>(null)
  const readingAnchor = useRef<{ id: string; offset: number } | null>(null)
  const firstMessageId = useRef(messages[0]?.id)
  const viewingOlder = useRef(!!hasNewerMessages)
  const scrollFrame = useRef<number | null>(null)
  const messageRefs = useRef(new Map<string, (node: HTMLDivElement | null) => void>())
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
  const messageRuns = useMemo(() => messages.map(message => `${message.id}\u0000${message.runId || ''}`).join('\u0001'), [messages])
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
  const itemHeights = useMemo(() => messages.map(message => heights.current.get(message.id) || ESTIMATED_MESSAGE_HEIGHT), [messages, measurementVersion])
  const offsets = useMemo(() => {
    const result = new Array<number>(itemHeights.length + 1)
    result[0] = 0
    for (let index = 0; index < itemHeights.length; index++) result[index + 1] = result[index] + itemHeights[index] + 24
    return result
  }, [itemHeights])
  const offsetsRef = useRef(offsets)
  offsetsRef.current = offsets
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const firstVisible = useMemo(() => {
    let low = 0, high = messages.length
    while (low < high) { const mid = (low + high) >>> 1; if (offsets[mid + 1] < scrollTop) low = mid + 1; else high = mid }
    return low
  }, [messages.length, offsets, scrollTop])
  const startIndex = Math.max(0, firstVisible - Math.ceil(OVERSCAN_PX / ESTIMATED_MESSAGE_HEIGHT))
  let endIndex = startIndex
  while (endIndex < messages.length && offsets[endIndex] < scrollTop + viewportHeight + OVERSCAN_PX) endIndex++
  const visibleMessages = messages.slice(startIndex, endIndex)
  const setMessageNode = useCallback((id: string, node: HTMLDivElement | null) => {
    const previous = messageNodes.current.get(id)
    if (previous && resizeObserver.current) resizeObserver.current.unobserve(previous)
    if (!node) { messageNodes.current.delete(id); return }
    messageNodes.current.set(id, node)
    resizeObserver.current?.observe(node)
  }, [])
  const messageRef = (id: string) => {
    let callback = messageRefs.current.get(id)
    if (!callback) { callback = node => setMessageNode(id, node); messageRefs.current.set(id, callback) }
    return callback
  }
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
          const id = (entry.target as HTMLElement).dataset.messageId
          if (!id) continue
          const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height
          if (Math.abs((heights.current.get(id) || 0) - height) > 1) {
            if (!changed && !stickToBottom.current) {
              const currentOffsets = offsetsRef.current
              const currentMessages = messagesRef.current
              let index = 0
              while (index < currentMessages.length - 1 && currentOffsets[index + 1] < element.scrollTop) index++
              if (currentMessages[index]) pendingAnchor.current = { id: currentMessages[index].id, offset: element.scrollTop - currentOffsets[index] }
              anchorCaptured = true
            }
            heights.current.set(id, height); changed = true
          }
        }
        if (changed) { if (!anchorCaptured && !stickToBottom.current) pendingAnchor.current = readingAnchor.current; setMeasurementVersion(current => current + 1) }
      })
      resizeObserver.current.observe(element)
      for (const node of messageNodes.current.values()) resizeObserver.current.observe(node)
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
    const ids = new Set(messages.map(message => message.id))
    for (const id of messageRefs.current.keys()) if (!ids.has(id)) { messageRefs.current.delete(id); heights.current.delete(id) }
    const firstChanged = firstMessageId.current !== messages[0]?.id
    firstMessageId.current = messages[0]?.id
    if (!focusedMessageId) lastFocusedId.current = null
    if (focusedMessageId && focusedMessageId !== lastFocusedId.current) {
      const index = messages.findIndex(message => message.id === focusedMessageId)
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
      const index = messages.findIndex(message => message.id === anchor.id)
      if (index >= 0) { element.scrollTop = offsets[index] + anchor.offset; setScrollTop(element.scrollTop) }
      pendingAnchor.current = null
      return
    }
    const latestId = messages[messages.length - 1]?.id || null
    if (hasInitializedMessageList.current && latestId && latestId !== lastMessageId.current) setEnteringMessageId(latestId)
    hasInitializedMessageList.current = true
    if (stickToBottom.current) { element.scrollTop = element.scrollHeight; setScrollTop(element.scrollTop); setHasNewMessages(false) }
    else if (lastMessageId.current && latestId !== lastMessageId.current) setHasNewMessages(true)
    lastMessageId.current = latestId
  }, [messages, offsets, fileChanges, approvals, focusedMessageId, hasNewerMessages])
  const loadOlder = async () => {
    const element = scrollRef.current
    if (!element || !onLoadOlder || loadingOlder || !hasOlderMessages) return
    stickToBottom.current = false
    const anchor = messages[firstVisible]
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
      while (index < messages.length - 1 && offsets[index + 1] < top) index++
      if (messages[index]) readingAnchor.current = { id: messages[index].id, offset: top - offsets[index] }
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
  return <div ref={scrollRef} onScroll={onScroll} style={{ overflowAnchor: 'none' }} className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-8">
    {hasNewerMessages && <div className="sticky top-0 z-10 mx-auto mb-3 flex justify-center"><Button type="button" variant="outline" size={null} onClick={onReturnToLatest} className="h-auto rounded-full border-primary/30 bg-background/95 px-3 py-1.5 text-xs font-medium text-primary shadow-sm hover:border-primary/30 hover:bg-background/95">Voltar às mensagens recentes</Button></div>}
    {hasOlderMessages && <div className="mx-auto mb-5 max-w-3xl text-center"><Button type="button" variant="outline" size={null} disabled={loadingOlder} onClick={() => void loadOlder()} className="h-auto rounded-md border-border/70 bg-card/60 px-3 py-1.5 text-xs font-normal text-muted-foreground shadow-none transition-colors hover:border-border/70 hover:bg-accent disabled:opacity-50">{loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}</Button></div>}
    {hasNewMessages && <div className="sticky bottom-2 z-10 mx-auto -mb-9 flex justify-center"><Button type="button" variant="outline" size={null} onClick={goToLatest} className="h-auto rounded-full border-primary/30 bg-background/95 px-3 py-1.5 text-xs font-medium text-primary shadow-md hover:border-primary/30 hover:bg-background/95">Novas mensagens · Ir para o fim</Button></div>}
    <div className="mx-auto flex max-w-3xl flex-col gap-0">
      {startIndex > 0 && <div aria-hidden="true" style={{ height: offsets[startIndex] }} />}
      {visibleMessages.map(message => {
        const agent = agentOf(message.agentId)
        const relatedConversation = message.relatedConversationId ? conversationsById.get(message.relatedConversationId) : undefined
        const run = message.runId ? runInfo.get(message.runId) : undefined
        // Aprovações do run aparecem uma vez, sob a última linha dele.
        const runApprovals = message.runId && run?.lastRowId === message.id ? approvalsByRun.get(message.runId) || [] : []
        const appliedChanges = appliedByMessage.get(message.id)
        // A revisão fica dentro do wrapper medido pelo ResizeObserver: expandir o diff atualiza a virtualização.
        return <div key={message.id} ref={messageRef(message.id)} data-message-id={message.id} className={`mb-6 space-y-2${enteringMessageId === message.id ? ' chat-message-enter' : ''}`} onAnimationEnd={event => { if (event.target === event.currentTarget && enteringMessageId === message.id) setEnteringMessageId(null) }}>
          {message.delegations
            ? <DelegationCard delegations={message.delegations} agentOf={agentOf} conversationsById={conversationsById} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} />
            : message.activities
            ? <ActivitySummary activities={message.activities} running={!!run?.active} durationMs={run && Number.isFinite(run.end - run.start) ? run.end - run.start : undefined} />
            : <MessageItem message={message} agent={agent} relatedConversation={relatedConversation} onOpenRelatedConversation={onOpenRelatedConversation} onNotice={onNotice} canSpeak={canSpeak} canCancelQueued={canCancelQueued} quietProgress={!!run?.hasActivity} />}
          {appliedChanges && <CompletedFileReview changes={appliedChanges} label={INLINE_REVIEW_LABEL} />}
          {runApprovals.map(approval => <PolitronToolApproval key={approval.id} approval={approval} onNotice={onNotice} canApprove={canApprove} />)}

        </div>
      })}
      {endIndex < messages.length && <div aria-hidden="true" style={{ height: Math.max(0, offsets[messages.length] - offsets[endIndex]) }} />}
      {!messages.length && <div className="mx-auto mt-[18vh] max-w-xl text-center"><h2 className="text-lg font-medium text-muted-foreground">Como posso ajudar?</h2></div>}
    </div>
  </div>
}
