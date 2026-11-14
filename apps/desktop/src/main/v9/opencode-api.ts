import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { Agent, Model } from '../../shared/v9'
import type { AgentRuntime, RuntimeThread } from './agent-runtime'
import type { DynamicTool } from './codex'
import { openCodeUsage } from './mission-budget'
import { buildAgentSystemPrompt } from './agent-prompt'

/** OpenCode Console (Console/Zen) fala OpenAI por este caminho; a chave vai no Bearer. */
export const OPENCODE_API_BASE = 'https://opencode.ai/inference'
/** Sem nenhum byte do stream por este tempo, o turno falha em vez de ficar "pensando". */
export const OPENCODE_INACTIVITY_MS = 120_000

type FetchImpl = typeof fetch
type Packet = Record<string, unknown>

export function openCodeHttpError(status: number): string {
  if (status === 401 || status === 403) return 'A chave da API do OpenCode foi recusada. Confira a chave em Configurações → Provedores.'
  if (status === 402) return 'A conta do OpenCode está sem créditos para este modelo.'
  if (status === 404) return 'O modelo escolhido não existe no OpenCode. Escolha outro no seletor de modelo.'
  if (status === 429) return 'O OpenCode limitou as requisições agora. Tente de novo em instantes.'
  return `O OpenCode respondeu com erro ${status}.`
}

/** Catálogo do Console (`/inference/v1/models`), sem depender do CLI instalado. */
export async function listOpenCodeModels(apiKey: string, fetchImpl: FetchImpl = fetch): Promise<Model[]> {
  const key = (apiKey || '').trim()
  if (!key) throw new Error('Informe a chave da API do OpenCode em Configurações → Provedores.')
  let response: Response
  try {
    response = await fetchImpl(`${OPENCODE_API_BASE}/v1/models`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    throw new Error(`Não foi possível consultar o catálogo do OpenCode${error instanceof Error && error.message.includes('abort') ? ' (tempo esgotado)' : ''}. Confira a rede e tente de novo.`)
  }
  if (!response.ok) throw new Error(openCodeHttpError(response.status))
  const payload = await response.json().catch(() => null) as { data?: Packet[] } | Packet[] | null
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
  const models = rows
    .filter((row): row is { id: string; name?: string } => typeof (row as { id?: unknown })?.id === 'string')
    .map(row => ({ id: row.id, name: row.name || row.id, runtime: 'opencode' as const, isDefault: false, supportedEfforts: [] as Model['supportedEfforts'] }))
  if (!models.length) throw new Error('O OpenCode não retornou um catálogo de modelos reconhecido.')
  return models
}

/** Converte as ferramentas do Boobot no formato de function calling da OpenAI. */
export function openCodeTools(tools: DynamicTool[]) {
  return tools.length
    ? tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }))
    : undefined
}

type Session = {
  id: string
  agent: Agent
  instructions: string
  tools: DynamicTool[]
  messages: Packet[]
  history: { role: 'Usuário' | 'Agente'; text: string }[]
  turnId?: string
  controller?: AbortController
  watchdog?: ReturnType<typeof setTimeout>
  text: string
  stopping: boolean
  finished: boolean
  waiting?: string
  /** Mensagem do assistente com os tool_calls pendentes, para devolver o resultado na sequência certa. */
  pending?: Packet
}

/**
 * Motor OpenCode via API key (Console/Zen), sem CLI: chat completions em streaming,
 * ferramentas por function calling e o mesmo broker de aprovação dos outros motores.
 */
export class OpenCodeApiRuntime extends EventEmitter implements AgentRuntime {
  private readonly sessions = new Map<string, Session>()
  private readonly pending = new Map<string, Session>()

  constructor(private readonly getKey: () => Promise<string | null>, private readonly options: { fetch?: FetchImpl; inactivityMs?: number; base?: string } = {}) {
    super()
  }

  private get fetchImpl(): FetchImpl { return this.options.fetch ?? fetch }
  private get base(): string { return this.options.base ?? OPENCODE_API_BASE }
  private get inactivityMs(): number { return this.options.inactivityMs ?? OPENCODE_INACTIVITY_MS }

  async models(): Promise<Model[]> {
    return listOpenCodeModels((await this.getKey()) || '', this.fetchImpl)
  }

