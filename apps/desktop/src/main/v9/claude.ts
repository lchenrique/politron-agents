import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { query, createSdkMcpServer, tool as sdkTool, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z, type ZodType } from 'zod'
import type { Agent, Model } from '../../shared/v9'
import { SessionUnavailableError, type AgentRuntime, type RuntimeThread } from './agent-runtime'
import type { DynamicTool } from './codex'
import { buildAgentSystemPrompt } from './agent-prompt'

type ClaudeTurn = { id: string; controller: AbortController; terminal: boolean; initialized: Deferred; initializedResolved: boolean; eventGate?: Deferred; query?: Query }
type ClaudeThread = { id: string; sessionId: string | null; agent: Agent; directory: string; tools: DynamicTool[]; projectInstructions: string; activeTurn?: ClaudeTurn }
type ToolWait = { turn: ClaudeTurn; resolve: (value: unknown) => void; reject: (error: Error) => void }
type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }
const execFileAsync = promisify(execFile)

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

function safeProcessEnvironment(apiKey: string | null): Record<string, string> {
  const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']
  const env: Record<string, string> = { CLAUDE_AGENT_SDK_CLIENT_APP: 'Boobot' }
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  for (const name of allowed) if (process.env[name]) env[name] = process.env[name]!
  return env
}

/** Claude Code runtime adapter. Native shell and write tools are not exposed; Politron tools go through an in-process MCP server. */
export class ClaudeRuntime extends EventEmitter implements AgentRuntime {
  private readonly threads = new Map<string, ClaudeThread>()
  private readonly waits = new Map<string, ToolWait>()
  private readonly getApiKey: () => Promise<string | null>
  private readonly dataDirectory: string
  private executable: string | undefined
  constructor(dataDirectory: string, getApiKey: () => Promise<string | null>, private readonly querySdk: typeof query = query) {
    super(); this.dataDirectory = dataDirectory; this.getApiKey = getApiKey
  }

