import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { query, createSdkMcpServer, tool as sdkTool, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z, type ZodType } from 'zod'
import type { Agent, Model } from '../../shared/v9'
import type { AgentRuntime } from './agent-runtime'
import type { DynamicTool } from './codex'
import { buildAgentSystemPrompt } from './agent-prompt'

type ClaudeThread = { id: string; sessionId: string | null; agent: Agent; directory: string; tools: DynamicTool[]; projectInstructions: string; query?: Query; controller?: AbortController; eventGate?: Promise<void> }
type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }

const deferred = (): Deferred => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function zodShape(tool: DynamicTool): Record<string, ZodType> {
  const schema = tool.inputSchema as { properties?: Record<string, { type?: string; items?: { type?: string } }>; required?: string[] }
  const required = new Set(schema.required || [])
  const shape: Record<string, ZodType> = {}
  for (const [name, definition] of Object.entries(schema.properties || {})) {
    let value: ZodType = definition.type === 'string' ? z.string() : definition.type === 'number' ? z.number() : definition.type === 'boolean' ? z.boolean() : definition.type === 'array' ? z.array(z.unknown()) : definition.type === 'object' ? z.record(z.string(), z.unknown()) : z.unknown()
    if (!required.has(name)) value = value.optional()
    shape[name] = value
  }
  return shape
}

function safeProcessEnvironment(apiKey: string): Record<string, string> {
  const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)']
  const env: Record<string, string> = { ANTHROPIC_API_KEY: apiKey, CLAUDE_AGENT_SDK_CLIENT_APP: 'Politron' }
  for (const name of allowed) if (process.env[name]) env[name] = process.env[name]!
  return env
}

/** Claude Code runtime adapter. Native shell and write tools are not exposed; Politron tools go through an in-process MCP server. */
export class ClaudeRuntime extends EventEmitter implements AgentRuntime {
  private readonly threads = new Map<string, ClaudeThread>()
  private readonly waits = new Map<string, (value: unknown) => void>()
  private readonly getApiKey: () => Promise<string | null>
  private readonly dataDirectory: string
  constructor(dataDirectory: string, getApiKey: () => Promise<string | null>, private readonly querySdk: typeof query = query) {
    super(); this.dataDirectory = dataDirectory; this.getApiKey = getApiKey
  }

  async models(): Promise<Model[]> {
    const apiKey = await this.getApiKey()
    if (!apiKey) return []
    const cwd = this.dataDirectory
    const session = this.querySdk({ prompt: '', options: { cwd, env: safeProcessEnvironment(apiKey), settingSources: [], permissionMode: 'default', tools: [] } })
    try {
      const models = await session.supportedModels()
      return models.map(model => ({ id: model.value, name: model.displayName, runtime: 'claude' as const, isDefault: model.value === 'default' || model.value === 'sonnet' }))
    } finally { session.close() }
  }

