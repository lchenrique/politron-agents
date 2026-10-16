import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, isAbsolute, relative, resolve, sep, join } from 'node:path'
import { app, dialog, shell, Notification, BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { ASSISTANT_ID, type Agent, type Approval, type Conversation, type Delegation, type Message, type Model, type Run, type Workspace, type WorkspaceEvent } from '../../shared/v9'
import { BrowserService } from './browser'
import { GitWorkspaceService } from './git-workspaces'
import { WorkspaceQueue, recipients } from './routing'
import { CodexRuntime, type DynamicTool } from './codex'
import { ClaudeRuntime } from './claude'
import type { AgentRuntime } from './agent-runtime'
import { ClaudeCredentialStore } from './credentials'
import { canonicalDirectory, WorkspaceStore, type AssistantPreferences } from './store'

type RunContext = { run: Run; message: Message; conversation: Conversation; agent: Agent; runtime?: AgentRuntime; signal?: AbortSignal; flushTimer?: ReturnType<typeof setTimeout> }
const text = (value: unknown, max = 12000) => { if (typeof value !== 'string' || value.length > max) throw new Error('Texto de ferramenta inválido.'); return value }

export class AppService extends EventEmitter {
  readonly store: WorkspaceStore
  readonly runtime: CodexRuntime
  readonly claudeRuntime: AgentRuntime
  readonly credentials: ClaudeCredentialStore
  readonly browser = new BrowserService()
  readonly gitWorkspaces: GitWorkspaceService
  private readonly queue = new WorkspaceQueue()
  private readonly active = new Map<string, AbortController>()
  private readonly contexts = new Map<string, RunContext>()
  private readonly completedTurns = new Set<string>()
  private readonly delegationTasks = new Map<string, Promise<string>>()
  private readonly approvalWaiters = new Map<string, (approved: boolean) => void>()
  private visibleConversationId: string | null = null
  private readonly statusTimer: ReturnType<typeof setInterval>
  constructor(dataDirectory: string, runtime: CodexRuntime = new CodexRuntime(), claudeRuntime?: AgentRuntime) {
    super()
    this.runtime = runtime
    this.store = new WorkspaceStore(dataDirectory)
    this.credentials = new ClaudeCredentialStore(dataDirectory)
    this.claudeRuntime = claudeRuntime || new ClaudeRuntime(dataDirectory, () => this.credentials.load())
    this.gitWorkspaces = new GitWorkspaceService(join(dataDirectory, 'worktrees'))
    this.statusTimer = setInterval(() => void this.refreshWorkspaceStatuses(), 5000)
    this.statusTimer.unref?.()
    this.runtime.on('event', (event: any) => void this.onRuntimeEvent(event, this.runtime))
    this.claudeRuntime.on('event', (event: any) => void this.onRuntimeEvent(event, this.claudeRuntime))
    this.browser.on('frame', frame => this.emitEvent({ type: 'browser', frame }))
    this.runtime.on('disconnected', (error: Error) => {
      for (const context of this.contexts.values()) void this.finish(context, 'failed', `Conexão com Codex encerrada: ${error.message}`)
    })
  }
  snapshot() { return this.store.snapshot() }
  private runtimeFor(name: Agent['runtime']): AgentRuntime { return name === 'claude' ? this.claudeRuntime : this.runtime }
  private async refreshWorkspaceStatuses() {
    for (const workspace of this.store.workspaces()) {
      if (workspace.archived) continue
      try {
        const info = await this.gitWorkspaces.inspect(workspace.path)
        if (info.branch !== workspace.branch || info.changes !== workspace.changes) {
          this.store.updateWorkspace({ ...workspace, ...info }); this.emitEvent({ type: 'changed' })
        }
      } catch { /* pasta removida ou inacessível: preserva o último estado salvo */ }
    }
  }
  saveAgent(input: Partial<Agent>) { const agent = this.store.saveAgent(input); this.emitEvent({ type: 'changed' }); return agent }
  saveAssistantPreferences(input: Partial<AssistantPreferences>) { const assistant = this.store.saveAssistantPreferences(input); this.emitEvent({ type: 'changed' }); return assistant }
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }) { const conversation = this.store.saveConversation(input); this.emitEvent({ type: 'changed' }); return conversation }
  async saveWorkspace(input: Partial<Workspace> & { path?: string | null }) {
    let info: { branch?: string | null; changes?: number } = {}
    if (input.path !== undefined) {
      const path = canonicalDirectory(input.path)
      if (path) info = await this.gitWorkspaces.inspect(path).catch(() => ({ branch: null, changes: 0 }))
    }
    const workspace = this.store.saveWorkspace({ ...input, ...info })
    this.emitEvent({ type: 'changed' }); return workspace
  }
  async createWorktree(input: { sourceWorkspaceId: string; branch: string; baseBranch?: string }) {
    const source = this.store.workspace(input.sourceWorkspaceId)
    if (source.archived) throw new Error('Escolha um workspace ativo como origem.')
    const created = await this.gitWorkspaces.createWorktree({ sourcePath: source.path, workspaceName: source.name, workspaceId: source.id, branch: input.branch, baseBranch: input.baseBranch || source.branch || undefined })
    const workspace = this.store.saveWorkspace({ name: input.branch, parentWorkspaceId: source.id, kind: 'worktree', path: created.path, branch: created.branch, baseBranch: created.baseBranch, changes: 0, archived: false })
    this.emitEvent({ type: 'changed' }); return workspace
  }
  async archiveWorkspace(workspaceId: string, preserveDirtyWorktree = false) {
    const workspace = this.store.workspace(workspaceId)
    if (workspace.kind === 'worktree' && !workspace.archived) {
      const status = await this.gitWorkspaces.inspect(workspace.path)
      if (status.changes && !preserveDirtyWorktree) throw new Error('Este worktree tem alterações locais. Confirme o arquivamento preservando a pasta para não perder esses arquivos.')
      if (!preserveDirtyWorktree) await this.gitWorkspaces.removeWorktree(workspace.path)
    }
    this.store.updateWorkspace({ ...workspace, archived: true })
    this.emitEvent({ type: 'changed' })
  }
  private descendantWorkspaceIds(id: string): string[] {
    const ids = [id]
    for (const child of this.store.workspaces().filter(item => item.parentWorkspaceId === id)) ids.push(...this.descendantWorkspaceIds(child.id))
    return ids
  }
  async deleteWorkspace(workspaceId: string) {
    const workspace = this.store.workspace(workspaceId)
    const ids = this.descendantWorkspaceIds(workspaceId)
    for (const conversation of this.store.conversations().filter(item => ids.includes(item.workspaceId))) await this.stop(conversation.id)
    if (workspace.kind === 'worktree') await this.gitWorkspaces.removeWorktree(workspace.path).catch(() => undefined)
    this.store.deleteWorkspace(workspaceId, { cascade: true })
    this.emitEvent({ type: 'changed' })
  }
  async deleteConversation(conversationId: string) {
    await this.stop(conversationId)
    this.store.deleteConversation(conversationId)
    this.emitEvent({ type: 'changed' })
  }
  deleteAgent(agentId: string) {
    this.store.deleteAgent(agentId)
    this.emitEvent({ type: 'changed' })
  }
  workspacePath(workspaceId: string) { const workspace = this.store.workspace(workspaceId); if (workspace.archived) throw new Error('Este workspace está arquivado.'); return workspace.path }
  workspaceDiff(workspaceId: string) { return this.gitWorkspaces.diff(this.workspacePath(workspaceId)) }
  setVisibleConversation(conversationId: string | null) { if (conversationId !== null) this.store.conversation(conversationId); this.visibleConversationId = conversationId }
  private notifyWhenAway(conversationId: string, title: string, body: string) {
    const focusedConversation = this.visibleConversationId === conversationId && BrowserWindow.getAllWindows().some(window => !window.isDestroyed() && window.isFocused())
    if (!focusedConversation && Notification.isSupported()) new Notification({ title, body }).show()
  }
  async respondApproval(approvalId: string, approved: boolean) {
    const approval = this.store.approval(approvalId)
    if (!approval || approval.status !== 'pending') throw new Error('Esta aprovação não está mais pendente.')
    if (typeof approved !== 'boolean') throw new Error('Decisão de aprovação inválida.')
    const updated = { ...approval, status: approved ? 'approved' as const : 'denied' as const, resolvedAt: new Date().toISOString() }
    this.store.putApproval(updated); this.emitEvent({ type: 'approval', approval: updated })
    const context = this.contexts.get(approval.runId)
    if (context) {
      context.run.status = 'running'; this.store.putRun(context.run)
      this.updateMessage(context.message, 'running', context.message.text)
    }
    const resolveApproval = this.approvalWaiters.get(approvalId)
    if (!resolveApproval) throw new Error('A execução desta aprovação não está ativa. Ela não será repetida automaticamente.')
    this.approvalWaiters.delete(approvalId); resolveApproval(approved)
  }
  private async requestApproval(context: RunContext, kind: Approval['kind'], details: Approval['details']): Promise<boolean> {
    if (context.agent.approvalMode === 'automatic') return true
    const approval: Approval = { id: randomUUID(), runId: context.run.id, conversationId: context.conversation.id, agentId: context.agent.id, kind, details, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null }
    this.store.putApproval(approval)
    context.run.status = 'waiting'; this.store.putRun(context.run)
    this.updateMessage(context.message, 'waiting', context.message.text)
    this.emitEvent({ type: 'approval', approval })
    this.notifyWhenAway(context.conversation.id, 'Politron precisa da sua atenção', `${context.agent.name} aguarda aprovação para ${kind === 'write' ? 'alterar um arquivo' : 'usar o navegador'}.`)
    if (context.signal?.aborted) {
      const interrupted = { ...approval, status: 'interrupted' as const, resolvedAt: new Date().toISOString() }
      this.store.putApproval(interrupted); this.emitEvent({ type: 'approval', approval: interrupted }); return false
    }
    return new Promise(resolveApproval => {
      const abort = () => {
        const pending = this.store.approval(approval.id)
        if (pending?.status === 'pending') {
          const interrupted = { ...pending, status: 'interrupted' as const, resolvedAt: new Date().toISOString() }
          this.store.putApproval(interrupted); this.emitEvent({ type: 'approval', approval: interrupted })
        }
        this.approvalWaiters.delete(approval.id); resolveApproval(false)
      }
      this.approvalWaiters.set(approval.id, resolveApproval)
      context.signal?.addEventListener('abort', abort, { once: true })
    })
  }
  history(id: string) { this.store.conversation(id); return this.store.history(id) }
  private emitEvent(event: WorkspaceEvent) { this.emit('workspace-event', event) }
  private addMessage(conversationId: string, agent: Agent | null, role: Message['role'], value: string, status: Message['status'], runId: string | null) {
    const message: Message = { id: randomUUID(), conversationId, agentId: agent?.id || null, author: agent?.name || (role === 'user' ? 'Você' : 'Sistema'), role, text: value, status, runId, createdAt: new Date().toISOString() }
    this.store.putMessage(message); this.emitEvent({ type: 'message', message }); return message
  }
  async send(conversationId: string, value: string, model?: string): Promise<void> {
    const input = text(value, 100000).trim()
    if (!input) return
    const conversation = this.store.conversation(conversationId)
    if (conversation.archived) throw new Error('Esta conversa está arquivada.')
    const workspace = this.store.workspace(conversation.workspaceId)
    if (workspace.archived) throw new Error('O workspace desta conversa está arquivado.')
    const agents = (conversation.agentIds.length ? conversation.agentIds : [ASSISTANT_ID]).map(id => this.store.agent(id))
    const selectedRuntime = model?.includes(':') ? model.slice(0, model.indexOf(':')) as Agent['runtime'] : undefined
    const selectedModel = selectedRuntime ? model!.slice(model!.indexOf(':') + 1) : model
    if (selectedRuntime && selectedRuntime !== 'codex' && selectedRuntime !== 'claude') throw new Error('Motor selecionado inválido.')
    if (selectedModel) {
      const available = await this.runtimeFor(selectedRuntime || agents[0]?.runtime || 'codex').models()
      if (!available.some(item => item.id === selectedModel)) throw new Error(`O modelo selecionado não está disponível no ${selectedRuntime === 'claude' ? 'Claude' : 'Codex'}.`)
    }
    const selected = recipients(input, agents)
    if (!selected.length) throw new Error('Não há agentes para responder nesta conversa.')
    const turnAlreadyActive = this.store.runs().some(run => run.conversationId === conversationId && ['queued', 'running', 'waiting'].includes(run.status))
    const userMessage = this.addMessage(conversationId, null, 'user', input, turnAlreadyActive ? 'queued' : 'completed', null)
    if (conversation.titleAuto) { this.store.autoTitle(conversationId, input); this.emitEvent({ type: 'changed' }) }
    const tasks: Promise<void>[] = []
    for (const agent of selected) {
      const runAgent = selectedModel ? { ...agent, ...(selectedRuntime ? { runtime: selectedRuntime } : {}), model: selectedModel } : agent
      const run: Run = { id: randomUUID(), conversationId, agentId: agent.id, rootId: '', parentId: null, ancestry: [agent.id], status: 'queued', threadId: null, turnId: null, messageId: '', input, agent: runAgent, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: new Date().toISOString() }
      run.rootId = run.id
      const message = this.addMessage(conversationId, agent, 'assistant', '', 'queued', run.id)
      run.messageId = message.id
      this.store.putRun(run)
      const controller = new AbortController()
      this.active.set(run.id, controller)
      tasks.push(this.queue.enqueue(workspace.path, controller.signal, () => this.execute({ run, message, conversation, agent: runAgent }, controller.signal)))
    }
    void userMessage
    await Promise.all(tasks)
  }
  async stop(conversationId: string): Promise<void> {
    const runs = this.store.runs().filter(run => run.conversationId === conversationId && ['queued', 'running', 'waiting'].includes(run.status))
    for (const run of runs) {
      this.active.get(run.id)?.abort()
      if (run.threadId && run.turnId) await this.runtimeFor(run.agent.runtime).interrupt(run.threadId, run.turnId).catch(() => undefined)
      const context = this.contexts.get(run.id)
      if (context) await this.finish(context, 'interrupted', context.message.text)
      else {
        this.store.putRun({ ...run, status: 'interrupted' })
        const message = this.store.message(run.messageId)
        if (message) { const next = { ...message, status: 'interrupted' as const }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next }) }
        this.active.delete(run.id)
      }
    }
  }
  async cancelDelegation(delegationId: string): Promise<void> {
    const delegation = this.store.delegation(delegationId)
    if (!delegation) throw new Error('Pedido entre agentes não encontrado.')
    if (!['queued', 'running', 'waiting'].includes(delegation.status)) return
    const run = this.store.runs().find(item => item.id === delegation.childRunId)
    if (!run) throw new Error('A execução associada ao pedido não foi encontrada.')
    this.active.get(run.id)?.abort()
    if (run.threadId && run.turnId) await this.runtimeFor(run.agent.runtime).interrupt(run.threadId, run.turnId).catch(() => undefined)
    const context = this.contexts.get(run.id)
    if (context) await this.finish(context, 'interrupted', context.message.text || 'Pedido cancelado.')
    else {
      this.store.putRun({ ...run, status: 'interrupted' })
      const result = this.store.message(delegation.resultMessageId)
      if (result) { const next = { ...result, status: 'interrupted' as const, text: result.text || 'Pedido cancelado.' }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next }) }
    }
    const updated = { ...delegation, status: 'interrupted' as const, error: 'Pedido cancelado pelo usuário.', updatedAt: new Date().toISOString() }
    this.store.putDelegation(updated)
    for (const id of [delegation.sourceMessageId, delegation.requestMessageId]) {
      const message = this.store.message(id)
      if (message) { const next = { ...message, status: 'interrupted' as const, text: `${message.text.split('\n')[0]}\nPedido cancelado pelo usuário.` }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next }) }
    }
  }
  async hasClaudeCredential() { return this.credentials.has() }
  async saveClaudeCredential(apiKey: string) { await this.credentials.save(apiKey) }
  async models(runtimeName?: Agent['runtime']): Promise<Model[]> {
    const withProvider = (name: Agent['runtime'], models: Model[]) => models.map(model => ({ ...model, runtime: name, id: `${name}:${model.id}`, name: `${model.name} · ${name === 'claude' ? 'Claude' : 'Codex'}` }))
    if (runtimeName) return withProvider(runtimeName, await this.runtimeFor(runtimeName).models())
    const codexModels = withProvider('codex', await this.runtime.models())
    if (!await this.credentials.has()) return codexModels
    try { return [...codexModels, ...withProvider('claude', await this.claudeRuntime.models())] }
    catch { return codexModels }
  }
  browserFrames(conversationId: string) { this.store.conversation(conversationId); return this.browser.frames(conversationId) }
  browserControl(key: string, human: boolean) { return this.browser.control(key, human) }
  browserAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }) { return this.browser.userAction(key, action) }
  async pickFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || !result.filePaths[0] ? null : canonicalDirectory(result.filePaths[0])
  }
  async openFolder(conversationId: string) { const conversation = this.store.conversation(conversationId); const workspace = this.store.workspace(conversation.workspaceId); const error = await shell.openPath(workspace.path); if (error) throw new Error(error) }
  private async execute(context: RunContext, signal: AbortSignal): Promise<void> {
    const { run, message, conversation, agent } = context
    if (signal.aborted) return
    for (const queued of this.store.history(conversation.id).filter(item => item.role === 'user' && item.status === 'queued')) {
      const next = { ...queued, status: 'completed' as const }
      this.store.putMessage(next); this.emitEvent({ type: 'message', message: next })
    }
    this.contexts.set(run.id, context)
    context.signal = signal
    try {
      const runtime = this.runtimeFor(agent.runtime)
      context.runtime = runtime
      const directory = run.workspacePath
      await fs.mkdir(directory, { recursive: true })
      const workspaceInstructions = this.store.workspace(run.workspaceId).instructions
      const workspaceContext = createHash('sha256').update(workspaceInstructions).digest('hex').slice(0, 16)
      const bindingKey = `${conversation.id}:${agent.id}:w${run.workspaceId}:r${agent.revision}:m${agent.model}:c${conversation.revision}:p${workspaceContext}`
      const threadId = await runtime.thread(agent, directory, this.tools(context), this.store.binding(bindingKey), workspaceInstructions)
      run.threadId = threadId; run.status = 'running'; this.store.putRun(run)
      this.updateMessage(message, 'running', message.text)
      const result = await runtime.send(threadId, run.input, agent.model || undefined, 600000)
      if (result.thread?.id) { run.threadId = result.thread.id; this.store.putRun(run) }
      const turnId = result.turn.id as string
      run.turnId = turnId; this.store.putRun(run)
      this.store.bind(bindingKey, run.threadId || threadId)
      if (signal.aborted) { await runtime.interrupt(run.threadId || threadId, turnId).catch(() => undefined); throw new Error('Execução interrompida.') }
      await new Promise<void>((resolve, reject) => {
        const turnKey = `${run.threadId || threadId}:${turnId}`
        if (signal.aborted) { reject(new Error('Execução interrompida.')); return }
        if (this.completedTurns.has(turnKey) || this.completedTurns.has(`${threadId}:${turnId}`)) { resolve(); return }
        if (result.turn.status === 'failed') { reject(new Error(result.turn.error?.message || 'Codex não conseguiu iniciar a resposta.')); return }
        if (result.turn.status === 'interrupted') { reject(new Error('Execução interrompida pelo Codex.')); return }
        const done = (event: any) => {
          if (event.method !== 'turn/completed') return
          if (event.params?.turn?.id !== run.turnId) return
          runtime.off('event', done)
          signal.removeEventListener('abort', abort)
          if (event.params.turn.status === 'failed') reject(new Error(event.params.turn.error?.message || 'Codex não concluiu a resposta.'))
          else if (event.params.turn.status === 'interrupted') reject(new Error('Execução interrompida pelo Codex.'))
          else resolve()
        }
        const abort = () => { runtime.off('event', done); reject(new Error('Execução interrompida.')) }
        runtime.on('event', done); signal.addEventListener('abort', abort, { once: true })
      })
      await this.finish(context, 'completed', message.text)
    } catch (error) {
      await this.finish(context, signal.aborted ? 'interrupted' : 'failed', message.text || (error instanceof Error ? error.message : 'Erro ao executar o agente.'))
    } finally { this.contexts.delete(run.id); this.active.delete(run.id) }
  }
  private updateMessage(message: Message, status: Message['status'], value: string) {
    const next = { ...message, text: value, status }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next })
  }
  private async finish(context: RunContext, status: Run['status'], value: string) {
    if (['completed', 'interrupted', 'failed'].includes(context.run.status)) return
    if (context.flushTimer) clearTimeout(context.flushTimer)
    context.run.status = status; this.store.putRun(context.run); this.updateMessage(context.message, status, value || (status === 'completed' ? '(Sem resposta em texto.)' : ''))
    if (status === 'completed') this.notifyWhenAway(context.conversation.id, 'Tarefa concluída', `${context.agent.name} concluiu a resposta.`)
    else if (status === 'failed') this.notifyWhenAway(context.conversation.id, 'Tarefa precisa de atenção', `${context.agent.name} não conseguiu concluir a resposta.`)
  }
  private tools(context: RunContext): DynamicTool[] {
    const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): DynamicTool => ({ type: 'function', name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } })
    return [
      tool('workspace_list', 'Lista arquivos e pastas dentro da pasta deste grupo.', { path: { type: 'string', description: 'Caminho relativo; use . para a raiz.' } }, ['path']),
      tool('workspace_read', 'Lê um arquivo de texto dentro da pasta deste grupo.', { path: { type: 'string' } }, ['path']),
      ...(context.agent.canWrite ? [tool('workspace_write', 'Cria ou substitui um arquivo de texto dentro da pasta deste grupo.', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content'])] : []),
      ...(context.agent.computerUse ? [
        tool('browser_open', 'Abre um endereço HTTP ou HTTPS na sessão privada deste agente.', { url: { type: 'string' } }, ['url']),
        tool('browser_observe', 'Lê o conteúdo visível e os controles da página aberta pelo agente.', {}, []),
        tool('browser_click', 'Clica em um seletor CSS ou em uma posição dentro da página.', { selector: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, []),
        tool('browser_fill', 'Preenche um campo da página com texto.', { selector: { type: 'string' }, text: { type: 'string' } }, ['selector', 'text']),
        tool('browser_key', 'Pressiona uma tecla comum na página, como Enter, Tab ou Escape.', { key: { type: 'string' } }, ['key']),
        tool('browser_scroll', 'Rola a página aberta.', { deltaY: { type: 'number' } }, ['deltaY'])
      ] : []),
      tool('group_members', 'Mostra os agentes deste grupo e suas descrições.', {}, []),
      tool('ask_agent', 'Pede a outro agente cadastrado uma análise ou tarefa. O pedido será executado em uma conversa privada, com as instruções e permissões próprias do destinatário, e o resultado voltará diretamente a você.', { agent: { type: 'string', description: 'Nome ou menção do agente.' }, task: { type: 'string', description: 'Pedido concreto. Inclua somente o contexto necessário; a conversa de origem não será compartilhada.' } }, ['agent', 'task'])
    ]
  }
  private async onRuntimeEvent(event: any, runtime: AgentRuntime) {
    const params = event?.params || {}
    if (event.method === 'turn/completed' && params.threadId && params.turn?.id) this.completedTurns.add(`${params.threadId}:${params.turn.id}`)
    if (event.method === 'item/tool/call') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (!context) { runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: 'Execução não encontrada.' }] }); return }
      try {
        const result = await this.callTool(context, params.tool, params.arguments || {}, String(event.id ?? params.toolCallId ?? ''))
        runtime.respond(event.id, { success: true, contentItems: [{ type: 'inputText', text: typeof result === 'string' ? result : JSON.stringify(result) }] })
      } catch (error) { runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : 'A ferramenta falhou.' }] }) }
      return
    }
    if (event.method === 'item/agentMessage/delta') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.delta === 'string') {
        context.message.text += params.delta
        if (!context.flushTimer) context.flushTimer = setTimeout(() => { context.flushTimer = undefined; this.updateMessage(context.message, 'running', context.message.text) }, 45)
      }
    }
    if (event.method === 'item/completed' && params.item?.type === 'agentMessage') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.item.text === 'string') {
        if (context.flushTimer) { clearTimeout(context.flushTimer); context.flushTimer = undefined }
        context.message.text = params.item.text
        this.updateMessage(context.message, 'running', context.message.text)
      }
    }
    if (['execCommandApproval', 'commandExecutionRequestApproval', 'applyPatchApproval', 'item/permissions/requestApproval'].includes(event.method)) {
      runtime.respond(event.id, { decision: 'decline' })
    }
  }
  private async callTool(context: RunContext, name: string, args: Record<string, unknown>, callId = ''): Promise<unknown> {
    const root = context.run.workspacePath
    const inside = (input: unknown) => {
      const rel = text(input, 1000)
      if (isAbsolute(rel)) throw new Error('Use um caminho relativo à pasta do grupo.')
      const target = resolve(root, rel)
      const back = relative(root, target)
      if (back === '..' || back.startsWith(`..${sep}`) || isAbsolute(back)) throw new Error('O caminho sai da pasta do grupo.')
      return target
    }
    if (name === 'workspace_list') {
      const target = inside(args.path || '.')
      const actual = await fs.realpath(target)
      if (actual !== root && !actual.startsWith(root + sep)) throw new Error('Essa pasta aponta para fora da pasta do grupo.')
      const entries = await fs.readdir(actual, { withFileTypes: true })
      return entries.slice(0, 300).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
    }
    if (name === 'workspace_read') {
      const target = inside(args.path)
      const actual = await fs.realpath(target)
      if (actual !== root && !actual.startsWith(root + sep)) throw new Error('Esse arquivo aponta para fora da pasta do grupo.')
      const data = await fs.readFile(actual)
      if (data.length > 1024 * 1024) throw new Error('O arquivo excede o limite de leitura de 1 MB.')
      if (data.includes(0)) throw new Error('Esse arquivo parece binário e não pode ser lido como texto.')
      return data.toString('utf8')
    }
    if (name === 'workspace_write') {
      if (!context.agent.canWrite) throw new Error('Este agente não tem permissão para escrever arquivos.')
      let relativePath = typeof args.path === 'string' ? args.path.slice(0, 1000).replace(/\\/g, '/') : '(caminho inválido)'
      const toolCallId = callId || randomUUID()
      const record = (status: 'applied' | 'failed' | 'unknown' | 'unchanged', before: string, after: string, binary: boolean, truncated: boolean) => {
        const oldLines = before ? before.split('\n') : []
        const newLines = after ? after.split('\n') : []
        let prefix = 0
        while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++
        let suffix = 0
        while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++
        const value = { id: randomUUID(), runId: context.run.id, messageId: context.message.id, toolCallId, agentId: context.agent.id, workspaceId: context.run.workspaceId, path: relativePath, status, before, after, additions: Math.max(0, newLines.length - prefix - suffix), deletions: Math.max(0, oldLines.length - prefix - suffix), truncated, binary, createdAt: new Date().toISOString() }
        if (this.store.putFileChange(value)) this.emitEvent({ type: 'fileChange', fileChange: value })
      }
      let before = ''
      let binary = false
      let truncated = false
      let target: string
      let content: string
      try {
        target = inside(args.path)
        relativePath = relative(root, target)
        content = text(args.content, 1_000_000)
      } catch (error) { record('failed', '', '', false, false); throw error }
      const parentPath = resolve(target, '..')
      let nearest = parentPath
      while (true) {
        try { await fs.lstat(nearest); break } catch (error: any) { if (error?.code !== 'ENOENT') throw error; const next = resolve(nearest, '..'); if (next === nearest) throw new Error('Não foi possível validar a pasta de destino.'); nearest = next }
      }
      const nearestReal = await fs.realpath(nearest)
      if (nearestReal !== root && !nearestReal.startsWith(root + sep)) throw new Error('A pasta de destino aponta para fora do grupo.')
      await fs.mkdir(parentPath, { recursive: true })
      const parent = await fs.realpath(parentPath)
      if (parent !== root && !parent.startsWith(root + sep)) throw new Error('A pasta de destino aponta para fora do grupo.')
      try {
        const existing = await fs.lstat(target)
        if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('O destino precisa ser um arquivo comum dentro da pasta do workspace.')
        const original = await fs.readFile(target)
        binary = original.includes(0)
        truncated = original.length > 200_000 || Buffer.byteLength(content) > 200_000
        if (!binary) before = original.subarray(0, 200_000).toString('utf8')
      } catch (error: any) { if (error?.code !== 'ENOENT') { record('failed', before, '', binary, truncated); throw error } }
      if (!binary && before === content) { record('unchanged', before, content.slice(0, 200_000), false, truncated); return `Sem alterações: ${relativePath}` }
      if (!await this.requestApproval(context, 'write', { path: relativePath, before: binary ? '' : before, after: content.slice(0, 200_000), truncated: truncated || content.length > 200_000 })) {
        record('failed', before, before, binary, truncated)
        return `Alteração negada pelo usuário: ${relativePath}`
      }
      let writeStarted = false
      try {
        writeStarted = true
        await fs.writeFile(target, content, { encoding: 'utf8', flag: 'w' })
        const written = await fs.readFile(target)
        const afterBinary = written.includes(0)
        const after = afterBinary ? '' : written.subarray(0, 200_000).toString('utf8')
        record('applied', before, after, binary || afterBinary, truncated || written.length > 200_000)
      } catch (error) {
        record(writeStarted ? 'unknown' : 'failed', before, '', binary, truncated)
        throw error
      }
      return `Arquivo salvo: ${relative(root, target)}`
    }
    if (name === 'group_members') return context.conversation.agentIds.map(id => { const agent = this.store.agent(id); return { name: agent.name, alias: `@${agent.alias}`, description: agent.description } })
    if (name === 'browser_open') {
      if (!await this.requestApproval(context, 'browser', { action: `Abrir ${text(args.url, 2000)}` })) return 'Ação de navegador negada pelo usuário.'
      return this.browser.open(context.conversation.id, context.agent.id, args.url)
    }
    if (name === 'browser_observe') return this.browser.observe(context.conversation.id, context.agent.id)
    if (name === 'browser_click' || name === 'browser_fill' || name === 'browser_key' || name === 'browser_scroll') {
      if (!await this.requestApproval(context, 'browser', { action: `${name.replace('browser_', '')}: ${JSON.stringify(args).slice(0, 1000)}` })) return 'Ação de navegador negada pelo usuário.'
      return this.browser.act(context.conversation.id, context.agent.id, name.replace('browser_', ''), args)
    }
    if (name === 'ask_agent') {
      const requested = text(args.agent, 100).replace(/^@/, '').toLocaleLowerCase('pt-BR')
      const task = text(args.task, 5000)
      const candidate = this.store.agents().find(agent => agent.id !== context.agent.id && (agent.alias.toLocaleLowerCase('pt-BR') === requested || agent.name.toLocaleLowerCase('pt-BR') === requested))
      if (!candidate) throw new Error('Esse agente não existe ou não pode receber um pedido de si mesmo.')
      if (context.run.ancestry.includes(candidate.id)) throw new Error('Essa delegação criaria um ciclo de agentes.')
      if (context.run.ancestry.length >= 4) throw new Error('A delegação atingiu o limite de profundidade.')
      const idempotencyKey = `${context.run.id}:${callId || `${candidate.id}:${task}`}`
      const existing = this.store.delegationByKey(idempotencyKey)
      if (existing) {
        if (existing.status === 'completed') return existing.result
        if (existing.status === 'failed' || existing.status === 'interrupted') throw new Error(existing.error || `O pedido anterior terminou como ${existing.status}.`)
        const pending = this.delegationTasks.get(idempotencyKey)
        if (pending) return pending
        throw new Error('Este pedido está persistido como em andamento, mas não há execução ativa. Não será repetido automaticamente.')
      }
      const pending = this.delegate(context, candidate, task, idempotencyKey)
      this.delegationTasks.set(idempotencyKey, pending)
      try { return await pending } finally { this.delegationTasks.delete(idempotencyKey) }
    }
    throw new Error(`Ferramenta desconhecida: ${name}`)
  }
  private async delegate(parent: RunContext, recipient: Agent, task: string, idempotencyKey: string): Promise<string> {
    const now = new Date().toISOString()
    const taskLabel = task.replace(/\s+/g, ' ').slice(0, 52)
    this.store.db.exec('BEGIN IMMEDIATE')
    let targetConversation: Conversation
    let request: Message, resultMessage: Message, originMessage: Message, child: Run, delegation: Delegation
    try {
    targetConversation = this.store.saveConversation({ kind: 'direct', name: `Pedido: ${recipient.name} · ${taskLabel}`, agentIds: [recipient.id] })
    request = { id: randomUUID(), conversationId: targetConversation.id, agentId: parent.agent.id, author: `Pedido de ${parent.agent.name}`, role: 'activity', text: task, status: 'queued', runId: null, createdAt: now }
    resultMessage = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, author: recipient.name, role: 'assistant', text: '', status: 'queued', runId: null, createdAt: now }
    originMessage = { id: randomUUID(), conversationId: parent.conversation.id, agentId: recipient.id, author: recipient.name, role: 'activity', text: `Pedido para ${recipient.name}: ${task}\nAguardando execução na conversa privada do agente.`, status: 'queued', runId: null, relatedConversationId: targetConversation.id, createdAt: now }
    const targetWorkspace = this.store.workspace(targetConversation.workspaceId)
    child = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, rootId: parent.run.rootId, parentId: parent.run.id, ancestry: [...parent.run.ancestry, recipient.id], status: 'queued', threadId: null, turnId: null, messageId: resultMessage.id, input: task, agent: recipient, workspaceId: targetWorkspace.id, workspacePath: targetWorkspace.path, createdAt: now }
    delegation = { id: randomUUID(), idempotencyKey, rootRunId: parent.run.rootId, parentRunId: parent.run.id, childRunId: child.id, requesterAgentId: parent.agent.id, recipientAgentId: recipient.id, sourceConversationId: parent.conversation.id, targetConversationId: targetConversation.id, sourceMessageId: originMessage.id, requestMessageId: request.id, resultMessageId: resultMessage.id, task, status: 'queued', result: '', error: '', createdAt: now, updatedAt: now }
    request.delegationId = delegation.id; request.relatedConversationId = parent.conversation.id
    resultMessage.delegationId = delegation.id; resultMessage.relatedConversationId = parent.conversation.id
    originMessage.delegationId = delegation.id
    child.messageId = resultMessage.id
    this.store.putDelegation(delegation); this.store.putRun(child)
    this.store.putMessage(request); this.store.putMessage(resultMessage); this.store.putMessage(originMessage)
    this.store.db.exec('COMMIT')
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
    this.emitEvent({ type: 'changed' }); this.emitEvent({ type: 'message', message: request }); this.emitEvent({ type: 'message', message: resultMessage }); this.emitEvent({ type: 'message', message: originMessage })
    const runningOrigin = { ...originMessage, status: 'running' as const, text: `Pedido para ${recipient.name}: ${task}\nExecutando na conversa privada do agente.` }
    const runningRequest = { ...request, status: 'running' as const }
    const parentController = this.active.get(parent.run.id)
    const controller = new AbortController()
    const abortFromParent = () => controller.abort()
    if (parentController?.signal.aborted) controller.abort()
    else parentController?.signal.addEventListener('abort', abortFromParent, { once: true })
    this.active.set(child.id, controller)
    const signal = controller.signal
    const context = { run: child, message: resultMessage, conversation: targetConversation, agent: recipient }
    try { await this.queue.enqueue(`delegation:${delegation.id}`, signal, async () => {
      if (signal.aborted) return
      delegation.status = 'running'; delegation.updatedAt = new Date().toISOString(); this.store.putDelegation(delegation)
      child.status = 'running'; this.store.putRun(child)
      this.store.putMessage(runningOrigin); this.emitEvent({ type: 'message', message: runningOrigin })
      this.store.putMessage(runningRequest); this.emitEvent({ type: 'message', message: runningRequest })
      await this.execute(context, signal)
    }) }
    finally { parentController?.signal.removeEventListener('abort', abortFromParent); this.active.delete(child.id) }
    if (signal.aborted && child.status === 'queued') {
      child.status = 'interrupted'; this.store.putRun(child)
      this.updateMessage(resultMessage, 'interrupted', 'Pedido cancelado antes do início.')
    }
    const completed = this.store.runs().find(run => run.id === child.id)!
    const result = this.store.message(resultMessage.id)?.text || ''
    delegation.status = completed.status; delegation.result = completed.status === 'completed' ? result : ''; delegation.error = completed.status === 'completed' ? '' : result || `O pedido terminou como ${completed.status}.`; delegation.updatedAt = new Date().toISOString(); this.store.putDelegation(delegation)
    const finalOrigin = { ...runningOrigin, status: completed.status, text: completed.status === 'completed' ? `Pedido concluído por ${recipient.name}. Resultado disponível na conversa relacionada.\n\n${result}` : `Pedido para ${recipient.name}: ${task}\n${completed.status === 'interrupted' ? 'Cancelado.' : `Falhou: ${delegation.error}`}` }
    const finalRequest = { ...runningRequest, status: completed.status }
    this.store.putMessage(finalOrigin); this.emitEvent({ type: 'message', message: finalOrigin }); this.store.putMessage(finalRequest); this.emitEvent({ type: 'message', message: finalRequest })
    if (completed.status !== 'completed') throw new Error(delegation.error || `${recipient.name} não concluiu o pedido.`)
    return result
  }
  dispose() {
    clearInterval(this.statusTimer)
    for (const context of this.contexts.values()) if (context.flushTimer) clearTimeout(context.flushTimer)
    void this.browser.close(); this.runtime.close(); this.claudeRuntime.close(); this.store.close()
  }
}
