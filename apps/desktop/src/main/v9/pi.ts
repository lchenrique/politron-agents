import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { promisify } from 'node:util'
import type { Agent, Model } from '../../shared/v9'
import type { AgentRuntime, RuntimeThread } from './agent-runtime'
import type { DynamicTool } from './codex'
import { buildAgentSystemPrompt } from './agent-prompt'
import { CliToolBridge } from './cli-tool-bridge'
import { piUsage } from './mission-budget'

type Value = Record<string, unknown>
type ToolResult = { success: boolean; contentItems?: { text?: string }[] }
type Turn = { id: string; gated: boolean; events: Value[]; text: string; error?: string; interrupted: boolean; timer?: ReturnType<typeof setTimeout> }
type Thread = { id: string; agent: Agent; rpc: PiConnection; bridge: CliToolBridge; turn?: Turn }
type ToolWait = { thread: Thread; turnId: string; resolve: (result: ToolResult) => void; timer: ReturnType<typeof setTimeout> }
const execFileAsync = promisify(execFile)
const record = (value: unknown): value is Value => !!value && typeof value === 'object' && !Array.isArray(value)
const SAFE_FLAGS = ['--mode', 'rpc', '--no-builtin-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-approve']

// Pi 0.84.1 docs/rpc.md specifies LF framing; readline also splits Unicode line separators.
class PiConnection {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private stopped = false
  bridgeReady = false
  constructor(node: string, entry: string, args: string[], directory: string, environment: NodeJS.ProcessEnv, private readonly event: (message: Value) => void, private readonly failure: (error: Error) => void) {
    this.child = spawn(node, [entry, ...args], { cwd: directory, env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'pipe', shell: false })
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    this.child.stdout.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk)
      if (Buffer.byteLength(buffer) > 32 * 1024 * 1024) { this.fail(new Error('A resposta RPC do Pi excedeu o limite.')); return }
      let end: number
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        if (!line.trim()) continue
        let message: unknown
        try { message = JSON.parse(line) } catch { this.fail(new Error('O Pi devolveu uma linha RPC inválida.')); return }
        if (!record(message)) continue
        if (message.type === 'politron_bridge_ready') { this.bridgeReady = true; continue }
        if (message.type !== 'response') { this.event(message); continue }
        const id = String(message.id)
        const pending = this.pending.get(id)
        if (!pending) continue
        this.pending.delete(id); clearTimeout(pending.timer)
        if (message.success === true) pending.resolve(message.data)
        else pending.reject(new Error(typeof message.error === 'string' ? message.error : 'O comando RPC do Pi falhou.'))
      }
    })
    // Diagnostics may contain provider credentials; they are consumed without logging.
    this.child.stderr.resume()
    this.child.stdin.on('error', () => this.fail(new Error('A entrada RPC do Pi foi encerrada.')))
    this.child.on('error', () => this.fail(new Error('Não foi possível iniciar o Pi.')))
    this.child.on('exit', code => this.fail(new Error(`O Pi foi encerrado (${code ?? 'sem código'}).`)))
  }
  request(type: string, params: Value = {}, timeout = 15000): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('O Pi não está conectado.'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`O Pi não respondeu a ${type}.`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.child.stdin.write(JSON.stringify({ ...params, id, type }) + '\n') }
      catch { this.pending.delete(id); clearTimeout(timer); reject(new Error('Não foi possível enviar o comando ao Pi.')) }
    })
  }
  private fail(error: Error): void { if (this.stopped) return; this.close(); this.failure(error) }
  close(): void {
    if (this.stopped) return
    this.stopped = true
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Conexão com Pi encerrada.')) }
    this.pending.clear(); this.child.kill()
  }
}