  async thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions = ''): Promise<string> {
    const id = threadId || randomUUID()
    this.threads.set(id, { id, sessionId: threadId || null, agent, directory, tools, projectInstructions })
    return id
  }

  async send(threadId: string, input: string, model?: string, timeout = 600000): Promise<any> {
    void timeout
    return this.request('turn/start', { threadId, input: [{ type: 'text', text: input }], ...(model ? { model } : {}) })
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (method !== 'turn/start') throw new Error(`Método Claude não suportado: ${method}`)
    const threadId = String(params.threadId || '')
    const context = this.threads.get(threadId)
    if (!context) throw new Error('Sessão Claude não encontrada.')
    const turnId = randomUUID()
    const promptItems = params.input as Array<{ text?: string }> | undefined
    const prompt = promptItems?.map(item => item.text || '').join('\n') || ''
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('Configure uma chave de API Anthropic em Configurações para usar Claude.')
    const pendingInit = deferred()
    const eventGate = deferred()
    context.eventGate = eventGate.promise
    const abortController = new AbortController()
    context.controller = abortController
    const tools = context.tools.map(definition => sdkTool(definition.name, definition.description, zodShape(definition), async (args) => {
      const callId = randomUUID()
      const result = new Promise<unknown>(resolveResult => this.waits.set(callId, resolveResult))
      this.emit('event', { id: callId, method: 'item/tool/call', params: { threadId: context.sessionId || context.id, turnId, tool: definition.name, arguments: args } })
      const resolved = await result as { success: boolean; contentItems?: Array<{ text?: string }> }
      return { content: [{ type: 'text' as const, text: resolved.contentItems?.map(item => item.text || '').join('\n') || '' }], isError: !resolved.success }
    }))
    const server = createSdkMcpServer({ name: 'politron', version: '1.0.0', instructions: 'Todas as operações de arquivo, navegador e delegação devem usar estas ferramentas do Politron.', tools })
    const session = this.querySdk({
      prompt,
      options: {
        cwd: context.directory,
        env: safeProcessEnvironment(apiKey),
        settingSources: [],
        permissionMode: 'default',
        tools: [],
        disallowedTools: ['Write', 'Edit', 'Bash', 'NotebookEdit', 'MultiEdit'],
        allowedTools: context.tools.map(item => `mcp__politron__${item.name}`),
        mcpServers: { politron: server },
        systemPrompt: { type: 'preset', preset: 'claude_code', append: buildAgentSystemPrompt(context.agent, context.projectInstructions) },
        model: typeof params.model === 'string' ? params.model : context.agent.model || undefined,
        effort: context.agent.effort || 'medium',
        ...(context.sessionId ? { resume: context.sessionId } : {}),
        abortController
      }
    })
    context.query = session
    void this.consume(context, turnId, session, pendingInit).catch(error => {
      pendingInit.reject(error instanceof Error ? error : new Error('Claude encerrou a sessão.'))
      this.emit('event', { method: 'turn/completed', params: { threadId: context.sessionId || context.id, turnId, turn: { id: turnId, status: 'failed', error: error instanceof Error ? error.message : String(error) } } })
    })
    try {
      await Promise.race([pendingInit.promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude não iniciou a sessão a tempo.')), 60000))])
    } finally {
      eventGate.resolve()
      context.eventGate = undefined
    }
    return { thread: { id: context.sessionId || threadId }, turn: { id: turnId, status: 'inProgress' } }
  }

  private async consume(context: ClaudeThread, turnId: string, session: Query, initialized: Deferred): Promise<void> {
    let didInit = false
    for await (const message of session as AsyncGenerator<SDKMessage>) {
      if (message.type === 'system' && message.subtype === 'init') {
        context.sessionId = message.session_id; this.threads.set(message.session_id, context); didInit = true; initialized.resolve(); await context.eventGate
      }
      const threadId = context.sessionId || context.id
      if (message.type === 'assistant') {
        const value = message.message.content.filter((item): item is Extract<typeof item, { type: 'text' }> => item.type === 'text').map(item => item.text).join('')
        if (value) this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: value } })
      }
      if (message.type === 'result') {
        const status = message.subtype === 'success' && !message.is_error ? 'completed' : 'failed'
        this.emit('event', { method: 'turn/completed', params: { threadId, turnId, turn: { id: turnId, status, error: message.subtype === 'success' ? '' : message.subtype } } })
      }
    }
    if (!didInit) initialized.reject(new Error('A sessão Claude terminou antes de inicializar.'))
    context.query = undefined; context.controller = undefined
  }

  respond(id: number | string, result: unknown): void { const resolveResult = this.waits.get(String(id)); if (!resolveResult) return; this.waits.delete(String(id)); resolveResult(result) }
  async interrupt(threadId: string): Promise<void> {
    const context = this.threads.get(threadId)
    context?.controller?.abort()
    context?.query?.close()
  }
  close(): void {
    for (const context of this.threads.values()) { context.controller?.abort(); context.query?.close() }
    this.threads.clear(); this.waits.clear()
  }
}
