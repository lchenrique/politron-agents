import { type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Agent, Model } from '../../shared/v9'
import { SessionUnavailableError, type AgentRuntime, type RuntimeThread } from './agent-runtime'
import { buildAgentSystemPrompt } from './agent-prompt'
import { spawnCli } from './cli-launch'

type RpcMessage = { id?: number | string; method?: string; params?: Record<string, any>; result?: any; error?: { code?: number | string; message: string } }
export interface DynamicTool { type: 'function'; name: string; description: string; inputSchema: Record<string, unknown> }
export class CodexRuntime extends EventEmitter implements AgentRuntime {
  private executable: string | undefined
  private process: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private nextId = 0
  private pending = new Map<number, { method: string; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private stderr = ''
  private async configuredMcpNames(file: string): Promise<string[]> {
    try {
      const source = await readFile(file, 'utf8')
      return [...new Set([...source.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm)].map(match => match[1]))]
    } catch { return [] }
  }
  async start(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = this.initialize().catch(error => { this.ready = null; throw error })
    return this.ready
  }
  private async initialize(): Promise<void> {
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
    const inheritedServers = await this.configuredMcpNames(join(codexHome, 'config.toml'))
    const args = [
      'app-server', '--listen', 'stdio://',
      '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'apps',
      '--disable', 'computer_use', '--disable', 'browser_use', '--disable', 'browser_use_external', '--disable', 'browser_use_full_cdp_access',
      '-c', 'mcp_servers={}'
    ]
    for (const name of inheritedServers) args.push('-c', `mcp_servers.${name}.enabled=false`)
    const binary = process.env.POLITRON_CODEX_BINARY || this.executable || 'codex'
    const child = spawnCli(binary, args, { windowsHide: true, stdio: 'pipe' })
    this.process = child
    child.stderr.on('data', buffer => { this.stderr = (this.stderr + buffer.toString()).slice(-2000) })
    const reader = createInterface({ input: child.stdout })
    reader.on('line', line => { try { this.receive(JSON.parse(line)) } catch { /* Ignore non-protocol diagnostics. */ } })
    const fail = (error: Error) => {
      if (this.process !== child) return
      this.process = null; this.ready = null; reader.close()
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
      this.pending.clear(); this.emit('disconnected', error)
    }
    child.on('error', error => fail(new Error(`Não foi possível iniciar o Codex: ${error.message}`)))
    child.on('exit', code => fail(new Error(`Codex foi encerrado (${code ?? 'sem código'}). ${this.stderr}`)))
    await this.request('initialize', { clientInfo: { name: 'politron', title: 'Boobot', version: '0.0.0' }, capabilities: { experimentalApi: true } })
    this.write({ method: 'initialized', params: {} })
  }
  private write(message: RpcMessage): void { if (!this.process?.stdin.writable) throw new Error('Codex não está conectado.'); this.process.stdin.write(JSON.stringify(message) + '\n') }
  request(method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<any> {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex não respondeu a ${method}.`)) }, timeout)
      this.pending.set(id, { method, resolve, reject, timer })
      try { this.write({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  respond(id: number | string, result: unknown): void { this.write({ id, result }) }
  private receive(message: RpcMessage): void {
    if (message.method) {
      this.emit('event', message); return
    }
    const pending = this.pending.get(Number(message.id))
    if (pending) {
      clearTimeout(pending.timer); this.pending.delete(Number(message.id))
      if (message.error) {
        const staleThread = pending.method === 'thread/resume' && message.error.code === -32600 && /(?:no rollout found for thread id|thread not found|thread not loaded: [\da-f-]+)/i.test(message.error.message) && !/failed to load configuration/i.test(message.error.message)
        pending.reject(staleThread ? new SessionUnavailableError(message.error.message) : new Error(message.error.message))
      } else pending.resolve(message.result)
    }
  }
  async models(binaryPath?: string): Promise<Model[]> {
    if (binaryPath && !this.ready) this.executable = binaryPath
    await this.start()
    const models = new Map<string, Model>()
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
    const validEffort = (value: unknown): value is NonNullable<Agent['effort']> => typeof value === 'string' && ['low', 'medium', 'high', 'xhigh', 'max'].includes(value)
    for (let page = 0; page < 20; page++) {
      const result: unknown = await this.request('model/list', cursor ? { cursor } : {})
      if (!isRecord(result) || !Array.isArray(result.data)) throw new Error('O Codex devolveu um catálogo de modelos inválido.')
      for (const value of result.data) {
        if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || value.hidden === true) continue
        const supportedEfforts = Array.isArray(value.supportedReasoningEfforts)
          ? value.supportedReasoningEfforts.map(item => isRecord(item) ? item.reasoningEffort : item).filter(validEffort)
          : []
        models.set(value.id, {
          id: value.id, name: typeof value.displayName === 'string' ? value.displayName : typeof value.model === 'string' ? value.model : value.id,
          runtime: 'codex', isDefault: value.isDefault === true,
          description: typeof value.description === 'string' ? value.description : undefined,
          supportedEfforts, defaultEffort: validEffort(value.defaultReasoningEffort) ? value.defaultReasoningEffort : undefined,
        })
      }
      if (typeof result.nextCursor !== 'string' || !result.nextCursor || seenCursors.has(result.nextCursor)) break
      cursor = result.nextCursor
      seenCursors.add(cursor)
    }
    return [...models.values()]
  }
  async thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions?: string): Promise<RuntimeThread> {
    await this.start()
    // File access is mediated by the workspace tools. Built-in command execution is disabled.
    const config: Record<string, unknown> = {
      'features.shell_tool': false,
      'features.unified_exec': false,
      'features.apps': false,
      'features.computer_use': false,
      'features.browser_use': false,
      'features.browser_use_external': false,
      'features.browser_use_full_cdp_access': false,
      'features.apply_patch_freeform': false
    }
    for (const name of await this.configuredMcpNames(join(directory, '.codex', 'config.toml'))) config[`mcp_servers.${name}.enabled`] = false
    const params = { cwd: directory, model: agent.model || null, ...(agent.effort ? { reasoningEffort: agent.effort } : {}), sandbox: 'read-only', approvalPolicy: 'on-request', config, developerInstructions: buildAgentSystemPrompt(agent, projectInstructions) }
    const result = threadId
      ? await this.request('thread/resume', { ...params, threadId })
      : await this.request('thread/start', { ...params, dynamicTools: tools })
    if (typeof result?.thread?.id !== 'string' || !result.thread.id) throw new Error('O Codex não confirmou a sessão solicitada.')
    return { id: result.thread.id, history: threadId ? 'retained' : 'empty' }
  }
  async send(threadId: string, input: string, model?: string, timeout = 600000): Promise<any> {
    return this.request('turn/start', { threadId, input: [{ type: 'text', text: input }], ...(model ? { model } : {}) }, timeout)
  }
  async interrupt(threadId: string, turnId: string): Promise<void> { await this.request('turn/interrupt', { threadId, turnId }) }
  async steer(threadId: string, turnId: string, input: string): Promise<void> {
    await this.request('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text: input }] })
  }
  close(): void {
    const child = this.process
    this.process = null; this.ready = null
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Conexão com Codex encerrada.')) }
    this.pending.clear(); child?.kill()
  }
}