// Only this explicit extension is loaded. The bearer token stays in the child environment.
export const BRIDGE_EXTENSION = `export default async function(pi) {
  const base = process.env.POLITRON_PI_BRIDGE_URL;
  const headers = { Authorization: 'Bearer ' + process.env.POLITRON_PI_BRIDGE_TOKEN };
  const response = await fetch(base + '/tools', { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Ponte de ferramentas indisponível.');
  const tools = await response.json();
  if (!Array.isArray(tools)) throw new Error('Catálogo de ferramentas inválido.');
  const allowed = new Set(tools.map(tool => tool.name));
  pi.on('tool_call', event => allowed.has(event.toolName) ? undefined : { block: true, terminate: true, reason: 'Ferramenta não autorizada pelo Boobot.' });
  for (const tool of tools) pi.registerTool({
    name: tool.name, label: tool.name, description: tool.description, parameters: tool.inputSchema,
    async execute(toolCallId, params, signal) {
      const result = await fetch(base + '/call', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tool.name, args: params }), signal
      });
      if (!result.ok) throw new Error('A ponte de ferramentas recusou a chamada.');
      const value = await result.json();
      const text = (value.contentItems || []).map(item => item.text || '').join('\\n');
      if (!value.success) throw new Error(text || 'A ferramenta falhou.');
      return { content: [{ type: 'text', text }], details: {} };
    }
  });
  const ready = await fetch(base + '/ready', { method: 'POST', headers, signal: AbortSignal.timeout(10000) });
  if (!ready.ok) throw new Error('Ponte de ferramentas não inicializada.');
}
`

/** Pi RPC adapter. Native tools, context discovery and third-party extensions remain disabled. */
export class PiRuntime extends EventEmitter implements AgentRuntime {
  private readonly threads = new Map<string, Thread>()
  private readonly waits = new Map<string, ToolWait>()
  private executable?: { node: string; entry: string }
  constructor(private readonly dataDirectory: string) { super() }

