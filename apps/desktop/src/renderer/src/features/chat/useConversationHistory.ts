import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, MessagePage, MessageSearchHit } from '../../../../shared/v9'

export const MAX_CHAT_MESSAGES = 600
export const STREAM_BATCH_MS = 16

/** Mantém a ordem do banco e reutiliza os objetos das mensagens que não mudaram. */
export function mergeChatMessages(current: Message[], updates: Message[], allowAppend = true): Message[] {
  const positions = new Map(current.map((message, index) => [message.id, index]))
  let next = current
  for (const message of updates) {
    const index = positions.get(message.id)
    if (index !== undefined) {
      if (next[index] === message) continue
      if (next === current) next = [...current]
      next[index] = message
    } else if (allowAppend) {
      if (next === current) next = [...current]
      positions.set(message.id, next.length); next.push(message)
    }
  }
  return next
}

interface HistoryState {
  messages: Message[]
  hasMore: boolean
  hasNewer: boolean
  focusedId: string | null
}
const emptyHistory = (): HistoryState => ({ messages: [], hasMore: false, hasNewer: false, focusedId: null })

export function useConversationHistory(conversationId: string | undefined, onError: (message: string) => void) {
  const [history, setHistory] = useState<HistoryState>(emptyHistory)
  const historyRef = useRef(history)
  historyRef.current = history
  const activeId = useRef(conversationId)
  activeId.current = conversationId
  const pending = useRef(new Map<string, Message>())
  const firstStreamedText = useRef(new Set<string>())
  const requestUpdates = useRef<Map<string, Message> | null>(null)
  const generation = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reportError = useRef(onError)
  reportError.current = onError

  const flush = useCallback(() => {
    timer.current = null
    const updates = [...pending.current.values()].filter(message => message.conversationId === activeId.current)
    pending.current.clear()
    if (!updates.length) return
    setHistory(current => {
      const merged = mergeChatMessages(current.messages, updates, !current.hasNewer)
      if (merged === current.messages) return current
      return { ...current, messages: merged.length > MAX_CHAT_MESSAGES ? merged.slice(-MAX_CHAT_MESSAGES) : merged, hasMore: current.hasMore || merged.length > MAX_CHAT_MESSAGES }
    })
  }, [])
  const queueMessage = useCallback((message: Message) => {
    if (message.conversationId !== activeId.current) return
    pending.current.set(message.id, message)
    requestUpdates.current?.set(message.id, message)
    if (message.role === 'assistant' && message.status === 'running' && message.text.length > 0 && !firstStreamedText.current.has(message.id)) {
      // Surface first visible output immediately, rather than letting the loading state linger.
      firstStreamedText.current.add(message.id)
      if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
      flush()
      return
    }
    if (timer.current === null) timer.current = setTimeout(flush, STREAM_BATCH_MS)
  }, [flush])

  const returnToLatest = useCallback(async () => {
    const id = activeId.current
    if (!id) return
    const request = ++generation.current
    const updates = new Map<string, Message>()
    requestUpdates.current = updates
    try {
      const page = await window.appAPI.historyPage(id, null, 100)
      if (request !== generation.current || id !== activeId.current) return
      const messages = mergeChatMessages(page.messages, [...updates.values()])
      setHistory({ messages: messages.slice(-MAX_CHAT_MESSAGES), hasMore: page.hasMore || messages.length > MAX_CHAT_MESSAGES, hasNewer: false, focusedId: null })
    } finally { if (request === generation.current) requestUpdates.current = null }
  }, [])

  const reconcileAfterReconnect = useCallback(async () => {
    const id = activeId.current
    if (!id) return
    const request = ++generation.current
    const before = historyRef.current
    const updates = new Map<string, Message>()
    requestUpdates.current = updates
    try {
      if (before.hasNewer) {
        // Keep search/older reading position. Refresh only IDs in the visible window.
        const latest = await window.appAPI.historyPage(id, null, 100)
        if (request !== generation.current || id !== activeId.current) return
        const visible = new Set(before.messages.map(message => message.id))
        const changedVisible = latest.messages.filter(message => visible.has(message.id))
        const liveVisible = [...updates.values()].filter(message => visible.has(message.id))
        const merged = mergeChatMessages(before.messages, [...changedVisible, ...liveVisible], false)
        const hasNewer = before.hasNewer || latest.messages.some(message => !visible.has(message.id)) || [...updates.values()].some(message => !visible.has(message.id))
        setHistory({ ...before, messages: merged, hasNewer })
        return
      }

      const known = new Set(before.messages.map(message => message.id))
      const pages: Message[][] = []
      let cursor: string | null = null
      let overlap = false
      let hasMore = false
      let fetched = 0
      do {
        const page = await window.appAPI.historyPage(id, cursor, Math.min(100, MAX_CHAT_MESSAGES - fetched))
        if (request !== generation.current || id !== activeId.current) return
        if (!page.messages.length) { hasMore = page.hasMore; break }
        pages.unshift(page.messages)
        fetched += page.messages.length
        overlap = page.messages.some(message => known.has(message.id))
        hasMore = page.hasMore
        cursor = page.messages[0].id
      } while (!overlap && hasMore && fetched < MAX_CHAT_MESSAGES)

      const recovered = pages.flat()
      const firstOverlap = recovered.findIndex(message => known.has(message.id))
      // Keep the contiguous older prefix only when the fetched range reaches it.
      // Disjoint fragments must never be concatenated as if no messages were missing.
      const prefix = firstOverlap >= 0
        ? before.messages.slice(0, before.messages.findIndex(message => message.id === recovered[firstOverlap].id))
        : []
      const merged = mergeChatMessages([...prefix, ...recovered], [...updates.values()])
      if (request !== generation.current || id !== activeId.current) return
      setHistory({ messages: merged.slice(-MAX_CHAT_MESSAGES), hasMore: hasMore || merged.length > MAX_CHAT_MESSAGES, hasNewer: false, focusedId: before.focusedId })
    } finally { if (request === generation.current) requestUpdates.current = null }
  }, [])

  useEffect(() => {
    setHistory(emptyHistory())
    pending.current.clear()
    firstStreamedText.current.clear()
    if (conversationId) void returnToLatest().catch(error => reportError.current(error instanceof Error ? error.message : 'Não foi possível carregar a conversa.'))
    return () => {
      generation.current++
      requestUpdates.current = null
      pending.current.clear()
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [conversationId, returnToLatest])

  const loadOlder = useCallback(async () => {
    const id = activeId.current
    const firstMessageId = history.messages[0]?.id
    if (!id || !firstMessageId || !history.hasMore) return
    const request = generation.current
    // O ID também funciona após descartar páginas antigas da memória.
    const page = await window.appAPI.historyPage(id, firstMessageId, 100)
    if (request !== generation.current || id !== activeId.current) return
    setHistory(current => {
      const merged = mergeChatMessages(page.messages, current.messages)
      return { ...current, messages: merged.slice(0, MAX_CHAT_MESSAGES), hasMore: page.hasMore, hasNewer: current.hasNewer || merged.length > MAX_CHAT_MESSAGES }
    })
  }, [history.messages, history.hasMore])

  const openSearchHit = useCallback(async (hit: MessageSearchHit) => {
    const id = activeId.current
    if (!id) return
    const request = ++generation.current
    const updates = new Map<string, Message>()
    requestUpdates.current = updates
    try {
      const page: MessagePage = await window.appAPI.historyAround(id, hit.cursor, 100)
      if (request !== generation.current || id !== activeId.current) return
      setHistory({ messages: mergeChatMessages(page.messages, [...updates.values()], false), hasMore: page.hasMore, hasNewer: true, focusedId: hit.message.id })
    } finally { if (request === generation.current) requestUpdates.current = null }
  }, [])
  const search = useCallback(async (query: string) => activeId.current ? window.appAPI.searchHistory(activeId.current, query, 25) : [], [])
  return { messages: history.messages, hasOlderMessages: history.hasMore, hasNewerMessages: history.hasNewer, focusedMessageId: history.focusedId, queueMessage, loadOlder, search, openSearchHit, returnToLatest, reconcileAfterReconnect }
}