  private async resolveExecutable(binaryPath?: string): Promise<void> {
    const usable = (path: string) => process.platform === 'win32'
      ? /\.(exe|js|mjs|ts|tsx|jsx)$/i.test(path)
      : !/\.(cmd|bat|ps1)$/i.test(path)
    if (binaryPath && usable(binaryPath)) this.executable = binaryPath
    if (this.executable) return
    try {
      const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { timeout: 3000, windowsHide: true })
      this.executable = stdout.split(/\r?\n/).map(path => path.trim()).find(path => !!path && usable(path))
    } catch { /* O SDK ainda pode utilizar seu executável distribuído. */ }
  }

  async models(binaryPath?: string): Promise<Model[]> {
    const apiKey = await this.getApiKey()
    // Reutiliza o login do CLI quando não há chave própria. A consulta não envia prompt.
    await this.resolveExecutable(binaryPath)
    const controller = new AbortController()
    let finish!: () => void
    const ended = new Promise<void>(resolve => { finish = resolve })
    const prompt: AsyncIterable<never> = { async *[Symbol.asyncIterator]() { await ended } }
    const session = this.querySdk({ prompt, options: {
      cwd: this.dataDirectory, env: safeProcessEnvironment(apiKey), settingSources: [],
      pathToClaudeCodeExecutable: this.executable, persistSession: false,
      permissionMode: 'default', tools: [], mcpServers: {}, strictMcpConfig: true,
      settings: { disableAllHooks: true }, abortController: controller,
    } })
    const timer = setTimeout(() => controller.abort(new Error('Tempo limite ao consultar modelos do Claude.')), 8000)
    try {
      const models = await session.supportedModels()
      return models.map(model => ({
        id: model.value, name: model.displayName, description: model.description,
        runtime: 'claude' as const, isDefault: model.value === 'default' || model.value === 'sonnet',
        supportedEfforts: model.supportsEffort ? model.supportedEffortLevels || [] : [],
      }))
    } finally { clearTimeout(timer); finish(); session.close() }
  }

  async thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions = ''): Promise<RuntimeThread> {
    const id = threadId || randomUUID()
    this.threads.set(id, { id, sessionId: threadId || null, agent, directory, tools, projectInstructions })
    return { id, history: threadId ? 'resume-pending' : 'empty' }
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
    if (context.activeTurn) throw new Error('Já existe um turno Claude ativo nesta sessão.')
    const turnId = randomUUID()
    const pendingInit = deferred()
    const eventGate = deferred()
    const turn: ClaudeTurn = { id: turnId, controller: new AbortController(), terminal: false, initialized: pendingInit, initializedResolved: false, eventGate }
    context.activeTurn = turn
    let initTimer: ReturnType<typeof setTimeout> | undefined
    try {
    const promptItems = params.input as Array<{ text?: string }> | undefined
    const prompt = promptItems?.map(item => item.text || '').join('\n') || ''
    const apiKey = await this.getApiKey()
    if (turn.terminal || turn.controller.signal.aborted) throw new Error('Execução Claude interrompida.')
    await this.resolveExecutable()
    if (turn.terminal || turn.controller.signal.aborted) throw new Error('Execução Claude interrompida.')
    const tools = context.tools.map(definition => sdkTool(definition.name, definition.description, zodShape(definition), async (args) => {
      const callId = randomUUID()
      const result = new Promise<unknown>((resolveResult, rejectResult) => this.waits.set(callId, { turn, resolve: resolveResult, reject: rejectResult }))
      this.emit('event', { id: callId, method: 'item/tool/call', params: { threadId: context.sessionId || context.id, turnId, tool: definition.name, arguments: args } })
      const resolved = await result as { success: boolean; contentItems?: Array<{ text?: string }> }
      return { content: [{ type: 'text' as const, text: resolved.contentItems?.map(item => item.text || '').join('\n') || '' }], isError: !resolved.success }
    }))
    const server = createSdkMcpServer({ name: 'politron', version: '1.0.0', instructions: 'Todas as operações de arquivo, navegador e delegação devem usar estas ferramentas do Boobot.', tools })
    const session = this.querySdk({
      prompt,
      options: {
        cwd: context.directory,
        env: safeProcessEnvironment(apiKey),
        pathToClaudeCodeExecutable: this.executable,
        settingSources: [],
        permissionMode: 'default',
        tools: [],
        disallowedTools: ['Write', 'Edit', 'Bash', 'NotebookEdit', 'MultiEdit'],
        allowedTools: context.tools.map(item => `mcp__politron__${item.name}`),
        mcpServers: { politron: server },
        systemPrompt: { type: 'preset', preset: 'claude_code', append: buildAgentSystemPrompt(context.agent, context.projectInstructions, context.tools) },
      model: typeof params.model === 'string' ? params.model : context.agent.model || undefined,
      effort: context.agent.effort,
      ...(context.sessionId ? { resume: context.sessionId } : {}),
        abortController: turn.controller
      }
    })
    turn.query = session
    void this.consume(context, turn, session).catch(error => this.finishTurn(context, turn, 'failed', error instanceof Error ? error : new Error('Claude encerrou a sessão.')))
    try {
      await Promise.race([pendingInit.promise, new Promise<never>((_, reject) => { initTimer = setTimeout(() => reject(new Error('Claude não iniciou a sessão a tempo.')), 60000) })])
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Claude não iniciou a sessão.')
      this.finishTurn(context, turn, 'failed', failure)
      throw failure
    } finally {
      if (initTimer) clearTimeout(initTimer)
      eventGate.resolve()
      if (turn.eventGate === eventGate) turn.eventGate = undefined
    }
    return { thread: { id: context.sessionId || threadId }, turn: { id: turnId, status: 'inProgress' } }
    } catch (error) {
      this.finishTurn(context, turn, 'failed', error instanceof Error ? error : new Error('Falha ao iniciar o turno Claude.'))
      throw error
    }
  }

  private async consume(context: ClaudeThread, turn: ClaudeTurn, session: Query): Promise<void> {
    let didInit = false
    for await (const message of session as AsyncGenerator<SDKMessage>) {
      if (turn.terminal) return
      if (message.type === 'system' && message.subtype === 'init') {
        context.sessionId = message.session_id; this.threads.set(message.session_id, context); didInit = true; turn.initializedResolved = true; turn.initialized.resolve(); await turn.eventGate?.promise
      }
      const threadId = context.sessionId || context.id
      if (message.type === 'assistant') {
        const value = message.message.content.filter((item): item is Extract<typeof item, { type: 'text' }> => item.type === 'text').map(item => item.text).join('')
        if (value) this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId: turn.id, delta: value } })
      }
      if (message.type === 'result') {
        const status = message.subtype === 'success' && !message.is_error ? 'completed' : 'failed'
        const detail = Array.isArray((message as any).errors) ? (message as any).errors.filter((item: unknown) => typeof item === 'string').join('\n') : ''
        const missingResume = !didInit && !!context.sessionId && /no conversation found with session id|session (?:id )?[^\s]+ (?:was )?not found/i.test(detail)
        const error = status === 'completed' ? undefined : missingResume
          ? new SessionUnavailableError(detail)
          : new Error(detail || (message.subtype === 'success' ? 'Claude retornou erro.' : message.subtype))
        this.finishTurn(context, turn, status, error)
        return
      }
    }
    if (!turn.terminal) throw new Error(didInit ? 'Claude encerrou a sessão sem enviar o resultado do turno.' : 'A sessão Claude terminou antes de inicializar.')
  }

  private finishTurn(context: ClaudeThread, turn: ClaudeTurn, status: 'completed' | 'failed' | 'interrupted', error?: Error): void {
    if (turn.terminal) return
    turn.terminal = true
    if (error instanceof SessionUnavailableError) {
      this.threads.delete(context.id)
      if (context.sessionId) this.threads.delete(context.sessionId)
    }
    if (!turn.initializedResolved) turn.initialized.reject(error || new Error(`Turno Claude ${status}.`))
    turn.eventGate?.resolve()
    const failure = error || new Error(`Turno Claude ${status}.`)
    for (const [id, wait] of this.waits) {
      if (wait.turn !== turn) continue
      this.waits.delete(id)
      wait.reject(failure)
    }
    if (context.activeTurn === turn) context.activeTurn = undefined
    this.emit('event', { method: 'turn/completed', params: { threadId: context.sessionId || context.id, turnId: turn.id, turn: { id: turn.id, status, error: error?.message || '' } } })
    if (status !== 'completed') turn.controller.abort(error)
    try { turn.query?.close() } catch { /* A consulta já pode ter fechado no EOF. */ }
  }

  respond(id: number | string, result: unknown): void { const wait = this.waits.get(String(id)); if (!wait) return; this.waits.delete(String(id)); wait.resolve(result) }
  async interrupt(threadId: string): Promise<void> {
    const context = this.threads.get(threadId)
    if (context?.activeTurn) this.finishTurn(context, context.activeTurn, 'interrupted', new Error('Execução Claude interrompida.'))
  }
  close(): void {
    for (const context of new Set(this.threads.values())) if (context.activeTurn) this.finishTurn(context, context.activeTurn, 'interrupted', new Error('Runtime Claude encerrado.'))
    this.threads.clear(); this.waits.clear()
  }
}