  private async resolveExecutable(binaryPath?: string): Promise<{ node: string; entry: string }> {
    if (!binaryPath && this.executable) return this.executable
    const locate = async (name: string): Promise<string[]> => {
      const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { timeout: 3000, windowsHide: true })
      return stdout.split(/\r?\n/).map(path => path.trim()).filter(Boolean)
    }
    const candidates = binaryPath ? [binaryPath] : await locate('pi')
    let entry: string | undefined
    for (const candidate of candidates) {
      try {
        const target = await realpath(candidate)
        if (/\.(?:mjs|js)$/i.test(target)) { entry = target; break }
        const shim = await readFile(target, 'utf8')
        const module = shim.match(/node_modules[\\/][\w@.\\/-]+\.(?:mjs|js)/)?.[0]
        if (module) { entry = await realpath(join(dirname(target), ...module.split(/[\\/]/))); break }
      } catch { /* Try the next executable or npm shim. */ }
    }
    if (!entry) throw new Error('Não foi possível localizar a entrada JavaScript do Pi CLI.')
    const node = (await locate('node')).find(path => process.platform !== 'win32' || /\.exe$/i.test(path))
    if (!node || /electron/i.test(basename(node))) throw new Error('O Pi precisa de uma instalação do Node.js disponível no PATH.')
    this.executable = { node, entry }
    return this.executable
  }

  async models(binaryPath?: string): Promise<Model[]> {
    const { node, entry } = await this.resolveExecutable(binaryPath)
    await mkdir(this.dataDirectory, { recursive: true })
    const rpc = new PiConnection(node, entry, [...SAFE_FLAGS, '--no-session', '--offline', '--tools', ''], tmpdir(), process.env, () => undefined, () => undefined)
    try {
      const result = await rpc.request('get_available_models')
      if (!record(result) || !Array.isArray(result.models)) throw new Error('O Pi devolveu um catálogo de modelos inválido.')
      const state = await rpc.request('get_state')
      const selected = record(state) && record(state.model) ? state.model : undefined
      const catalog = result.models.filter(record).filter(model => typeof model.provider === 'string' && typeof model.id === 'string' && model.id.length > 0)
      const models: Model[] = []
      for (const model of catalog) {
        const id = `${model.provider}/${model.id}`
        let supportedEfforts: NonNullable<Model['supportedEfforts']> = []
        try {
          await rpc.request('set_model', { provider: model.provider, modelId: model.id })
          const response = await rpc.request('get_available_thinking_levels')
          if (record(response) && Array.isArray(response.levels)) {
            supportedEfforts = response.levels.filter((level): level is NonNullable<Agent['effort']> =>
              typeof level === 'string' && ['low', 'medium', 'high', 'xhigh', 'max'].includes(level))
          }
        } catch { /* Modelos que não aceitam seleção por RPC ficam sem controles de esforço. */ }
        models.push({
          id, name: typeof model.name === 'string' ? model.name : String(model.id), runtime: 'pi',
          isDefault: selected?.provider === model.provider && selected?.id === model.id,
          supportedEfforts,
        })
      }
      return models
    } finally { rpc.close() }
  }

  async thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions = ''): Promise<RuntimeThread> {
    const id = threadId || randomUUID()
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) throw new Error('Identificador de sessão Pi inválido.')
    const previous = this.threads.get(id)
    if (previous?.turn) throw new Error('A sessão Pi já está executando uma tarefa.')
    if (previous) this.dispose(previous)
    if (tools.some(tool => !/^[A-Za-z0-9_-]+$/.test(tool.name))) throw new Error('Nome de ferramenta Pi inválido.')
    const { node, entry } = await this.resolveExecutable()
    const sessionDirectory = join(this.dataDirectory, 'pi', 'sessions', id)
    await mkdir(sessionDirectory, { recursive: true, mode: 0o700 })
    const hasPersistedHistory = (await readdir(sessionDirectory)).some(name => name !== 'bridge.mjs')
    const extension = join(sessionDirectory, 'bridge.mjs')
    await writeFile(extension, BRIDGE_EXTENSION, { encoding: 'utf8', mode: 0o600 })
    // eslint-disable-next-line prefer-const -- atribuída depois de ser capturada pelos callbacks acima
    let context: Thread | undefined
    const bridge = new CliToolBridge(tools, (name, args) => context ? this.callTool(context, name, args) : Promise.resolve({ success: false }))
    await bridge.start()
    const rpc = new PiConnection(node, entry, [
      ...SAFE_FLAGS, '--session-dir', sessionDirectory, '--session-id', id, '-e', extension,
      '--tools', tools.map(tool => tool.name).join(','), '--append-system-prompt', buildAgentSystemPrompt(agent, projectInstructions, tools)
    ], directory, { ...process.env, POLITRON_PI_BRIDGE_URL: bridge.url, POLITRON_PI_BRIDGE_TOKEN: bridge.token },
    message => { if (context) this.receive(context, message) }, error => {
      if (context) { this.complete(context, 'failed', error.message); this.dispose(context); this.emit('disconnected', error) }
    })
    context = { id, agent, rpc, bridge }
    this.threads.set(id, context)
    try {
      const state = await rpc.request('get_state')
      // O Pi responde get_state antes de concluir a inicialização de extensões assíncronas.
      for (let attempt = 0; !bridge.ready && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 100))
      if (!bridge.ready) throw new Error('A extensão de ferramentas do Boobot não confirmou sua inicialização no Pi.')
      if (record(state) && typeof state.sessionFile === 'string') {
        const path = relative(sessionDirectory, state.sessionFile)
        if (path.startsWith('..') || isAbsolute(path)) throw new Error('O Pi abriu uma sessão fora da pasta privada da conversa.')
      }
      return { id, history: hasPersistedHistory ? 'retained' : 'empty' }
    } catch (error) { this.dispose(context); throw error }
  }

  async send(threadId: string, input: string, model?: string, timeout = 600000, options: { effort?: Agent['effort'] } = {}): Promise<{ thread: { id: string }; turn: { id: string; status: string } }> {
    const context = this.threads.get(threadId)
    if (!context) throw new Error('Sessão Pi não encontrada.')
    if (context.turn) throw new Error('A sessão Pi já está executando uma tarefa.')
    const selected = model || context.agent.model
    if (selected) {
      const slash = selected.indexOf('/')
      if (slash < 1 || slash === selected.length - 1) throw new Error('Selecione um modelo Pi com provedor e identificador.')
      await context.rpc.request('set_model', { provider: selected.slice(0, slash), modelId: selected.slice(slash + 1) })
    }
    const effort = options.effort || context.agent.effort
    if (effort) {
      const thinking = await context.rpc.request('get_available_thinking_levels')
      if (record(thinking) && Array.isArray(thinking.levels) && thinking.levels.includes(effort)) await context.rpc.request('set_thinking_level', { level: effort })
    }
    const turn: Turn = { id: randomUUID(), gated: true, events: [], text: '', interrupted: false }
    context.turn = turn
    turn.timer = setTimeout(() => { this.complete(context, 'failed', 'A execução do Pi excedeu o tempo limite.'); this.dispose(context) }, timeout)
    try {
      await context.rpc.request('prompt', { message: input }, Math.min(timeout, 60000))
      // WorkspaceService records turnId after send resolves, before event delivery starts.
      setImmediate(() => { turn.gated = false; for (const event of turn.events.splice(0)) this.emit('event', event) })
      return { thread: { id: threadId }, turn: { id: turn.id, status: 'inProgress' } }
    } catch (error) { clearTimeout(turn.timer); context.turn = undefined; this.dispose(context); throw error }
  }

  private publish(context: Thread, turn: Turn, event: Value): void { if (turn.gated) turn.events.push(event); else this.emit('event', event) }
  private receive(context: Thread, message: Value): void {
    const turn = context.turn
    if (!turn) return
    const params = { threadId: context.id, turnId: turn.id }
    if (message.type === 'message_update' && record(message.assistantMessageEvent)) {
      const delta = message.assistantMessageEvent
      if (delta.type === 'text_delta' && typeof delta.delta === 'string') this.publish(context, turn, { method: 'item/agentMessage/delta', params: { ...params, delta: delta.delta } })
    }
    if (message.type === 'message_end' && record(message.message) && message.message.role === 'assistant') {
      const assistant = message.message
      const text = Array.isArray(assistant.content) ? assistant.content.filter(record).filter(item => item.type === 'text').map(item => typeof item.text === 'string' ? item.text : '').join('') : ''
      if (text) turn.text += (turn.text ? '\n\n' : '') + text
      turn.error = assistant.stopReason === 'error' ? (typeof assistant.errorMessage === 'string' ? assistant.errorMessage : 'O modelo Pi não concluiu a resposta.') : undefined
      turn.interrupted = turn.interrupted || assistant.stopReason === 'aborted'
      this.publish(context, turn, { method: 'item/completed', params: { ...params, item: { type: 'agentMessage', text: turn.text } } })
      if (record(assistant.usage)) this.publish(context, turn, { method: 'turn/usage', params: { ...params, usage: piUsage(assistant) } })
    }
    if (message.type === 'agent_settled') this.complete(context, turn.interrupted ? 'interrupted' : turn.error ? 'failed' : 'completed', turn.error)
    if (message.type === 'extension_error') { this.complete(context, 'failed', 'A extensão de ferramentas do Pi falhou.'); this.dispose(context) }
  }

  private callTool(context: Thread, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const turn = context.turn
    if (!turn || turn.interrupted) return Promise.resolve({ success: false, contentItems: [{ text: 'A execução foi encerrada.' }] })
    const id = randomUUID()
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waits.delete(id); resolve({ success: false, contentItems: [{ text: 'A ferramenta excedeu o tempo limite.' }] }) }, 600000)
      this.waits.set(id, { thread: context, turnId: turn.id, resolve, timer })
      this.publish(context, turn, { id, method: 'item/tool/call', params: { threadId: context.id, turnId: turn.id, tool: name, arguments: args } })
    })
  }
  respond(id: number | string, result: unknown): void {
    const wait = this.waits.get(String(id))
    if (!wait) return
    this.waits.delete(String(id)); clearTimeout(wait.timer)
    const contentItems = record(result) && Array.isArray(result.contentItems) ? result.contentItems.filter(record).map(item => ({ text: typeof item.text === 'string' ? item.text : '' })) : []
    wait.resolve({ success: record(result) && result.success === true, contentItems })
  }
  private complete(context: Thread, status: string, message?: string): void {
    const turn = context.turn
    if (!turn) return
    clearTimeout(turn.timer); context.turn = undefined
    for (const [id, wait] of this.waits) if (wait.thread === context) { clearTimeout(wait.timer); this.waits.delete(id); wait.resolve({ success: false, contentItems: [{ text: 'A execução foi encerrada.' }] }) }
    this.publish(context, turn, { method: 'turn/completed', params: { threadId: context.id, turnId: turn.id, turn: { id: turn.id, status, ...(message ? { error: { message } } : {}) } } })
  }
  async steer(threadId: string, turnId: string, input: string): Promise<void> {
    const context = this.threads.get(threadId)
    if (!context || context.turn?.id !== turnId) throw new Error('A tarefa Pi já foi encerrada.')
    await context.rpc.request('steer', { message: input })
  }
  async interrupt(threadId: string, turnId: string): Promise<void> {
    const context = this.threads.get(threadId)
    if (!context || context.turn?.id !== turnId) return
    context.turn.interrupted = true
    try { await context.rpc.request('abort', {}, 5000) }
    finally { this.complete(context, 'interrupted'); this.dispose(context) }
  }
  private dispose(context: Thread): void { context.rpc.close(); context.bridge.close(); if (this.threads.get(context.id) === context) this.threads.delete(context.id) }
  close(): void { for (const context of this.threads.values()) { this.complete(context, 'interrupted'); this.dispose(context) } }
}
