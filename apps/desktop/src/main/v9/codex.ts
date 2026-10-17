import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Agent, Model } from '../../shared/v9'
import type { AgentRuntime } from './agent-runtime'

type RpcMessage = { id?: number | string; method?: string; params?: Record<string, any>; result?: any; error?: { message: string } }
export interface DynamicTool { type: 'function'; name: string; description: string; inputSchema: Record<string, unknown> }
export class CodexRuntime extends EventEmitter implements AgentRuntime {
  private process: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private nextId = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
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
    const child = spawn(process.env.POLITRON_CODEX_BINARY || (process.platform === 'win32' ? 'codex.exe' : 'codex'), args, { windowsHide: true, stdio: 'pipe' })
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
    await this.request('initialize', { clientInfo: { name: 'politron', title: 'Politron', version: '0.0.0' }, capabilities: { experimentalApi: true } })
    this.write({ method: 'initialized', params: {} })
  }
  private write(message: RpcMessage): void { if (!this.process?.stdin.writable) throw new Error('Codex não está conectado.'); this.process.stdin.write(JSON.stringify(message) + '\n') }
  request(method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<any> {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex não respondeu a ${method}.`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.write({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  respond(id: number | string, result: unknown): void { this.write({ id, result }) }
  private receive(message: RpcMessage): void {
    if (message.method) {
      this.emit('event', message); return
    }
    const pending = this.pending.get(Number(message.id))
    if (pending) { clearTimeout(pending.timer); this.pending.delete(Number(message.id)); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result) }
  }
  async models(): Promise<Model[]> {
    await this.start()
    const result = await this.request('model/list', {})
    return (result.data || []).map((model: any) => ({ id: model.id, name: model.displayName || model.model || model.id, runtime: 'codex' as const, isDefault: model.isDefault === true }))
  }
  async thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions?: string): Promise<string> {
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
    const params = { cwd: directory, model: agent.model || null, reasoningEffort: agent.effort || 'medium', sandbox: 'read-only', approvalPolicy: 'on-request', config, developerInstructions: `Você é ${agent.name}. ${agent.instructions}\nTrabalhe em português. Use somente as ferramentas disponibilizadas para acessar arquivos, navegar e colaborar. Se a tarefa precisar da análise de outro participante, use group_members e ask_agent; a resposta do colega volta diretamente para você e não inicia outro broadcast. Não execute comandos por meios alternativos. Não afirme ter feito uma ação sem resultado real de ferramenta. Sua menção é @${agent.alias}. "Pits" é o apelido carinhoso que este aplicativo usa para agente; se o usuário pedir para criar, editar ou falar com um "Pits", ele está se referindo a um agente — não pergunte o que "Pits" significa, use diretamente as ferramentas disponíveis.${projectInstructions ? `\nInstruções do projeto:\n${projectInstructions}` : ''}` }
    const result = threadId
      ? await this.request('thread/resume', { ...params, threadId })
      : await this.request('thread/start', { ...params, dynamicTools: tools })
    return result.thread.id
  }
  async send(threadId: string, input: string, model?: string, timeout = 600000): Promise<any> {
    return this.request('turn/start', { threadId, input: [{ type: 'text', text: input }], ...(model ? { model } : {}) }, timeout)
  }
  async interrupt(threadId: string, turnId: string): Promise<void> { await this.request('turn/interrupt', { threadId, turnId }) }
  close(): void {
    const child = this.process
    this.process = null; this.ready = null
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Conexão com Codex encerrada.')) }
    this.pending.clear(); child?.kill()
  }
}
