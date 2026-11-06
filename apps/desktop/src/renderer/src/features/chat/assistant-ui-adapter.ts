import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import type { Agent, Message, ModelRuntimeOptions } from '../../../../shared/v9'

/** Read-only projection: V1 remains the source of truth for history and tool execution. */
export function toAssistantThreadMessage(message: Message): ThreadMessageLike {
  const content: ThreadMessageLike['content'] = message.role === 'activity'
    ? [{
      type: 'tool-call',
      toolCallId: message.id,
      toolName: message.tool?.name || 'activity',
      ...(message.tool?.args ? { argsText: message.tool.args } : { argsText: message.text }),
      ...(message.tool?.output !== undefined ? { result: message.tool.output } : {}),
      ...(message.tool ? { isError: message.tool.status === 'failed' } : {}),
      ...(message.tool?.status === 'running' ? { isPreliminary: true } : {}),
    }]
    : message.text

  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content,
    createdAt: new Date(message.createdAt),
    ...(message.runId ? { metadata: { runId: message.runId } } : {}),
  }
}

export type SendOptions = { files: File[]; effort?: Agent['effort']; modelOptions: ModelRuntimeOptions; planMode?: boolean; delivery: 'queue' | 'now'; requestId: string }
export type SendMessage = (text: string, modelName: string, options: SendOptions) => Promise<void>
type PendingSend = { modelName: string; options: SendOptions; accepted?: boolean; resolve: () => void; reject: (error: unknown) => void }

/**
 * assistant-ui runtime over the V1 store. The runtime only renders and routes the Composer's send to `onSend`
 * (the existing send path); the V1 history stays authoritative and nothing is executed by assistant-ui.
 */
export function useV1ThreadRuntime(messages: Message[], onSend?: SendMessage) {
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toAssistantThreadMessage,
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
