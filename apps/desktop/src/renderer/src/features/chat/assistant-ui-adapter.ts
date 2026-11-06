import { useRef } from 'react'
import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import type { Agent, Message, ModelRuntimeOptions } from '../../../../shared/v9'
import { messagesInTurn, type Turn, type TurnItem } from './turns'

/** Nomes reservados das partes tool-call que não são ferramentas reais. */
export const DELEGATION_TOOL = 'boobot:delegation'
export const NOTE_TOOL = 'boobot:note'

type Part = Exclude<ThreadMessageLike['content'], string>[number]
const ACTIVE = new Set<Message['status']>(['queued', 'running', 'waiting'])

/** Id estável da mensagem assistant do turno: sobrevive ao streaming e à paginação (nasce do id da primeira mensagem). */
export const assistantIdOf = (turn: Turn) => turn.id

function toolPart(message: Message, name: string, argsText: string, result: unknown): Part {
  const running = message.tool?.status === 'running' || (!message.tool && message.status === 'running')
  return {
    type: 'tool-call', toolCallId: message.id, toolName: name, argsText,
    ...(running ? { isPreliminary: true } : { result }),
    ...(message.tool ? { isError: message.tool.status === 'failed' } : {}),
  }
}

/** Partes de um item do turno, com o id da mensagem V1 em `id`/`parentId`/`toolCallId` para o renderer achar o original. */
function itemParts(item: TurnItem): Part[] {
  switch (item.kind) {
    case 'reply': return item.message.text.trim() ? [{ type: 'text', id: item.message.id, parentId: item.message.id, text: item.message.text }] : []
    case 'reasoning': {
      const text = item.message.tool?.output || item.message.text
      return text.trim() ? [{ type: 'reasoning', id: item.message.id, parentId: item.message.id, text }] : []
    }
    case 'tools': return item.messages.map(message => toolPart(message, message.tool?.name || 'activity', message.tool?.args ?? message.text, message.tool?.output ?? ''))
    case 'delegations': return item.messages.map(message => toolPart(message, DELEGATION_TOOL, message.delegationTask ?? '', ACTIVE.has(message.status) ? undefined : message.text))
    case 'note': return [toolPart(item.message, NOTE_TOOL, item.message.text, '')]
  }
}

const statusOf = (turn: Turn): NonNullable<ThreadMessageLike['status']> =>
  turn.status === 'running' || turn.status === 'waiting' ? { type: 'running' }
    : turn.status === 'failed' ? { type: 'incomplete', reason: 'error' }
      : turn.status === 'interrupted' ? { type: 'incomplete', reason: 'cancelled' }
        : { type: 'complete', reason: 'stop' }

/** Um turno vira a mensagem do usuário e UMA mensagem assistant com as partes na ordem cronológica do V1. */
export function projectTurn(turn: Turn): ThreadMessageLike[] {
  const result: ThreadMessageLike[] = []
  if (turn.user) result.push({ id: turn.user.id, role: 'user', content: turn.user.text, createdAt: new Date(turn.user.createdAt) })
  if (turn.items.length) result.push({
    id: assistantIdOf(turn), role: 'assistant', status: statusOf(turn),
    content: turn.items.flatMap(itemParts),
    ...(turn.startedAt !== undefined ? { createdAt: new Date(turn.startedAt) } : {}),
  })
  return result
}

type Cache = Map<string, { sources: Message[]; status: Turn['status']; out: ThreadMessageLike[] }>

/** Reaproveita a projeção dos turnos cujas mensagens V1 não mudaram, para o runtime não reprocessar o histórico a cada fragmento. */
export function projectTurns(turns: Turn[], cache: Cache = new Map()): ThreadMessageLike[] {
  const next: Cache = new Map()
  const out = turns.flatMap(turn => {
    const sources = messagesInTurn(turn)
    const previous = cache.get(turn.id)
    const entry = previous && previous.status === turn.status && previous.sources.length === sources.length && previous.sources.every((source, index) => source === sources[index])
      ? previous : { sources, status: turn.status, out: projectTurn(turn) }
    next.set(turn.id, entry)
    return entry.out
  })
  cache.clear()
  for (const [id, entry] of next) cache.set(id, entry)
  return out
}

/**
 * Runtime assistant-ui que só renderiza a transcrição. Nasce com o histórico (o primeiro render já o mostra) e
 * o V1 continua sendo a fonte da verdade: nada é executado pelo assistant-ui.
 */
export function useTranscriptRuntime(turns: Turn[]) {
  const cache = useRef<Cache>(new Map())
  return useExternalStoreRuntime({ messages: projectTurns(turns, cache.current), convertMessage: (message: ThreadMessageLike) => message, onNew: async () => undefined })
}

export type SendOptions = { files: File[]; effort?: Agent['effort']; modelOptions: ModelRuntimeOptions; planMode?: boolean; delivery: 'queue' | 'now'; requestId: string }
export type SendMessage = (text: string, modelName: string, options: SendOptions) => Promise<void>
type PendingSend = { modelName: string; options: SendOptions; accepted?: boolean; resolve: () => void; reject: (error: unknown) => void }

/**
 * Runtime do Composer: roteia o envio para `onSend` (o caminho de envio existente). O histórico V1 segue
 * autoritativo; este runtime não guarda mensagens.
 */
export function useV1ThreadRuntime(onSend?: SendMessage) {
  const runtime = useExternalStoreRuntime({
    messages: [],
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: async message => {
      const pending = message.runConfig?.custom?.pending as PendingSend | undefined
      if (!pending || !onSend) return
      pending.accepted = true
      const text = message.content.map(part => part.type === 'text' ? part.text : '').join('')
      await onSend(text, pending.modelName, pending.options).then(pending.resolve, pending.reject)
    },
  })
  const send: SendMessage = (text, modelName, options) => new Promise<void>((resolve, reject) => {
    const pending: PendingSend = { modelName, options, resolve, reject }
    runtime.thread.append({ role: 'user', content: [{ type: 'text', text }], runConfig: { custom: { pending } } })
    // append() devolve void e engole a falha; o onNew roda de forma síncrona dentro dele, então se não rodou nada foi enviado.
    if (!pending.accepted) reject(new Error('Não foi possível enviar a mensagem. Tente novamente.'))
  })
  return { runtime, send }
}