  async thread(agent: Agent, _directory: string, tools: DynamicTool[], threadId?: string, projectInstructions = ''): Promise<RuntimeThread> {
    const key = threadId || randomUUID()
    if (this.sessions.has(key)) return { id: key, history: 'retained' }
    this.sessions.set(key, { id: key, agent, instructions: projectInstructions, tools, messages: [], history: [], text: '', stopping: false, finished: false })
    return { id: key, history: 'empty' }
  }

  async send(threadId: string, input: string, model?: string, timeout = 600_000): Promise<{ thread: { id: string }; turn: { id: string; status: string } }> {
    const session = this.sessions.get(threadId)
    if (!session) throw new Error('Sessão do OpenCode não encontrada. Abra a conversa de novo.')
    if (session.turnId) throw new Error('A conversa ainda está respondendo.')
    const chosen = model || session.agent.model
    if (!chosen) throw new Error('Selecione um modelo do OpenCode antes de enviar.')
    const key = await this.getKey()
    if (!key) throw new Error('A chave da API do OpenCode não está configurada. Abra Configurações → Provedores.')

    const turnId = randomUUID()
    session.turnId = turnId
    session.text = ''
    session.stopping = false
    session.finished = false
    session.history.push({ role: 'Usuário', text: input })
    const messages = session.messages.length
      ? [...session.messages, { role: 'user', content: input }]
      : [{ role: 'system', content: buildAgentSystemPrompt(session.agent, session.instructions, session.tools) }, { role: 'user', content: input }]
    session.messages = messages

    const controller = new AbortController()
    session.controller = controller
    const timer = setTimeout(() => controller.abort(new Error('O OpenCode excedeu o tempo limite da resposta.')), timeout)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timer no Node aceita unref
    ;(timer as any).unref?.()
    void this.stream(session, { model: chosen, key, messages }, controller, timer).catch(error => {
      clearTimeout(timer)
      this.finish(session, 'failed', this.errorText(error))
    })
    return { thread: { id: threadId }, turn: { id: turnId, status: 'inProgress' } }
  }

