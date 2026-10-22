import { createHash } from 'node:crypto'
import type { ContextCheckpoint, Message } from '../../shared/v9'
import type { RuntimeThread } from './agent-runtime'

export type TurnContext = { text: string; deliveredDigests: Record<string, string> }
export type BuildTurnContextInput = {
  history: Message[]
  checkpoint?: ContextCheckpoint
  currentInput: string
  inputMessageId?: string
  responseMessageId: string
  agentId: string
  session: RuntimeThread
  deliveredDigests: Record<string, string>
  delegatedRequestIds?: string[]
}

const MAX_CONTEXT_BYTES = 24_000
const MAX_CONTEXT_MESSAGES = 40
const MAX_CURRENT_INPUT_BYTES = 20_000
const MAX_CHECKPOINT_BYTES = 6_000
const OMITTED = '\n[… trecho omitido …]\n'

function boundedUtf8(value: string, maxBytes: number): string {
  const source = Buffer.from(value)
  if (source.length <= maxBytes) return value
  const marker = Buffer.from(OMITTED)
  if (maxBytes <= marker.length) return source.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/u, '')
  const available = maxBytes - marker.length
  const headLimit = Math.floor(available / 2)
  let headEnd = headLimit
  while (headEnd > 0 && headEnd < source.length && (source[headEnd]! & 0xc0) === 0x80) headEnd--
  let tailStart = source.length - (available - headEnd)
  while (tailStart < source.length && (source[tailStart]! & 0xc0) === 0x80) tailStart++
  return `${source.subarray(0, headEnd).toString('utf8')}${OMITTED}${source.subarray(tailStart).toString('utf8')}`
}

export function messageDigest(message: Pick<Message, 'id' | 'agentId' | 'author' | 'role' | 'text' | 'status'>): string {
  const canonical = JSON.stringify([message.id, message.agentId, message.author, message.role, message.text, message.status])
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function checkpointText(checkpoint: ContextCheckpoint | undefined, maxBytes: number): string {
  if (!checkpoint) return ''
  return boundedUtf8([
    `[Resumo salvo em ${checkpoint.createdAt}; use as mensagens posteriores para aplicar correções mais recentes.]`,
    `Resumo: ${checkpoint.summary}`,
    `Decisões: ${checkpoint.decisions.join(' | ') || 'nenhuma registrada'}`,
    `Pendências: ${checkpoint.pending.join(' | ') || 'nenhuma registrada'}`,
  ].join('\n'), Math.min(MAX_CHECKPOINT_BYTES, Math.max(0, maxBytes)))
}

function eligibleForEmptySession(message: Message, input: BuildTurnContextInput, delegatedIds: Set<string>): boolean {
  if (!message.text.trim() || message.id === input.inputMessageId || message.id === input.responseMessageId) return false
  return message.role === 'user' || message.role === 'assistant' || (message.role === 'activity' && delegatedIds.has(message.id))
}

function externalUpdate(message: Message, input: BuildTurnContextInput, delegatedIds: Set<string>): boolean {
  if (!message.text.trim() || message.id === input.inputMessageId || message.id === input.responseMessageId) return false
  if (message.status === 'queued' || message.status === 'running' || message.status === 'waiting') return false
  if (message.role === 'activity') return delegatedIds.has(message.id)
  return message.agentId !== input.agentId
}

function updateDigests(seed: Record<string, string>, included: Message[], current: Message | undefined): Record<string, string> {
  const next = { ...seed }
  for (const message of included) {
    delete next[message.id]
    next[message.id] = messageDigest(message)
  }
  if (current) {
    delete next[current.id]
    next[current.id] = messageDigest(current)
  }
  return Object.fromEntries(Object.entries(next).slice(-MAX_CONTEXT_MESSAGES))
}

export function buildTurnContext(input: BuildTurnContextInput): TurnContext {
  const delegatedIds = new Set(input.delegatedRequestIds || [])
  const current = input.inputMessageId
    ? input.history.find(message => message.id === input.inputMessageId)
    : undefined
  const currentForDigest = current && current.text === input.currentInput
    ? current
    : current ? { ...current, text: input.currentInput } : undefined
  const boundedCurrent = boundedUtf8(input.currentInput, MAX_CURRENT_INPUT_BYTES)
  const currentSection = `Pedido atual:\n${boundedCurrent}`

  if (input.session.history === 'retained' || input.session.history === 'resume-pending') {
    const unseen = input.history.filter(message => externalUpdate(message, input, delegatedIds))
      .filter(message => input.deliveredDigests[message.id] !== messageDigest(message))
    let remaining = MAX_CONTEXT_BYTES - Buffer.byteLength(currentSection) - 128
    const selected: Message[] = []
    const included: Message[] = []
    const messageLimit = MAX_CONTEXT_MESSAGES - (currentForDigest ? 1 : 0)
    for (const message of unseen.slice(-messageLimit).reverse()) {
      const label = `${message.author}: `
      const room = remaining - Buffer.byteLength(label) - 2
      if (room <= 0) break
      const text = boundedUtf8(message.text, room)
      selected.unshift({ ...message, text })
      included.unshift(message)
      remaining -= Buffer.byteLength(label + text) + 2
    }
    const preamble = selected.length ? '[Atualizações externas ainda não entregues nesta sessão; aplique-as ao pedido atual.]' : ''
    const text = selected.length
      ? [preamble, ...selected.map(message => `${message.author}: ${message.text}`), currentSection].join('\n\n')
      : boundedCurrent
    return { text: boundedUtf8(text, MAX_CONTEXT_BYTES), deliveredDigests: updateDigests(input.deliveredDigests, included, currentForDigest) }
  }

  const checkpoint = checkpointText(input.checkpoint, MAX_CONTEXT_BYTES - Buffer.byteLength(currentSection) - 512)
  const selected: Message[] = []
  const included: Message[] = []
  let remaining = MAX_CONTEXT_BYTES - Buffer.byteLength(currentSection) - Buffer.byteLength(checkpoint) - 256
  const eligible = input.history.filter(message => eligibleForEmptySession(message, input, delegatedIds))
  const messageLimit = MAX_CONTEXT_MESSAGES - (currentForDigest ? 1 : 0)
  for (const message of eligible.slice(-messageLimit).reverse()) {
    const label = `${message.author}: `
    const room = remaining - Buffer.byteLength(label) - 2
    if (room <= 0) break
    const text = boundedUtf8(message.text, room)
    selected.unshift({ ...message, text })
    included.unshift(message)
    remaining -= Buffer.byteLength(label + text) + 2
  }
  const omittedCount = eligible.length - selected.length
  const parts = [
    checkpoint,
    ...(selected.length ? ['[Histórico anterior desta conversa, apenas como contexto; não repita trabalho já concluído.]'] : []),
    ...(omittedCount > 0 ? ['[Mensagens anteriores omitidas deste contexto; o histórico completo continua nesta conversa.]'] : []),
    ...selected.map(message => `${message.author}: ${message.text}`),
    currentSection,
  ].filter(Boolean)
  return { text: boundedUtf8(parts.join('\n\n'), MAX_CONTEXT_BYTES), deliveredDigests: updateDigests({}, included, currentForDigest) }
}
