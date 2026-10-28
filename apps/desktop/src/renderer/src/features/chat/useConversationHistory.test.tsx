import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { MAX_CHAT_MESSAGES, STREAM_BATCH_MS, mergeChatMessages, useConversationHistory } from './useConversationHistory'

const makeMessage = (index: number, conversationId = 'chat-a'): Message => ({
  id: `m${index}`, conversationId, agentId: 'agent', author: 'Agente', role: 'assistant',
  text: `Resposta ${index}`, status: 'completed', runId: null, createdAt: String(index),
})
let records: Message[]
const historyPage = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  records = Array.from({ length: 5000 }, (_, index) => makeMessage(index))
  historyPage.mockReset().mockImplementation(async (id: string, before?: string | number | null, limit = 100) => {
    const end = typeof before === 'string' ? records.findIndex(message => message.id === before) : records.length
    const start = Math.max(0, end - limit)
    return { messages: records.slice(start, end).map(message => ({ ...message, conversationId: id })), hasMore: start > 0, beforeCursor: start }
  })
  vi.stubGlobal('appAPI', { historyPage, searchHistory: vi.fn(), historyAround: vi.fn() })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('histórico com memória limitada e respostas em streaming', () => {
  it('exibe o primeiro trecho real imediatamente, sem esperar o indicador de trabalho', async () => {
    const { result } = renderHook(() => useConversationHistory('chat-a', vi.fn()))
    await act(async () => {})
    const running = { ...makeMessage(5001), text: 'Primeira palavra', status: 'running' as const }
    act(() => result.current.queueMessage(running))
    expect(result.current.messages.at(-1)).toMatchObject({ id: 'm5001', text: 'Primeira palavra', status: 'running' })
    act(() => result.current.queueMessage({ ...running, text: 'Primeira palavra e a continuação' }))
    expect(result.current.messages.at(-1)?.text).toBe('Primeira palavra')
    act(() => { vi.advanceTimersByTime(STREAM_BATCH_MS) })
    expect(result.current.messages.at(-1)?.text).toBe('Primeira palavra e a continuação')
  })

  it('agrupa 5.000 trechos em uma atualização e ignora outra conversa', async () => {
    let renders = 0
    const { result } = renderHook(() => { renders++; return useConversationHistory('chat-a', vi.fn()) })
    await act(async () => {})
    const before = renders
    act(() => {
      for (let index = 0; index < 5000; index++) result.current.queueMessage({ ...makeMessage(5000), text: `Trecho ${index}` })
      result.current.queueMessage(makeMessage(6000, 'chat-b'))
    })
    expect(renders).toBe(before)
    act(() => { vi.advanceTimersByTime(STREAM_BATCH_MS) })
    expect(renders).toBe(before + 1)
    expect(result.current.messages[result.current.messages.length - 1]?.text).toBe('Trecho 4999')
    expect(result.current.messages.every(message => message.conversationId === 'chat-a')).toBe(true)
  })

  it('percorre 5.000 mensagens sem acumular mais que o limite e volta ao presente', async () => {
    const { result } = renderHook(() => useConversationHistory('chat-a', vi.fn()))
    await act(async () => {})
    for (let page = 0; page < 49; page++) {
      await act(async () => { await result.current.loadOlder() })
      expect(result.current.messages.length).toBeLessThanOrEqual(MAX_CHAT_MESSAGES)
    }
    expect(result.current.messages[0].id).toBe('m0')
    expect(result.current.hasOlderMessages).toBe(false)
    expect(result.current.hasNewerMessages).toBe(true)
    records.push(makeMessage(5000))
    act(() => { result.current.queueMessage(records[records.length - 1]); vi.advanceTimersByTime(STREAM_BATCH_MS) })
    expect(result.current.messages[result.current.messages.length - 1]?.id).toBe('m599')
    await act(async () => { await result.current.returnToLatest() })
    expect(result.current.messages[result.current.messages.length - 1]?.id).toBe('m5000')
    expect(result.current.hasNewerMessages).toBe(false)
    expect(result.current.hasOlderMessages).toBe(true)
  })

  it('mantém a paginação correta depois de descartar mensagens antigas durante uso contínuo', async () => {
    const { result } = renderHook(() => useConversationHistory('chat-a', vi.fn()))
    await act(async () => {})
    const incoming = Array.from({ length: 700 }, (_, index) => makeMessage(5000 + index))
    records.push(...incoming)
    act(() => { incoming.forEach(result.current.queueMessage); vi.advanceTimersByTime(STREAM_BATCH_MS) })
    expect(result.current.messages).toHaveLength(MAX_CHAT_MESSAGES)
    expect(result.current.messages[0].id).toBe('m5100')
    await act(async () => { await result.current.loadOlder() })
    expect(historyPage).toHaveBeenLastCalledWith('chat-a', 'm5100', 100)
    expect(result.current.messages[0].id).toBe('m5000')
    expect(result.current.messages[result.current.messages.length - 1]?.id).toBe('m5599')
  })

  it('não aplica uma página atrasada após trocar de conversa', async () => {
    let resolveOld!: (value: unknown) => void
    historyPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const { result, rerender } = renderHook(({ id }) => useConversationHistory(id, vi.fn()), { initialProps: { id: 'chat-a' } })
    rerender({ id: 'chat-b' })
    await act(async () => {})
    await act(async () => { resolveOld({ messages: [makeMessage(0)], hasMore: false, beforeCursor: 0 }) })
    expect(result.current.messages.every(message => message.conversationId === 'chat-b')).toBe(true)
    expect(result.current.messages).toHaveLength(100)
  })

  it('recupera páginas até sobrepor o histórico local e incorpora evento ao vivo durante a leitura', async () => {
    const { result } = renderHook(() => useConversationHistory('chat-a', vi.fn()))
    await act(async () => {})
    const offline = Array.from({ length: 250 }, (_, index) => ({ ...makeMessage(5000 + index), text: `Offline ${index}` }))
    records.push(...offline)
    await act(async () => { await result.current.reconcileAfterReconnect() })
    expect(result.current.messages.at(-1)).toMatchObject({ id: 'm5249', text: 'Offline 249' })
    expect(result.current.messages.find(message => message.id === 'm5000')?.text).toBe('Offline 0')
    expect(historyPage).toHaveBeenCalledTimes(4)

    let resolvePage!: (value: { messages: Message[]; hasMore: boolean; beforeCursor: number }) => void
    historyPage.mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve }))
    const liveUpdate = { ...offline[249], text: 'Atualizada pelo evento ao vivo' }
    // Exercise a live update while the history request is unresolved.
    await act(async () => {
      const reconciliation = result.current.reconcileAfterReconnect()
      result.current.queueMessage(liveUpdate)
      resolvePage({ messages: offline.slice(-100), hasMore: true, beforeCursor: 0 })
      await reconciliation
    })
    expect(result.current.messages.find(message => message.id === 'm5249')?.text).toBe('Atualizada pelo evento ao vivo')
  })

  it('preserva janela e foco ao reconciliar uma busca e ignora reconciliação de conversa anterior', async () => {
    const around = vi.fn().mockResolvedValue({ messages: records.slice(100, 200), hasMore: true, beforeCursor: 100 })
    vi.stubGlobal('appAPI', { historyPage, searchHistory: vi.fn(), historyAround: around })
    const { result, rerender } = renderHook(({ id }) => useConversationHistory(id, vi.fn()), { initialProps: { id: 'chat-a' } })
    await act(async () => { await result.current.openSearchHit({ cursor: 150, message: makeMessage(150) } as never) })
    const visibleIds = result.current.messages.map(message => message.id)
    expect(result.current.focusedMessageId).toBe('m150')
    await act(async () => { await result.current.reconcileAfterReconnect() })
    expect(result.current.messages.map(message => message.id)).toEqual(visibleIds)
    expect(result.current.focusedMessageId).toBe('m150')

    let resolveOld!: (value: { messages: Message[]; hasMore: boolean; beforeCursor: number }) => void
    historyPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    let reconciliation!: Promise<void>
    act(() => { reconciliation = result.current.reconcileAfterReconnect() })
    rerender({ id: 'chat-b' })
    await act(async () => { resolveOld({ messages: [makeMessage(5000, 'chat-a')], hasMore: false, beforeCursor: 0 }); await reconciliation })
    expect(result.current.messages.every(message => message.conversationId === 'chat-b')).toBe(true)
  })

  it('limita a reconciliação desconectada a 600 mensagens sem concatenar janelas sem sobreposição', async () => {
    const { result } = renderHook(() => useConversationHistory('chat-a', vi.fn()))
    await act(async () => {})
    records.push(...Array.from({ length: 800 }, (_, index) => makeMessage(5000 + index)))
    await act(async () => { await result.current.reconcileAfterReconnect() })
    expect(result.current.messages).toHaveLength(MAX_CHAT_MESSAGES)
    expect(result.current.messages[0].id).toBe('m5200')
    expect(result.current.messages.at(-1)?.id).toBe('m5799')
    expect(result.current.hasOlderMessages).toBe(true)
  })
})

it('mensagem que sai da fila vai para o fim, como o host a reinseriu', () => {
  const queued = { ...makeMessage(1), role: 'user' as const, status: 'queued' as const }
  const merged = mergeChatMessages([makeMessage(0), queued, makeMessage(2)], [{ ...queued, status: 'completed' }])
  expect(merged.map(message => message.id)).toEqual(['m0', 'm2', 'm1'])
  expect(mergeChatMessages(merged, [{ ...makeMessage(3) }]).map(message => message.id)).toEqual(['m0', 'm2', 'm1', 'm3'])
})