  private async stream(session: Session, body: { model: string; key: string; messages: Packet[] }, controller: AbortController, timer: ReturnType<typeof setTimeout>): Promise<void> {
    const touch = () => {
      if (session.watchdog) clearTimeout(session.watchdog)
      if (session.finished || session.waiting || !this.inactivityMs) return
      session.watchdog = setTimeout(() => controller.abort(new Error(`O OpenCode ficou ${Math.round(this.inactivityMs / 1000)}s sem responder.`)), this.inactivityMs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timer no Node aceita unref
      ;(session.watchdog as any)?.unref?.()
    }
    touch()
    let response: Response
    try {
      response = await this.fetchImpl(`${this.base}/openai/v1/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${body.key}`, 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ model: body.model, messages: body.messages, stream: true, stream_options: { include_usage: true }, tools: openCodeTools(session.tools) }),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      if (session.watchdog) clearTimeout(session.watchdog)
      throw error
    }
    if (!response.ok) {
      clearTimeout(timer)
      if (session.watchdog) clearTimeout(session.watchdog)
      throw new Error(openCodeHttpError(response.status))
    }
    if (!response.body) throw new Error('O OpenCode respondeu sem corpo de streaming.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let calls: Array<{ id: string; name: string; arguments: string }> = []
    let assistantText = ''
    let finishedReason = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        touch()
        buffer += decoder.decode(value, { stream: true })
        let index: number
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          let packet: Packet
          try { packet = JSON.parse(payload) as Packet } catch { continue }
          // Último pacote do stream traz o consumo quando o provedor honra include_usage.
          if (packet.usage) this.emit('event', { method: 'turn/usage', params: { threadId: session.id, turnId: session.turnId, usage: openCodeUsage(packet) } })
          const choice = (packet.choices as Packet[] | undefined)?.[0] as Packet | undefined
          const delta = choice?.delta as Packet | undefined
          if (typeof delta?.content === 'string' && delta.content) {
            assistantText += delta.content
            session.text += delta.content
            this.emit('event', { method: 'item/agentMessage/delta', params: { threadId: session.id, turnId: session.turnId, delta: delta.content } })
          }
          const fragments = delta?.tool_calls as Packet[] | undefined
          if (Array.isArray(fragments)) {
            for (const fragment of fragments) {
              const position = Number(fragment.index ?? calls.length)
              const current = calls[position] ?? (calls[position] = { id: '', name: '', arguments: '' })
              if (typeof fragment.id === 'string' && fragment.id) current.id = fragment.id
              const fn = fragment.function as Packet | undefined
              if (typeof fn?.name === 'string' && fn.name) current.name = fn.name
              if (typeof fn?.arguments === 'string' && fn.arguments) current.arguments += fn.arguments
            }
          }
          if (typeof choice?.finish_reason === 'string') finishedReason = choice.finish_reason
        }
      }
    } finally {
      if (session.watchdog) clearTimeout(session.watchdog)
      session.watchdog = undefined
      clearTimeout(timer)
    }
    calls = calls.filter(call => call && call.name)
    if (calls.length) {
      const toolCall = calls[0]
      let args: unknown = {}
      try { args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {} } catch { args = {} }
      session.pending = { role: 'assistant', content: assistantText || null, tool_calls: calls.map(call => ({ id: call.id || randomUUID(), type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) }
      const id = session.pending.tool_calls instanceof Array ? (session.pending.tool_calls as Packet[])[0].id as string : randomUUID()
      session.waiting = id
      this.pending.set(id, session)
      if (session.watchdog) clearTimeout(session.watchdog)
      session.watchdog = undefined
      this.emit('event', { id, method: 'item/tool/call', params: { threadId: session.id, turnId: session.turnId, tool: toolCall.name, arguments: args } })
      return
    }
    if (finishedReason === 'length') { this.finish(session, 'failed', 'A resposta do OpenCode passou do limite de tokens. Peça algo menor ou divida a tarefa.'); return }
    this.finish(session, 'completed')
  }

  respond(id: number | string, result: unknown): void {
    const key = String(id)
    const session = this.pending.get(key)
    if (!session || session.finished || session.stopping) return
    this.pending.delete(key)
    session.waiting = undefined
    const assistant = session.pending
    session.pending = undefined
    if (assistant) session.messages.push(assistant)
    session.messages.push({ role: 'tool', tool_call_id: key, content: JSON.stringify(result) })
    const controller = new AbortController()
    session.controller = controller
    const timer = setTimeout(() => controller.abort(new Error('O OpenCode excedeu o tempo limite da resposta.')), 600_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timer no Node aceita unref
    ;(timer as any).unref?.()
    const model = session.agent.model
    void this.getKey().then(async key => {
      if (!key) throw new Error('A chave da API do OpenCode não está configurada. Abra Configurações → Provedores.')
      return this.stream(session, { model, key, messages: session.messages }, controller, timer)
    }).catch(error => { clearTimeout(timer); this.finish(session, 'failed', this.errorText(error)) })
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    const session = this.sessions.get(threadId)
    if (!session || session.turnId !== turnId) return
    session.stopping = true
    session.controller?.abort(new Error('interrompido'))
    if (session.waiting) { this.pending.delete(session.waiting); session.waiting = undefined }
    this.finish(session, 'interrupted')
  }

  close(): void {
    for (const session of this.sessions.values()) {
      if (session.turnId) { session.stopping = true; session.controller?.abort(new Error('encerrado')); this.finish(session, 'interrupted') }
      if (session.watchdog) clearTimeout(session.watchdog)
    }
    this.sessions.clear()
    this.pending.clear()
  }

  private errorText(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error)
    if (/aborted|abort/i.test(text) && !/OpenCode ficou|tempo limite/i.test(text)) return 'A resposta do OpenCode foi cancelada.'
    return text.slice(0, 400)
  }

  private finish(session: Session, status: 'completed' | 'failed' | 'interrupted', error?: string): void {
    if (session.finished || !session.turnId) return
    session.finished = true
    if (session.watchdog) clearTimeout(session.watchdog)
    session.watchdog = undefined
    session.controller = undefined
    const turnId = session.turnId
    session.turnId = undefined
    if (status === 'completed') {
      if (session.text) session.messages.push({ role: 'assistant', content: session.text })
      if (session.text) session.history.push({ role: 'Agente', text: session.text })
      if (session.text) this.emit('event', { method: 'item/completed', params: { threadId: session.id, turnId, item: { type: 'agentMessage', text: session.text } } })
    }
    this.emit('event', { method: 'turn/completed', params: { threadId: session.id, turnId, turn: { id: turnId, status, ...(error ? { error: { message: error } } : {}) } } })
  }
}
