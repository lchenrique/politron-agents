import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, isAbsolute, relative, resolve, sep, join } from 'node:path'
import { app, dialog, shell } from 'electron'
import { EventEmitter } from 'node:events'
import { ASSISTANT_ID, type Agent, type Conversation, type Delegation, type Message, type Project, type Run, type WorkspaceEvent } from '../../shared/v9'
import { BrowserService } from './browser'
import { WorkspaceQueue, recipients } from './routing'
import { CodexRuntime, type DynamicTool } from './codex'
import { canonicalDirectory, WorkspaceStore } from './store'

type RunContext = { run: Run; message: Message; conversation: Conversation; agent: Agent; flushTimer?: ReturnType<typeof setTimeout> }
const text = (value: unknown, max = 12000) => { if (typeof value !== 'string' || value.length > max) throw new Error('Texto de ferramenta inválido.'); return value }

export class AppService extends EventEmitter {
  readonly store: WorkspaceStore
  readonly runtime: CodexRuntime
  readonly browser = new BrowserService()
  private readonly queue = new WorkspaceQueue()
  private readonly active = new Map<string, AbortController>()
  private readonly contexts = new Map<string, RunContext>()
  private readonly completedTurns = new Set<string>()
  private readonly delegationTasks = new Map<string, Promise<string>>()
  private readonly browserRoot: string
  constructor(dataDirectory: string, runtime: CodexRuntime = new CodexRuntime()) {
    super()
    this.runtime = runtime
    this.store = new WorkspaceStore(dataDirectory)
    this.browserRoot = join(dataDirectory, 'workspaces')
    this.runtime.on('event', (event: any) => void this.onRuntimeEvent(event))
    this.browser.on('frame', frame => this.emitEvent({ type: 'browser', frame }))
    this.runtime.on('disconnected', (error: Error) => {
      for (const context of this.contexts.values()) void this.finish(context, 'failed', `Conexão com Codex encerrada: ${error.message}`)
    })
  }
  snapshot() { return this.store.snapshot() }
  saveAgent(input: Partial<Agent>) { const agent = this.store.saveAgent(input); this.emitEvent({ type: 'changed' }); return agent }
  saveProject(input: Partial<Project>) { const project = this.store.saveProject(input); this.emitEvent({ type: 'changed' }); return project }
  saveConversation(input: Partial<Conversation>) { const conversation = this.store.saveConversation(input); this.emitEvent({ type: 'changed' }); return conversation }
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
    const agents = (conversation.agentIds.length ? conversation.agentIds : [ASSISTANT_ID]).map(id => this.store.agent(id))
    if (model && !(await this.models()).some(item => item.id === model)) throw new Error('O modelo selecionado não está disponível no Codex.')
    const selected = recipients(input, agents)
    if (!selected.length) throw new Error('Não há agentes para responder nesta conversa.')
    const userMessage = this.addMessage(conversationId, null, 'user', input, 'completed', null)
    if (conversation.titleAuto) { this.store.autoTitle(conversationId, input); this.emitEvent({ type: 'changed' }) }
    const tasks: Promise<void>[] = []
    for (const agent of selected) {
      const runAgent = model ? { ...agent, model } : agent
      const run: Run = { id: randomUUID(), conversationId, agentId: agent.id, rootId: '', parentId: null, ancestry: [agent.id], status: 'queued', threadId: null, turnId: null, messageId: '', input, agent: runAgent, directory: conversation.directory, createdAt: new Date().toISOString() }
      run.rootId = run.id
      const message = this.addMessage(conversationId, agent, 'assistant', '', 'queued', run.id)
      run.messageId = message.id
      this.store.putRun(run)
      const controller = new AbortController()
      this.active.set(run.id, controller)
      tasks.push(this.queue.enqueue(conversation.directory || `conversation:${conversationId}`, controller.signal, () => this.execute({ run, message, conversation, agent: runAgent }, controller.signal)))
    }
    void userMessage
    await Promise.all(tasks)
  }
  async stop(conversationId: string): Promise<void> {
    const runs = this.store.runs().filter(run => run.conversationId === conversationId && ['queued', 'running', 'waiting'].includes(run.status))
    for (const run of runs) {
      this.active.get(run.id)?.abort()
      if (run.threadId && run.turnId) await this.runtime.interrupt(run.threadId, run.turnId).catch(() => undefined)
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
    if (run.threadId && run.turnId) await this.runtime.interrupt(run.threadId, run.turnId).catch(() => undefined)
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
  async models() { return this.runtime.models() }
  browserFrames(conversationId: string) { this.store.conversation(conversationId); return this.browser.frames(conversationId) }
  browserControl(key: string, human: boolean) { return this.browser.control(key, human) }
  browserAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }) { return this.browser.userAction(key, action) }
  async pickFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || !result.filePaths[0] ? null : canonicalDirectory(result.filePaths[0])
  }
  async openFolder(conversationId: string) { const conversation = this.store.conversation(conversationId); if (conversation.directory) await shell.openPath(conversation.directory) }
  private async execute(context: RunContext, signal: AbortSignal): Promise<void> {
    const { run, message, conversation, agent } = context
    if (signal.aborted) return
    this.contexts.set(run.id, context)
    try {
      const directory = await this.resolveDirectory(conversation, run)
      const projectInstructions = conversation.projectId ? this.store.project(conversation.projectId).instructions : ''
      const projectContext = createHash('sha256').update(projectInstructions).digest('hex').slice(0, 16)
      const bindingKey = `${conversation.id}:${agent.id}:r${agent.revision}:m${agent.model}:c${conversation.revision}:p${projectContext}`
      const threadId = await this.runtime.thread(agent, directory, this.tools(context), this.store.binding(bindingKey), projectInstructions)
      run.threadId = threadId; run.status = 'running'; this.store.putRun(run)
      this.updateMessage(message, 'running', message.text)
      const result = await this.runtime.request('turn/start', { threadId, input: [{ type: 'text', text: run.input }], ...(agent.model ? { model: agent.model } : {}) }, 600000)
      const turnId = result.turn.id as string
      run.turnId = turnId; this.store.putRun(run)
      this.store.bind(bindingKey, threadId)
      if (signal.aborted) { await this.runtime.interrupt(threadId, turnId).catch(() => undefined); throw new Error('Execução interrompida.') }
      await new Promise<void>((resolve, reject) => {
        const turnKey = `${threadId}:${turnId}`
        if (signal.aborted) { reject(new Error('Execução interrompida.')); return }
        if (this.completedTurns.has(turnKey)) { resolve(); return }
        if (result.turn.status === 'failed') { reject(new Error(result.turn.error?.message || 'Codex não conseguiu iniciar a resposta.')); return }
        if (result.turn.status === 'interrupted') { reject(new Error('Execução interrompida pelo Codex.')); return }
        const done = (event: any) => {
          if (event.method !== 'turn/completed') return
          if (event.params?.threadId !== threadId || event.params?.turn?.id !== run.turnId) return
          this.runtime.off('event', done)
          signal.removeEventListener('abort', abort)
          if (event.params.turn.status === 'failed') reject(new Error(event.params.turn.error?.message || 'Codex não concluiu a resposta.'))
          else if (event.params.turn.status === 'interrupted') reject(new Error('Execução interrompida pelo Codex.'))
          else resolve()
        }
        const abort = () => { this.runtime.off('event', done); reject(new Error('Execução interrompida.')) }
        this.runtime.on('event', done); signal.addEventListener('abort', abort, { once: true })
      })
      await this.finish(context, 'completed', message.text)
    } catch (error) {
      await this.finish(context, signal.aborted ? 'interrupted' : 'failed', message.text || (error instanceof Error ? error.message : 'Erro ao executar o agente.'))
    } finally { this.contexts.delete(run.id); this.active.delete(run.id) }
  }
  private async resolveDirectory(conversation: Conversation, run: Run): Promise<string> {
    if (conversation.directory) return canonicalDirectory(conversation.directory)!
    const directory = join(this.browserRoot, conversation.id, run.agent.id)
    await fs.mkdir(directory, { recursive: true })
    return directory
  }
  private updateMessage(message: Message, status: Message['status'], value: string) {
    const next = { ...message, text: value, status }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next })
  }
  private async finish(context: RunContext, status: Run['status'], value: string) {
    if (['completed', 'interrupted', 'failed'].includes(context.run.status)) return
    if (context.flushTimer) clearTimeout(context.flushTimer)
    context.run.status = status; this.store.putRun(context.run); this.updateMessage(context.message, status, value || (status === 'completed' ? '(Sem resposta em texto.)' : ''))
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
  private async onRuntimeEvent(event: any) {
    const params = event?.params || {}
    if (event.method === 'turn/completed' && params.threadId && params.turn?.id) this.completedTurns.add(`${params.threadId}:${params.turn.id}`)
    if (event.method === 'item/tool/call') {
      const context = [...this.contexts.values()].find(entry => entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (!context) { this.runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: 'Execução não encontrada.' }] }); return }
      try {
        const result = await this.callTool(context, params.tool, params.arguments || {}, String(event.id ?? params.toolCallId ?? ''))
        this.runtime.respond(event.id, { success: true, contentItems: [{ type: 'inputText', text: typeof result === 'string' ? result : JSON.stringify(result) }] })
      } catch (error) { this.runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : 'A ferramenta falhou.' }] }) }
      return
    }
    if (event.method === 'item/agentMessage/delta') {
      const context = [...this.contexts.values()].find(entry => entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.delta === 'string') {
        context.message.text += params.delta
        if (!context.flushTimer) context.flushTimer = setTimeout(() => { context.flushTimer = undefined; this.updateMessage(context.message, 'running', context.message.text) }, 45)
      }
    }
    if (event.method === 'item/completed' && params.item?.type === 'agentMessage') {
      const context = [...this.contexts.values()].find(entry => entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.item.text === 'string') {
        if (context.flushTimer) { clearTimeout(context.flushTimer); context.flushTimer = undefined }
        context.message.text = params.item.text
        this.updateMessage(context.message, 'running', context.message.text)
      }
    }
    if (['execCommandApproval', 'commandExecutionRequestApproval', 'applyPatchApproval', 'item/permissions/requestApproval'].includes(event.method)) {
      this.runtime.respond(event.id, { decision: 'decline' })
    }
  }
  private async callTool(context: RunContext, name: string, args: Record<string, unknown>, callId = ''): Promise<unknown> {
    const root = context.run.directory || await this.resolveDirectory(context.conversation, context.run)
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
      const target = inside(args.path)
      const content = text(args.content, 1_000_000)
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
      try { const existing = await fs.lstat(target); if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('O destino precisa ser um arquivo comum dentro da pasta do grupo.') } catch (error: any) { if (error?.code !== 'ENOENT') throw error }
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'w' })
      return `Arquivo salvo: ${relative(root, target)}`
    }
    if (name === 'group_members') return context.conversation.agentIds.map(id => { const agent = this.store.agent(id); return { name: agent.name, alias: `@${agent.alias}`, description: agent.description } })
    if (name === 'browser_open') return this.browser.open(context.conversation.id, context.agent.id, args.url)
    if (name === 'browser_observe') return this.browser.observe(context.conversation.id, context.agent.id)
    if (name === 'browser_click' || name === 'browser_fill' || name === 'browser_key' || name === 'browser_scroll') return this.browser.act(context.conversation.id, context.agent.id, name.replace('browser_', ''), args)
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
    targetConversation = this.store.saveConversation({ kind: 'direct', name: `Pedido: ${recipient.name} · ${taskLabel}`, agentIds: [recipient.id], directory: null })
    request = { id: randomUUID(), conversationId: targetConversation.id, agentId: parent.agent.id, author: `Pedido de ${parent.agent.name}`, role: 'activity', text: task, status: 'queued', runId: null, createdAt: now }
    resultMessage = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, author: recipient.name, role: 'assistant', text: '', status: 'queued', runId: null, createdAt: now }
    originMessage = { id: randomUUID(), conversationId: parent.conversation.id, agentId: recipient.id, author: recipient.name, role: 'activity', text: `Pedido para ${recipient.name}: ${task}\nAguardando execução na conversa privada do agente.`, status: 'queued', runId: null, relatedConversationId: targetConversation.id, createdAt: now }
    child = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, rootId: parent.run.rootId, parentId: parent.run.id, ancestry: [...parent.run.ancestry, recipient.id], status: 'queued', threadId: null, turnId: null, messageId: resultMessage.id, input: task, agent: recipient, directory: null, createdAt: now }
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
    for (const context of this.contexts.values()) if (context.flushTimer) clearTimeout(context.flushTimer)
    void this.browser.close(); this.runtime.close(); this.store.close()
  }
}
