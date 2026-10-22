import { describe, expect, it } from 'vitest'
import { buildTurnContext, messageDigest } from './conversation-context'
import type { Message } from '../../shared/v9'

const message = (id: string, fields: Partial<Message> = {}): Message => ({
  id, conversationId: 'conversation-1', agentId: null, author: 'Usuário', role: 'user', text: id,
  status: 'completed', runId: null, createdAt: `2026-10-20T00:00:${id.length.toString().padStart(2, '0')}Z`, ...fields,
})
const session = (history: 'retained' | 'empty' | 'resume-pending') => ({ id: 'thread-1', history })

describe('buildTurnContext', () => {
  it('sends only the current request on a retained native session without external updates', () => {
    const prior = message('prior')
    const current = message('current', { role: 'user' })
    const result = buildTurnContext({
      history: [prior, current], currentInput: 'Responda somente isso.', inputMessageId: current.id,
      responseMessageId: 'placeholder', agentId: 'agent-1', session: session('retained'), deliveredDigests: { [prior.id]: messageDigest(prior) },
    })
    expect(result.text).toBe('Responda somente isso.')
    expect(result.text).not.toContain('prior')
    expect(result.deliveredDigests[current.id]).toBe(messageDigest({ ...current, text: 'Responda somente isso.' }))
  })

  it('replays checkpoint and the latest bounded history into an empty session, excluding current input and placeholder', () => {
    const earlier = message('earlier')
    const current = message('current')
    const placeholder = message('placeholder', { role: 'assistant', agentId: 'agent-1', status: 'queued', text: '' })
    const result = buildTurnContext({
      history: [earlier, current, placeholder], currentInput: 'Novo pedido.', inputMessageId: current.id,
      responseMessageId: placeholder.id, agentId: 'agent-1', session: session('empty'), deliveredDigests: {},
      checkpoint: { id: 'checkpoint', conversationId: 'conversation-1', agentId: 'agent-1', runId: 'run-old', summary: 'Objetivo ativo', decisions: ['Usar TypeScript'], pending: ['Revisar diff'], createdAt: '2026-10-19T00:00:00Z' },
    })
    expect(result.text).toContain('Objetivo ativo')
    expect(result.text).toContain('earlier')
    expect(result.text).toContain('Novo pedido.')
    expect(result.text).not.toContain('placeholder')
    expect(result.deliveredDigests[earlier.id]).toBe(messageDigest(earlier))
    expect(result.deliveredDigests[placeholder.id]).toBeUndefined()
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(24_000)
  })

  it('delivers only new or edited external messages to a retained session and snapshots their digests', () => {
    const ownReply = message('own-reply', { agentId: 'agent-1', role: 'assistant', author: 'Chief', text: 'Já comecei.' })
    const colleague = message('colleague', { agentId: 'agent-2', role: 'assistant', author: 'Especialista', text: 'Diagnóstico inicial.' })
    const current = message('current')
    const result = buildTurnContext({
      history: [ownReply, colleague, current], currentInput: 'Encaminha a correção.', inputMessageId: current.id,
      responseMessageId: 'placeholder', agentId: 'agent-1', session: session('retained'), deliveredDigests: { [ownReply.id]: messageDigest(ownReply) },
    })
    expect(result.text).toContain('Diagnóstico inicial.')
    expect(result.text).toContain('Encaminha a correção.')
    expect(result.deliveredDigests[colleague.id]).toBe(messageDigest(colleague))

    const edited = { ...colleague, text: 'Diagnóstico atualizado com a causa.' }
    const editedResult = buildTurnContext({
      history: [ownReply, edited, current], currentInput: 'Encaminha a correção.', inputMessageId: current.id,
      responseMessageId: 'placeholder', agentId: 'agent-1', session: session('retained'), deliveredDigests: result.deliveredDigests,
    })
    expect(editedResult.text).toContain('Diagnóstico atualizado com a causa.')
    expect(editedResult.text).not.toContain('Diagnóstico inicial.')
    expect(editedResult.deliveredDigests[colleague.id]).toBe(messageDigest(edited))
  })

  it('does not mark messages added after the context snapshot as delivered', () => {
    const current = message('current')
    const before = buildTurnContext({ history: [current], currentInput: 'Siga.', inputMessageId: current.id, responseMessageId: 'placeholder', agentId: 'agent-1', session: session('retained'), deliveredDigests: {} })
    const late = message('late', { agentId: 'agent-2', role: 'assistant', author: 'Especialista', text: 'Cheguei durante a abertura.' })
    expect(before.text).toBe('Siga.')
    expect(before.deliveredDigests[late.id]).toBeUndefined()
  })

  it('keeps UTF-8 valid and limits both context and delivered digest metadata', () => {
    const history = Array.from({ length: 45 }, (_, index) => message(`item-${index}`, { text: `🧭${index}-` + 'á'.repeat(900) }))
    const current = message('current', { text: 'Pedido 🧭' })
    const result = buildTurnContext({
      history: [...history, current], currentInput: current.text, inputMessageId: current.id,
      responseMessageId: 'placeholder', agentId: 'agent-1', session: session('empty'), deliveredDigests: {},
    })
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(24_000)
    expect(result.text).not.toContain('\uFFFD')
    expect(Object.keys(result.deliveredDigests).length).toBeLessThanOrEqual(40)
    expect(Object.keys(result.deliveredDigests).length).toBeGreaterThan(0)
    expect(result.deliveredDigests['item-44']).toBe(messageDigest(history[44]))
  })
})
