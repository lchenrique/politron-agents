import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, extname, isAbsolute, relative, resolve, sep, join } from 'node:path'
import { app, dialog, shell, Notification, BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { listProjectDirectory, readProjectText, writeProjectText } from './project-files'
import { captureFileVersion, commitFileWrite, fileContentMatches, FileVersionConflictError } from './guarded-write'
import { buildTurnContext, messageDigest } from './conversation-context'
import { fingerprintTools, TOOL_BROKER_VERSION } from './tool-contract'
import { delegationEligibility } from './delegation-eligibility'
import { createCommandEvidence, formatCommandEvidence } from './command-evidence'
import { AgentTerminalService, stripTerminalControls } from './agent-terminal'
import { isSensitiveCommand, shouldAutoApprove } from './approval-policy'
import { ASSISTANT_ID, type Agent, type Approval, type Conversation, type Delegation, type Message, type MessageAttachment, type MissionAction, type Model, type Routine, type Run, type SendOptions, type StartMissionInput, type Workspace, type WorkspaceEvent } from '../../shared/v9'
import type { PlatformBrowser } from '../ipc/platform-browser'
import { safeWebUrl, type ExternalBrowserStatus, type PlatformBrowserOwner } from '../../shared/platform-browser'
import { browserClientPath, externalBrowserGuide, probeExternalBrowserBridge, readNodeReplServer } from './external-browser'
import { EXTERNAL_BROWSER_MCP, ExternalBrowserProxy, externalBrowserApprovalPreview, type NodeReplServer } from './external-browser-proxy'
import { cloneGithubRepository, createProjectFolder, GitWorkspaceService } from './git-workspaces'
import { WorkspaceQueue, mentionedRecipients, recipients, type WorkspaceLease } from './routing'
import { OpenRouterDecisionService } from './decision-routing'
import { CodexRuntime, type DynamicTool } from './codex'
import { ClaudeRuntime } from './claude'
import { PiRuntime } from './pi'
import { HeadlessCliRuntime } from './headless-cli'
import { OpenCodeServerRuntime } from './opencode-server'
import { chooseBooIdentity } from './boo-identity'
import { buildSelfProfileUpdate, SELF_PROFILE_FIELDS } from './boo-profile'
import { SessionUnavailableError, type AgentInput, type AgentRuntime, type RuntimeThread } from './agent-runtime'
import { ClaudeCredentialStore } from './credentials'
import { AttachmentStore } from '../pwa/attachment-store'
import { canonicalDirectory, WorkspaceStore, type AssistantPreferences } from './store'
import { SkillsService } from './skills/service'
import { MissionEngine } from './missions'
import { describeTrigger, validateTrigger } from '../../shared/missions'
import { toolActivityText } from '../../shared/activity'
import { delegatedConversationName } from '../../shared/delegation-title'

const RUNTIME_LABELS: Record<Agent['runtime'], string> = { codex: 'Codex', claude: 'Claude', pi: 'Pi', opencode: 'OpenCode', antigravity: 'Antigravity' }

type RunContext = { run: Run; message: Message; conversation: Conversation; agent: Agent; runtime?: AgentRuntime; signal?: AbortSignal; lease?: WorkspaceLease; flushTimer?: ReturnType<typeof setTimeout>; sessionBindingKey?: string; deliveredDigests?: Record<string, string>; activitySince?: boolean; itemId?: string; priorText?: string }
const text = (value: unknown, max = 12000) => { if (typeof value !== 'string' || value.length > max) throw new Error('Texto de ferramenta inválido.'); return value }
const approvalUrl = (value: string) => { const safe = safeWebUrl(value); if (!safe) return '[endereço inválido]'; const url = new URL(safe); url.search = ''; url.hash = ''; return url.href }
const redactApprovalUrls = (value: string) => value.replace(/https?:\/\/[^\s"'\\<>]+/gi, approvalUrl)
const terminalOwner = (context: RunContext) => ({ workspaceId: context.run.workspaceId, conversationId: context.conversation.id, runId: context.run.id, agentId: context.agent.id, agentName: context.agent.name })
async function runWorkspaceCommand(command: string, cwd: string, context: RunContext, toolCallId: string, store: WorkspaceStore, terminals: AgentTerminalService): Promise<string> {
  const createdAt = new Date().toISOString()
  // PTY visível no painel Terminal; mesmas regras de ambiente, limite, timeout e cancelamento do comando oculto anterior.
  const result = await terminals.run({ command, cwd, owner: terminalOwner(context), signal: context.signal })
  const evidence = createCommandEvidence({ runId: context.run.id, toolCallId, agentId: context.agent.id, conversationId: context.conversation.id, workspaceId: context.run.workspaceId, command, cwd }, result, createdAt)
  const persisted = store.putCommandEvidence(evidence)
  return formatCommandEvidence(persisted, persisted.id)
}
/** Como e onde habilitar cada permissão do Chief, para a mensagem de recusa orientar o usuário em vez de só negar. */
const howToEnablePermission = (label: string) => ` Para habilitar, abra o menu (⋯) deste workspace, escolha Editar e marque "${label}" em Permissões do workspace.`

export class AppService extends EventEmitter {
  readonly store: WorkspaceStore
  readonly runtime: AgentRuntime
  readonly claudeRuntime: AgentRuntime
  readonly piRuntime: AgentRuntime
  readonly openCodeRuntime: AgentRuntime
  readonly antigravityRuntime: AgentRuntime
  readonly credentials: ClaudeCredentialStore
  readonly attachments: AttachmentStore
  readonly decisionRouting: OpenRouterDecisionService
  private platformBrowser: PlatformBrowser | null = null
  setPlatformBrowser(browser: PlatformBrowser) { this.platformBrowser = browser }
  private browserBusyBy(owner: PlatformBrowserOwner): { agent: string; conversation: string } | null {
    const current = this.platformBrowser?.sharingState?.()
    if (!current || (current.conversationId === owner.conversationId && current.agentId === owner.agentId)) return null
    const active = [...this.contexts.values()].find(c => c.conversation.id === current.conversationId && c.agent.id === current.agentId && !c.signal?.aborted && ['running', 'waiting'].includes(c.run.status))
    return active ? { agent: active.agent.name, conversation: active.conversation.name } : null
  }
  canShareBrowser(owner: PlatformBrowserOwner): boolean {
    try {
      const conversation = this.store.conversation(owner.conversationId)
      const workspace = this.store.workspace(owner.workspaceId)
      const agent = this.store.agent(owner.agentId)
      return !conversation.archived && !workspace.archived && conversation.workspaceId === workspace.id && (conversation.agentIds.length ? conversation.agentIds.includes(agent.id) : agent.id === ASSISTANT_ID) && agent.computerUse && workspace.permissions?.computerUse !== 'deny'
    } catch { return false }
  }
  /** Navegador externo (extensão oficial do provider): exige o mesmo direito do compartilhamento interno mais consentimento próprio. */
  externalBrowserStatus(owner: PlatformBrowserOwner): ExternalBrowserStatus {
    const valid = [owner?.workspaceId, owner?.conversationId, owner?.agentId].every(value => typeof value === 'string' && !!value && value.length <= 200)
    if (!valid) throw new Error('Dados inválidos para o navegador externo.')
    return { granted: this.canShareBrowser(owner) && (this.store.externalBrowserAlways() || this.store.externalBrowserGrant(owner.conversationId, owner.agentId)), problems: this.externalBrowserBridge.probe() }
  }
  setExternalBrowserGrant(owner: PlatformBrowserOwner, enabled: boolean): ExternalBrowserStatus {
    this.externalBrowserStatus(owner)
    if (enabled === true && !this.canShareBrowser(owner)) throw new Error('Este agente não pode usar navegador nesta conversa.')
    // Revogar não fecha o proxy registrado na thread: o authorizer passa a recusar as chamadas seguintes.
    this.store.saveExternalBrowserGrant(owner.conversationId, owner.agentId, enabled === true)
    if (enabled === true) this.externalBrowserFailures.delete(`${owner.conversationId}:${owner.agentId}`)
    return this.externalBrowserStatus(owner)
  }
  /** Ponte oficial: sonda e node_repl declarados pelo Codex. Os testes injetam um node_repl falso. */
  externalBrowserBridge: { probe: () => string[]; upstream: () => NodeReplServer | null; startTimeoutMs?: number; guide: () => string } = {
    probe: () => probeExternalBrowserBridge(), upstream: () => readNodeReplServer(),
    guide: () => { const client = browserClientPath(); return client ? externalBrowserGuide(client) : '' },
  }
  private readonly externalBrowserProxies = new Map<string, ExternalBrowserProxy>()
  /** conversa:agente cujo node_repl falhou ao iniciar nesta sessão do app; só um pedido/autorização explícita (ou reiniciar o app) tenta de novo. */
  private readonly externalBrowserFailures = new Set<string>()
  private closeExternalBrowserProxiesWhere(match: (conversationId: string, agentId: string) => boolean) {
    for (const key of [...this.externalBrowserProxies.keys()]) { const [conversationId, agentId] = key.split(':'); if (match(conversationId, agentId)) this.closeExternalBrowserProxy(key) }
  }
  /** Execução a que cada proxy (conversa:agente) está vinculado; a thread do Codex só o conhece por essa execução. */
  private readonly externalBrowserRuns = new Map<string, string>()
  private closeExternalBrowserProxy(key: string) {
    const proxy = this.externalBrowserProxies.get(key)
    this.externalBrowserProxies.delete(key); this.externalBrowserRuns.delete(key)
    void proxy?.close()
  }
  /** Inicia (ou reaproveita) o proxy para Codex/Claude sempre que a ponte está íntegra, mesmo sem autorização: sem grant o authorizer recusa, e aprovar vale na mesma execução. Qualquer falha deixa o agente sem as ferramentas. */
  private async externalBrowserMcp(context: RunContext) {
    const owner = { workspaceId: context.run.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }
    const key = `${owner.conversationId}:${owner.agentId}`
    try {
      const status = this.externalBrowserStatus(owner)
      if (!['codex', 'claude'].includes(context.agent.runtime) || context.run.planMode || !this.canShareBrowser(owner) || status.problems.length || this.externalBrowserFailures.has(key)) return null
      let proxy = this.externalBrowserProxies.get(key)
      if (!proxy) {
        const upstream = this.externalBrowserBridge.upstream()
        if (!upstream) return null
        proxy = new ExternalBrowserProxy(upstream, (tool, args, signal) => this.authorizeExternalBrowserCall(owner, this.externalBrowserRuns.get(key), tool, args, signal), this.externalBrowserBridge.startTimeoutMs, this.externalBrowserBridge.guide(),
          () => { const runId = this.externalBrowserRuns.get(key); return runId ? JSON.stringify({ session_id: owner.conversationId, turn_id: runId }) : null })
        this.externalBrowserProxies.set(key, proxy)
      }
      this.externalBrowserRuns.set(key, context.run.id)
      await proxy.start()
      return { url: proxy.url, token: proxy.token, tools: proxy.toolNames }
    } catch {
      if (this.externalBrowserProxies.get(key)?.ready === false) { this.closeExternalBrowserProxy(key); this.externalBrowserFailures.add(key) }
      return null
    }
  }
  /** Sem aprovação por chamada nem filtro de conteúdo (decisão do usuário): basta a execução vinculada e a autorização da conversa+agente. */
  private async authorizeExternalBrowserCall(owner: PlatformBrowserOwner, runId: string | undefined, tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string | null> {
    const context = runId ? this.contexts.get(runId) : undefined
    if (!context || context.conversation.id !== owner.conversationId || context.agent.id !== owner.agentId || !['codex', 'claude'].includes(context.agent.runtime) || context.run.planMode || context.signal?.aborted || signal.aborted) return 'Nenhuma execução ativa deste agente vinculada ao navegador externo nesta conversa; nada foi executado.'
    if (!this.externalBrowserStatus(owner).granted) return 'O usuário não autorizou o navegador real para este agente nesta conversa. Use a ferramenta external_browser_request.'
    // Uso visível na conversa: só chamadas que serão encaminhadas viram atividade (recusas voltam apenas ao modelo).
    const preview = externalBrowserApprovalPreview(args, approvalUrl)
    this.addMessage(context.conversation.id, context.agent, 'activity', `Navegador real · ${tool}${preview.targets.length ? ` · alvo ${preview.targets.join(', ')}` : ''}\n${preview.code}`, 'completed', context.run.id)
    return null
  }
  readonly agentTerminals = new AgentTerminalService()
  readonly gitWorkspaces: GitWorkspaceService
  // Mesma pasta de dados do app; tools de skill (list_skills/read_skill/save_skill) usam esta instância direto, sem passar por IPC.
  private readonly skills: SkillsService
  readonly missions: MissionEngine
  private readonly queue = new WorkspaceQueue()
  private readonly active = new Map<string, AbortController>()
  private readonly contexts = new Map<string, RunContext>()
  private readonly completedTurns = new WeakMap<AgentRuntime, Map<string, { status: string; error?: string }>>()
  private readonly delegationTasks = new Map<string, Promise<string>>()
  private readonly groupRounds = new Map<string, Promise<void>>()
  private readonly groupRoundSignals = new Map<string, Set<AbortController>>()
  private readonly approvalWaiters = new Map<string, (approved: boolean) => void>()
  private readonly questionWaiters = new Map<string, (answer: string) => void>()
  private visibleConversationId: string | null = null
  private cachedModels: ((runtime: Agent['runtime']) => Promise<Model[]>) | null = null
  private readonly statusTimer: ReturnType<typeof setInterval>
  private readonly statusSignal = new AbortController()
  private statusRefresh: Promise<void> | null = null
  constructor(dataDirectory: string, runtime: AgentRuntime = new CodexRuntime(), claudeRuntime?: AgentRuntime) {
    super()
    this.runtime = runtime
    this.store = new WorkspaceStore(dataDirectory)
    this.attachments = new AttachmentStore(join(dataDirectory, 'pwa-attachments'))
    // Após reinício, delegações antigas foram interrompidas: não deixar Boos temporários presos em "working".
    for (const boo of this.store.agents().filter(item => item.temporary && item.temporaryStatus === 'working'))
      this.store.saveAgent({ ...boo, temporaryStatus: 'retired' })
    this.credentials = new ClaudeCredentialStore(dataDirectory)
    this.decisionRouting = new OpenRouterDecisionService(dataDirectory)
    this.claudeRuntime = claudeRuntime || new ClaudeRuntime(dataDirectory, () => this.credentials.load())
    this.piRuntime = new PiRuntime(join(dataDirectory, 'pi-runtime'))
    this.openCodeRuntime = process.env.BOOBOT_OPENCODE_TRANSPORT === 'cli'
      ? new HeadlessCliRuntime('opencode', join(dataDirectory, 'opencode-chat'))
      : new OpenCodeServerRuntime(join(dataDirectory, 'opencode-server'))
    this.antigravityRuntime = new HeadlessCliRuntime('antigravity', join(dataDirectory, 'antigravity-chat'))
    this.gitWorkspaces = new GitWorkspaceService(join(dataDirectory, 'worktrees'))
    this.skills = new SkillsService(dataDirectory)
    this.missions = new MissionEngine({
      store: this.store,
      send: (conversationId, input, model, agentId) => this.send(conversationId, input, model, undefined, agentId, false, false),
      stop: conversationId => this.stop(conversationId),
      post: (conversationId, role, agentId, value) => { this.addMessage(conversationId, agentId ? this.store.agent(agentId) : null, role, value, 'completed', null) },
      emit: event => this.emitEvent(event),
      notify: (conversationId, title, body) => this.notifyWhenAway(conversationId, title, body),
    })
    this.statusTimer = setInterval(() => void this.refreshWorkspaceStatuses(), 5000)
    this.statusTimer.unref?.()
    this.runtime.on('event', (event: any) => void this.onRuntimeEvent(event, this.runtime))
    this.claudeRuntime.on('event', (event: any) => void this.onRuntimeEvent(event, this.claudeRuntime))
    this.piRuntime.on('event', (event: any) => void this.onRuntimeEvent(event, this.piRuntime))
    this.openCodeRuntime.on('event', (event: any) => void this.onRuntimeEvent(event, this.openCodeRuntime))
    this.antigravityRuntime.on('event', (event: any) => void this.onRuntimeEvent(event, this.antigravityRuntime))
    this.agentTerminals.on('event', (event: WorkspaceEvent) => this.emitEvent(event))
    for (const [name, runtime] of [['Codex', this.runtime], ['Claude', this.claudeRuntime], ['Pi', this.piRuntime], ['OpenCode', this.openCodeRuntime], ['Antigravity', this.antigravityRuntime]] as const) {
      runtime.on('disconnected', (error: Error) => {
        for (const context of this.contexts.values()) {
          if (context.runtime !== runtime) continue
          void this.finish(context, 'failed', `Conexão com ${name} encerrada: ${error.message}`)
          // Libera a espera do turno, as aprovações e a vaga da fila deste runtime.
          this.active.get(context.run.id)?.abort()
        }
      })
    }
  }
  snapshot() { return { ...this.store.snapshot(), steeringRuntimes: (['codex', 'claude', 'pi'] as const).filter(name => typeof this.runtimeFor(name).steer === 'function'), imageRuntimes: (['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const).filter(name => this.runtimeFor(name).supportsImages === true) } }
  async uploadAttachment(conversationId: string, name: string, mimeType: string, bytes: Uint8Array) {
    this.store.conversation(conversationId)
    if (!(bytes instanceof Uint8Array)) throw new Error('Conteúdo de imagem inválido.')
    return this.attachments.put(conversationId, bytes, mimeType, name)
  }
  async readAttachment(conversationId: string, id: string) {
    const file = await this.attachments.resolve(conversationId, id)
    return { mimeType: file.mimeType, bytes: new Uint8Array(await fs.readFile(file.path)) }
  }
  // Small read for Settings; avoid materializing conversations, runs and file changes.
  settingsPreferences() { const assistant = this.store.agent(ASSISTANT_ID); return { canWrite: assistant.canWrite, computerUse: assistant.computerUse, approvalMode: assistant.approvalMode, terminalEnabled: this.store.terminalEnabled(), externalBrowserAlways: this.store.externalBrowserAlways() } }
  saveExternalBrowserAlways(enabled: boolean) { this.store.saveExternalBrowserAlways(enabled); this.emitEvent({ type: 'changed' }) }
  private runtimeFor(name: Agent['runtime']): AgentRuntime { return name === 'claude' ? this.claudeRuntime : name === 'pi' ? this.piRuntime : name === 'opencode' ? this.openCodeRuntime : name === 'antigravity' ? this.antigravityRuntime : this.runtime }
  /** Usa o inventário validado na inicialização ou atualizado manualmente; envio não varre CLI. */
  setCachedModelResolver(resolver: (runtime: Agent['runtime']) => Promise<Model[]>): void { this.cachedModels = resolver }
  private refreshWorkspaceStatuses(): Promise<void> {
    if (this.statusSignal.signal.aborted) return Promise.resolve()
    if (!this.statusRefresh) this.statusRefresh = this.scanWorkspaceStatuses().finally(() => { this.statusRefresh = null })
    return this.statusRefresh
  }
  private async scanWorkspaceStatuses() {
    for (const workspace of this.store.workspaces()) {
      if (this.statusSignal.signal.aborted) return
      if (workspace.archived) continue
      try {
        const info = await this.gitWorkspaces.inspect(workspace.path, this.statusSignal.signal)
        if (this.statusSignal.signal.aborted) return
        const current = this.store.workspaces().find(item => item.id === workspace.id)
        if (!current || current.archived) continue
        if (info.branch !== current.branch || info.changes !== current.changes) {
          if (this.store.updateWorkspaceGitStatus(workspace.id, info)) { this.emitEvent({ type: 'changed' }); if (info.changes !== current.changes) this.missions.onProjectChanged(workspace.id) }
        }
      } catch { /* pasta removida ou inacessível: preserva o último estado salvo */ }
    }
  }
  private revalidateBrowserSharing() {
    const owner = this.platformBrowser?.sharingState?.()
    if (owner && !this.canShareBrowser(owner)) this.platformBrowser?.revokeSharing()
  }
  saveAgent(input: Partial<Agent>) { const agent = this.store.saveAgent(input); this.revalidateBrowserSharing(); this.emitEvent({ type: 'changed' }); return agent }
  saveAssistantPreferences(input: Partial<AssistantPreferences>) { const assistant = this.store.saveAssistantPreferences(input); this.revalidateBrowserSharing(); this.emitEvent({ type: 'changed' }); return assistant }
  saveTerminalAccess(enabled: boolean) { this.store.saveTerminalAccess(enabled); this.emitEvent({ type: 'changed' }) }
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }) { const conversation = this.store.saveConversation(input); this.revalidateBrowserSharing(); this.emitEvent({ type: 'changed' }); return conversation }
  async saveWorkspace(input: Partial<Workspace> & { path?: string | null }) {
    let info: { branch?: string | null; changes?: number } = {}
    if (input.path !== undefined) {
      const path = canonicalDirectory(input.path)
      if (path) info = await this.gitWorkspaces.inspect(path).catch(() => ({ branch: null, changes: 0 }))
    }
    const workspace = this.store.saveWorkspace({ ...input, ...info })
    this.revalidateBrowserSharing(); this.emitEvent({ type: 'changed' }); return workspace
  }
  createProjectFolder(input: { parent: string; name: string }) { return createProjectFolder(input.parent, input.name) }
  private cloneAbort: AbortController | null = null
  async cloneRepository(input: { repository: string; parent: string; name?: string }) {
    if (this.cloneAbort) throw new Error('Já existe uma clonagem em andamento.')
    const abort = this.cloneAbort = new AbortController()
    try { return await cloneGithubRepository(input, abort.signal) } finally { this.cloneAbort = null }
  }
  cancelClone() { this.cloneAbort?.abort() }
  async createWorktree(input: { sourceWorkspaceId: string; branch: string; baseBranch?: string }) {
    const source = this.store.workspace(input.sourceWorkspaceId)
    if (source.archived) throw new Error('Escolha um workspace ativo como origem.')
    const created = await this.gitWorkspaces.createWorktree({ sourcePath: source.path, workspaceName: source.name, workspaceId: source.id, branch: input.branch, baseBranch: input.baseBranch || source.branch || undefined })
    const workspace = this.store.saveWorkspace({ name: input.branch, parentWorkspaceId: source.id, kind: 'worktree', path: created.path, branch: created.branch, baseBranch: created.baseBranch, instructions: source.instructions, defaultAgentIds: source.defaultAgentIds, permissions: source.permissions, changes: 0, archived: false })
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
    const conversations = this.store.conversations().filter(item => ids.includes(item.workspaceId))
    for (const conversation of conversations) await this.stop(conversation.id)
    if (conversations.some(conversation => conversation.id === this.platformBrowser?.sharingState()?.conversationId)) this.platformBrowser?.revokeSharing()
    this.closeExternalBrowserProxiesWhere(id => conversations.some(conversation => conversation.id === id))
    if (workspace.kind === 'worktree') await this.gitWorkspaces.removeWorktree(workspace.path).catch(() => undefined)
    this.store.deleteWorkspace(workspaceId, { cascade: true })
    this.emitEvent({ type: 'changed' })
  }
  async deleteConversation(conversationId: string) {
    await this.stop(conversationId)
    if (this.platformBrowser?.sharingState()?.conversationId === conversationId) this.platformBrowser.revokeSharing()
    this.closeExternalBrowserProxiesWhere(id => id === conversationId)
    this.store.deleteConversation(conversationId)
    this.emitEvent({ type: 'changed' })
  }
  async deleteAgent(agentId: string) {
    if (agentId === ASSISTANT_ID) throw new Error('O Assistente padrão não pode ser excluído.')
    const runs = this.store.runs().filter(run => run.agentId === agentId && ['queued', 'running', 'waiting'].includes(run.status))
    for (const run of runs) {
      this.active.get(run.id)?.abort()
      if (run.threadId && run.turnId) await this.runtimeFor(run.agent.runtime).interrupt(run.threadId, run.turnId).catch(() => undefined)
      const context = this.contexts.get(run.id)
      if (context) await this.finish(context, 'interrupted', context.message.text || 'Agente excluído pelo usuário.')
      else {
        this.store.putRun({ ...run, status: 'interrupted' })
        const message = this.store.message(run.messageId)
        if (message) { const next = { ...message, status: 'interrupted' as const, text: message.text || 'Agente excluído pelo usuário.' }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next }) }
      }
      this.active.delete(run.id)
    }
    if (this.platformBrowser?.sharingState()?.agentId === agentId) this.platformBrowser.revokeSharing()
    this.closeExternalBrowserProxiesWhere((_, id) => id === agentId)
    this.store.deleteAgent(agentId)
    this.emitEvent({ type: 'changed' })
  }
  startMission(input: StartMissionInput) { return this.missions.start(input) }
  missionAction(missionId: string, action: MissionAction, value?: string) { return this.missions.action(missionId, action, value) }
  saveRoutine(input: Partial<Routine>) { return this.missions.saveRoutine(input) }
  deleteRoutine(routineId: string) { this.missions.deleteRoutine(routineId) }
  runRoutine(routineId: string) { return this.missions.runRoutine(routineId) }
  /** Chamado uma vez quando os provedores estão prontos: retoma missões ativas e agenda rotinas. */
  resumeAutonomy() { this.missions.resumeAfterRestart() }
  workspacePath(workspaceId: string) { const workspace = this.store.workspace(workspaceId); if (workspace.archived) throw new Error('Este workspace está arquivado.'); return workspace.path }
  workspaceDiff(workspaceId: string) { return this.gitWorkspaces.diff(this.workspacePath(workspaceId)) }
  listProjectFiles(workspaceId: string, directory = '') { return listProjectDirectory(this.workspacePath(workspaceId), directory) }
  readProjectFile(workspaceId: string, path: string) { return readProjectText(this.workspacePath(workspaceId), path) }
  writeProjectFile(workspaceId: string, path: string, content: string, expectedHash: string) { return writeProjectText(this.workspacePath(workspaceId), path, content, expectedHash) }
  setVisibleConversation(conversationId: string | null) { if (conversationId !== null) this.store.conversation(conversationId); this.visibleConversationId = conversationId }
  getVisibleConversation() { return this.visibleConversationId }
  private notifyWhenAway(conversationId: string, title: string, body: string) {
    const focusedConversation = this.visibleConversationId === conversationId && BrowserWindow.getAllWindows().some(window => !window.isDestroyed() && window.isFocused())
    if (!focusedConversation && Notification.isSupported()) new Notification({ title, body }).show()
  }
  async respondApproval(approvalId: string, approved: boolean, remote = false) {
    const approval = this.store.approval(approvalId)
    if (!approval || approval.status !== 'pending') throw new Error('Esta aprovação não está mais pendente.')
    if (remote && approval.details.desktopOnly) throw new Error('A autorização do navegador real só pode ser respondida na janela do Boobot neste computador.')
    if (typeof approved !== 'boolean') throw new Error('Decisão de aprovação inválida.')
    const resolveApproval = this.approvalWaiters.get(approvalId)
    if (!resolveApproval) throw new Error('A execução desta aprovação não está ativa. Ela não será repetida automaticamente.')
    const updated = { ...approval, status: approved ? 'approved' as const : 'denied' as const, resolvedAt: new Date().toISOString() }
    this.store.putApproval(updated); this.emitEvent({ type: 'approval', approval: updated })
    const context = this.contexts.get(approval.runId)
    if (context) {
      context.run.status = 'running'; this.store.putRun(context.run)
      this.updateMessage(context.message, 'running', context.message.text)
    }
    this.approvalWaiters.delete(approvalId); resolveApproval(approved)
  }
  async answerQuestion(approvalId: string, answer: string): Promise<void> {
    const approval = this.store.approval(approvalId)
    if (!approval || approval.kind !== 'question' || approval.status !== 'pending') throw new Error('A pergunta não está pendente.')
    const submit = this.questionWaiters.get(approvalId)
    if (!submit) throw new Error('O agente desta pergunta não está ativo.')
    const response = text(answer, 2000).trim()
    if (!response) throw new Error('Escolha ou informe uma resposta.')
    this.questionWaiters.delete(approvalId)
    const updated: Approval = { ...approval, status: 'approved', details: { ...approval.details, answer: response }, resolvedAt: new Date().toISOString() }
    this.store.putApproval(updated); this.emitEvent({ type: 'approval', approval: updated })
    const context = this.contexts.get(approval.runId)
    if (context) {
      context.run.status = 'running'; this.store.putRun(context.run)
      this.updateMessage(context.message, 'running', context.message.text)
    }
    submit(response)
  }
  private askUser(context: RunContext, question: string, options: string[]): Promise<string> {
    if (context.signal?.aborted) return Promise.reject(new Error('Execução interrompida.'))
    const approval: Approval = { id: randomUUID(), runId: context.run.id,
      conversationId: context.conversation.id, agentId: context.agent.id, kind: 'question',
      details: { question, options }, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null }
    this.store.putApproval(approval)
    context.run.status = 'waiting'; this.store.putRun(context.run)
    this.updateMessage(context.message, 'waiting', context.message.text)
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.questionWaiters.delete(approval.id)
        const current = this.store.approval(approval.id)
        if (current?.status === 'pending') {
          const updated: Approval = { ...current, status: 'interrupted', resolvedAt: new Date().toISOString() }
          this.store.putApproval(updated); this.emitEvent({ type: 'approval', approval: updated })
        }
        reject(new Error('Pergunta interrompida.'))
      }
      this.questionWaiters.set(approval.id, answer => {
        context.signal?.removeEventListener('abort', abort)
        resolve(answer)
      })
      context.signal?.addEventListener('abort', abort, { once: true })
      this.emitEvent({ type: 'approval', approval })
      this.notifyWhenAway(context.conversation.id, 'Pergunta do Boo', question.slice(0, 140))
    })
  }
  private async requestApproval(context: RunContext, kind: Approval['kind'], details: Approval['details'], sensitive = false, alwaysAsk = false): Promise<boolean> {
    const signals = [context.signal].filter((signal): signal is AbortSignal => !!signal)
    if (signals.some(signal => signal.aborted)) return false
    if (!alwaysAsk && shouldAutoApprove(context.agent.approvalMode, kind, sensitive)) return true
    const approval: Approval = { id: randomUUID(), runId: context.run.id, conversationId: context.conversation.id, agentId: context.agent.id, kind, details, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null }
    this.store.putApproval(approval)
    context.run.status = 'waiting'; this.store.putRun(context.run)
    this.updateMessage(context.message, 'waiting', context.message.text)
    const action = kind === 'write' ? 'alterar um arquivo' : kind === 'browser' ? 'usar o navegador' : kind === 'command' ? 'executar um comando no terminal' : kind === 'delegation' ? 'delegar uma tarefa' : 'alterar um agente ou uma equipe'
    if (signals.some(signal => signal.aborted)) {
      const interrupted = { ...approval, status: 'interrupted' as const, resolvedAt: new Date().toISOString() }
      this.store.putApproval(interrupted); this.emitEvent({ type: 'approval', approval: interrupted })
      if (!context.signal?.aborted && context.run.status === 'waiting') {
        context.run.status = 'running'; this.store.putRun(context.run)
        this.updateMessage(context.message, 'running', context.message.text)
      }
      return false
    }
    return new Promise(resolveApproval => {
      const abort = () => {
        const pending = this.store.approval(approval.id)
        if (pending?.status === 'pending') {
          const interrupted = { ...pending, status: 'interrupted' as const, resolvedAt: new Date().toISOString() }
          this.store.putApproval(interrupted); this.emitEvent({ type: 'approval', approval: interrupted })
        }
        for (const signal of signals) signal.removeEventListener('abort', abort)
        // Só a chamada foi cancelada: a execução continua e sai do estado de espera.
        if (!context.signal?.aborted && context.run.status === 'waiting') {
          context.run.status = 'running'; this.store.putRun(context.run)
          this.updateMessage(context.message, 'running', context.message.text)
        }
        this.approvalWaiters.delete(approval.id); resolveApproval(false)
      }
      this.approvalWaiters.set(approval.id, approved => {
        for (const signal of signals) signal.removeEventListener('abort', abort)
        resolveApproval(approved)
      })
      for (const signal of signals) signal.addEventListener('abort', abort, { once: true })
      // O consumidor pode decidir no próprio callback do evento. A espera precisa
      // existir antes da publicação, inclusive para clientes locais muito rápidos.
      this.emitEvent({ type: 'approval', approval })
      if (this.store.approval(approval.id)?.status === 'pending') this.notifyWhenAway(context.conversation.id, 'Boobot precisa da sua atenção', `${context.agent.name} aguarda aprovação para ${action}.`)
    })
  }
  history(id: string) { this.store.conversation(id); return this.store.history(id) }
  historyPage(id: string, beforeCursor?: number | string | null, limit?: number) { this.store.conversation(id); return this.store.historyPage(id, beforeCursor, limit) }
  searchHistory(id: string, query: string, limit?: number) { this.store.conversation(id); return this.store.searchHistory(id, text(query, 200), limit) }
  historyAround(id: string, cursor: number, limit?: number) { this.store.conversation(id); return this.store.historyAround(id, cursor, limit) }
  private emitEvent(event: WorkspaceEvent) { this.emit('workspace-event', event) }
  private addMessage(conversationId: string, agent: Agent | null, role: Message['role'], value: string, status: Message['status'], runId: string | null, details: { id?: string; attachments?: MessageAttachment[] } = {}) {
    const message: Message = { id: details.id || randomUUID(), conversationId, agentId: agent?.id || null, author: agent?.name || (role === 'user' ? 'Você' : 'Sistema'), role, text: value, status, runId, ...(details.attachments?.length ? { attachments: details.attachments } : {}), createdAt: new Date().toISOString() }
    this.store.putMessage(message); this.emitEvent({ type: 'message', message })
    // Texto que chegar depois de uma atividade vira mensagem nova, abaixo dela (ver replyFor).
    if (role === 'activity' && runId) { const context = this.contexts.get(runId); if (context) context.activitySince = true }
    return message
  }
  /**
   * Mensagem que recebe o texto do agente. Depois de uma atividade (ou de um novo item de texto do Codex) a anterior
   * é concluída e nasce outra no fim da conversa, para a resposta final ficar abaixo do trabalho.
   * run.messageId acompanha sempre a mensagem atual (a última resposta do run).
   */
  private replyFor(context: RunContext, itemId?: string): Message {
    const sameItem = !!itemId && itemId === context.itemId
    const newItem = !!itemId && !!context.itemId && itemId !== context.itemId && !!context.message.text.trim()
    if (!sameItem && (context.activitySince || newItem)) {
      const previous = context.message
      if (context.flushTimer) { clearTimeout(context.flushTimer); context.flushTimer = undefined }
      // Vazia e concluída: o renderer oculta; nenhum texto se perde.
      this.updateMessage(previous, 'completed', previous.text)
      context.priorText = (context.priorText || '') + previous.text
      const next: Message = { ...previous, id: randomUUID(), text: '', status: 'running', createdAt: new Date().toISOString() }
      this.store.putMessage(next); this.emitEvent({ type: 'message', message: next })
      context.message = next; context.activitySince = false
      context.run.messageId = next.id; this.store.putRun(context.run)
    }
    if (itemId) context.itemId = itemId
    return context.message
  }
  async send(conversationId: string, value: string, model?: string, effort?: Agent['effort'], preferredAgentId?: string, voiceReply = false, recordInput = true, planMode = false, options?: SendOptions): Promise<void> {
    const input = text(value, 100000).trim()
    let attachments = options?.attachments || []
    if (attachments.length > 10) throw new Error('Uma mensagem pode conter até 10 imagens.')
    if (!input && !attachments.length) return
    if (options && (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.requestId) || !['queue', 'now'].includes(options.delivery))) throw new Error('Identificador ou modo de envio inválido.')
    const conversation = this.store.conversation(conversationId)
    if (conversation.archived) throw new Error('Esta conversa está arquivada.')
    const workspace = this.store.workspace(conversation.workspaceId)
    if (workspace.archived) throw new Error('O workspace desta conversa está arquivado.')
    if (options?.requestId) {
      const existing = this.store.message(options.requestId)
      if (existing) {
        if (existing.conversationId === conversationId && existing.role === 'user') return
        throw new Error('O identificador da mensagem já pertence a outro registro.')
      }
    }
    if (attachments.length) {
      const verified = await Promise.all(attachments.map(async attachment => {
        const stored = await this.attachments.resolve(conversationId, attachment.id)
        if (stored.name !== attachment.name || stored.mimeType !== attachment.mimeType || stored.size !== attachment.size) throw new Error('Os dados do anexo não correspondem ao arquivo recebido pelo host.')
        return { id: stored.id, name: stored.name, mimeType: stored.mimeType, size: stored.size }
      }))
      attachments = verified
    }
    const conversationAgentIds = conversation.agentIds.length ? conversation.agentIds : [ASSISTANT_ID]
    if (preferredAgentId && preferredAgentId !== ASSISTANT_ID && !conversationAgentIds.includes(preferredAgentId)) throw new Error('O agente escolhido não participa desta conversa.')
    const agents = (preferredAgentId ? [preferredAgentId] : conversationAgentIds).map(id => this.store.agent(id))
    const selectedRuntime = model?.includes(':') ? model.slice(0, model.indexOf(':')) as Agent['runtime'] : undefined
    const selectedModel = selectedRuntime ? model!.slice(model!.indexOf(':') + 1) : model
    let selectedCatalog: Model | undefined
    if (selectedRuntime && !['codex', 'claude', 'pi', 'opencode', 'antigravity'].includes(selectedRuntime)) throw new Error('Motor selecionado inválido.')
    if (selectedModel) {
      const modelRuntime = selectedRuntime || agents[0]?.runtime || 'codex'
      const available = await (this.cachedModels ? this.cachedModels(modelRuntime) : this.runtimeFor(modelRuntime).models())
      selectedCatalog = available.find(item => item.id === selectedModel)
      if (!selectedCatalog) throw new Error(`O modelo selecionado não está disponível no ${RUNTIME_LABELS[modelRuntime]}.`)
    }
    if (effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw new Error('Esforço selecionado inválido.')
    if (effort && selectedCatalog?.supportedEfforts && !selectedCatalog.supportedEfforts.includes(effort)) throw new Error('O modelo selecionado não aceita esse nível de esforço.')
    const mode = conversation.responseMode || 'leader'
    const mentioned = preferredAgentId ? undefined : mentionedRecipients(input, agents)
    let selected = preferredAgentId ? agents : mentioned || recipients(input, agents, mode, conversation.leaderAgentId)
    if (!selected.length) throw new Error('Não há agentes para responder nesta conversa.')
    const turnAlreadyActive = this.store.runs().some(run => run.conversationId === conversationId && ['queued', 'running', 'waiting'].includes(run.status))
    if (recordInput && !preferredAgentId && !mentioned && mode === 'auto' && agents.length > 1) {
      const responding = agents.filter(agent => [...this.contexts.values()].some(context => context.run.conversationId === conversationId && context.agent.id === agent.id && ['running', 'waiting'].includes(context.run.status)))
      if (responding.length === 1) selected = responding
      else {
        const history = this.store.history(conversationId).slice(-8).map(message => ({ author: message.author, text: message.text }))
        const decision = await this.decisionRouting.choose({ message: input, conversation: conversation.name, agents: agents.map(agent => ({ id: agent.id, name: agent.name, description: agent.description })), history })
        if (decision) selected = agents.filter(agent => agent.id === decision.agentId)
      }
    }
    if (attachments.length && !recordInput) throw new Error('Imagens só podem ser enviadas em mensagens da conversa.')
    if (attachments.length && options?.delivery === 'now') throw new Error('Mensagens com imagens devem entrar na fila; steering não suporta anexos.')
    if (attachments.length && selected.some(agent => !this.runtimeFor(selectedRuntime || agent.runtime).supportsImages)) {
      const unsupported = selected.filter(agent => !this.runtimeFor(selectedRuntime || agent.runtime).supportsImages).map(agent => agent.name)
      throw new Error(`O runtime atual não tem envio de imagens testado: ${unsupported.join(', ')}.`)
    }
    if (attachments.length) attachments = await Promise.all(attachments.map(attachment => this.attachments.accept(conversationId, attachment.id)))
    const steeringTargets = recordInput && !voiceReply && options?.delivery === 'now' ? selected.flatMap(agent => {
      const context = [...this.contexts.values()].find(context => context.run.conversationId === conversationId && context.agent.id === agent.id && !context.run.parentId && ['running', 'waiting'].includes(context.run.status))
      return context ? [context] : []
    }) : []
    if (options?.delivery === 'now' && steeringTargets.length !== selected.length) {
      throw new Error('Enviar agora exige uma execução ativa com steering compatível para todos os agentes selecionados.')
    }
    for (const target of steeringTargets) {
      if (!target.runtime?.steer) throw new Error(`${target.agent.name}: este provedor não aceita novas instruções durante a execução. Aguarde a resposta ou interrompa a tarefa.`)
      if (!target.run.threadId || !target.run.turnId) throw new Error('A tarefa ainda está iniciando. Tente enviar a instrução novamente em instantes.')
      if (selectedRuntime && selectedRuntime !== target.agent.runtime || selectedModel && selectedModel !== target.agent.model) throw new Error('Mantenha o modelo da tarefa atual para enviar instruções durante a execução.')
    }
    const createdAt = new Date().toISOString()
    const inputForAgents = [input, ...attachments.map(attachment => `[Imagem anexada: ${attachment.name}]`)].filter(Boolean).join('\n\n')
    const userMessage: Message = recordInput
      ? this.addMessage(conversationId, null, 'user', input, turnAlreadyActive ? 'queued' : 'completed', null, { id: options?.requestId, attachments })
      : { id: options?.requestId || randomUUID(), conversationId, agentId: null, author: 'Você', role: 'user', text: input, status: turnAlreadyActive ? 'queued' : 'completed', runId: null, ...(attachments.length ? { attachments } : {}), createdAt }
    if (recordInput && conversation.titleAuto) { this.store.autoTitle(conversationId, input || attachments[0]?.name || 'Imagem'); this.emitEvent({ type: 'changed' }) }
    if (recordInput) this.missions.onUserMessage(conversationId, inputForAgents)
    if (steeringTargets.length) {
      try {
        await this.steerInto(steeringTargets, userMessage, input)
        const delivered = { ...userMessage, status: 'completed' as const }
        this.store.putMessage(delivered); this.emitEvent({ type: 'message', message: delivered })
      } catch (error) {
        const failed = { ...userMessage, status: 'failed' as const }
        this.store.putMessage(failed); this.emitEvent({ type: 'message', message: failed })
        throw error
      }
      selected = selected.filter(agent => !steeringTargets.some(target => target.agent.id === agent.id))
      if (!selected.length) return
    }
    const tasks: Promise<void>[] = []
    const roundTranscript: string[] = []
    const roundStartedAt = userMessage.createdAt
    const roundSignal = mode === 'discussion' ? new AbortController() : undefined
    if (roundSignal) { const signals = this.groupRoundSignals.get(conversationId) || new Set<AbortController>(); signals.add(roundSignal); this.groupRoundSignals.set(conversationId, signals) }
    const scheduleSelectedAgents = async () => {
      for (const agent of selected) {
      if (roundSignal?.signal.aborted) return
      const runAgent = { ...agent, ...(selectedRuntime ? { runtime: selectedRuntime } : {}), ...(selectedModel ? { model: selectedModel } : {}), ...(effort ? { effort } : {}), ...(voiceReply ? { instructions: `${agent.instructions}\n\nNesta resposta por voz, converse em português brasileiro, com frases curtas e naturais. Responda primeiro à pergunta; execute pedidos de trabalho com as ferramentas deste agente e relate o resultado sem markdown.` } : {}) }
      const catalog = selectedCatalog || (this.cachedModels
        ? (await this.cachedModels(runAgent.runtime).catch(() => [])).find(item => runAgent.model ? item.id === runAgent.model : item.isDefault)
        : undefined)
      if (catalog?.supportedEfforts) {
        const allowed = catalog.supportedEfforts
        const preferred = effort || agent.effort
        runAgent.effort = preferred && allowed.includes(preferred) ? preferred
          : catalog.defaultEffort && allowed.includes(catalog.defaultEffort) ? catalog.defaultEffort : allowed[0]
      }
      const previousRoundRaw = roundTranscript.join('\n\n')
      const previousRoundText = previousRoundRaw.slice(-9000)
      const corrections = mode === 'discussion'
        ? this.store.history(conversationId).filter(message => message.role === 'user' && message.id !== userMessage.id && message.createdAt >= roundStartedAt).slice(-5).map(message => message.text).join('\n\n').slice(-3000)
        : ''
      const runInput = mode === 'discussion' && (roundTranscript.length || corrections)
        ? `${inputForAgents}${corrections ? `\n\nNovas mensagens humanas durante a rodada:\n${corrections}` : ''}${roundTranscript.length ? `\n\nRespostas anteriores desta rodada, em ordem${previousRoundRaw.length > 9000 ? ' (trecho final; início omitido)' : ''}:\n${previousRoundText}` : ''}`
        : inputForAgents
      const run: Run = { id: randomUUID(), conversationId, agentId: agent.id, rootId: '', parentId: null, ancestry: [agent.id], status: 'queued', threadId: null, turnId: null, messageId: '', input: planMode ? '[MODO PLANO ATIVO] Analise a tarefa, consulte apenas ferramentas de leitura e use propose_plan para apresentar um plano em etapas. NÃO modifique arquivos, execute comandos ou realize alterações até o usuário enviar outra tarefa fora do modo plano.\n\n' + runInput : runInput, planMode, inputMessageId: recordInput ? userMessage.id : undefined, agent: runAgent, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: new Date().toISOString() }
      run.rootId = run.id
      // Mensagem na fila do usuário: a resposta só nasce quando a vez chegar, abaixo do que já foi dito.
      let message = userMessage.status === 'queued' && recordInput ? undefined : this.addMessage(conversationId, agent, 'assistant', '', 'queued', run.id)
      run.messageId = message?.id || ''
      this.store.putRun(run)
      const controller = new AbortController()
      this.active.set(run.id, controller)
      const abortRound = () => controller.abort()
      roundSignal?.signal.addEventListener('abort', abortRound, { once: true })
      const task = this.queue.enqueue(workspace.path, controller.signal, lease => {
        if (!message) {
          this.dispatchQueuedInput(userMessage.id)
          message = this.addMessage(conversationId, agent, 'assistant', '', 'queued', run.id)
          run.messageId = message.id
          this.store.putRun(run)
        }
        return this.execute({ run, message, conversation, agent: runAgent, lease }, controller.signal)
      })
        if (mode === 'discussion') {
          try { await task } finally { roundSignal?.signal.removeEventListener('abort', abortRound) }
          roundTranscript.push(`${agent.name}: ${this.store.history(conversationId).filter(item => item.runId === run.id && item.role === 'assistant' && item.text.trim()).map(item => item.text).join('\n\n') || '(sem resposta)'}`)
        } else { tasks.push(task); roundSignal?.signal.removeEventListener('abort', abortRound) }
      }
    }
    if (mode === 'discussion') {
      const previous = this.groupRounds.get(conversationId) || Promise.resolve()
      const round = previous.catch(() => undefined).then(scheduleSelectedAgents)
      this.groupRounds.set(conversationId, round)
      try { await round } finally {
        const signals = this.groupRoundSignals.get(conversationId)
        signals?.delete(roundSignal!)
        if (signals && !signals.size) this.groupRoundSignals.delete(conversationId)
        if (this.groupRounds.get(conversationId) === round) this.groupRounds.delete(conversationId)
      }
    } else {
      await scheduleSelectedAgents()
      if (!options?.returnAfterAcceptance) await Promise.all(tasks)
    }
    void userMessage
  }
  async cancelQueuedMessage(messageId: string): Promise<void> {
    const message = this.store.message(messageId)
    if (!message || message.role !== 'user' || message.status !== 'queued') throw new Error('A mensagem não está aguardando na fila.')
    const runs = this.store.runs().filter(run => run.inputMessageId === messageId && !run.parentId)
    const controllers = runs.map(run => this.active.get(run.id))
    if (!runs.length || runs.some((run, index) => run.status !== 'queued' || !controllers[index] || !this.queue.isPending(controllers[index]!.signal))) {
      throw new Error('A mensagem já começou a ser executada e não pode ser removida da fila.')
    }
    for (let index = 0; index < runs.length; index++) {
      const run = runs[index]!
      this.store.putRun({ ...run, status: 'cancelled' })
      const response = this.store.message(run.messageId)
      if (response) { const cancelled = { ...response, status: 'cancelled' as const }; this.store.putMessage(cancelled); this.emitEvent({ type: 'message', message: cancelled }) }
      controllers[index]!.abort()
      this.active.delete(run.id)
    }
    const cancelled = { ...message, status: 'cancelled' as const }
    this.store.putMessage(cancelled); this.emitEvent({ type: 'message', message: cancelled })
    this.emitEvent({ type: 'changed' })
  }
  async respondVoice(conversationId: string, input: string, agentId: string): Promise<string> {
    const previous = new Set(this.store.history(conversationId).filter(message => message.role === 'assistant' && message.agentId === agentId).map(message => message.id))
    await this.send(conversationId, input, undefined, undefined, agentId, true)
    const response = this.store.history(conversationId).slice().reverse().find(message => message.role === 'assistant' && message.agentId === agentId && !previous.has(message.id))
    if (!response?.text.trim()) throw new Error('O agente terminou sem uma resposta falada.')
    if (response.status === 'failed') throw new Error(response.text)
    return response.text
  }
  async respondToAgent(conversationId: string, input: string, agentId: string): Promise<string> {
    const previous = new Set(this.store.history(conversationId).filter(message => message.role === 'assistant' && message.agentId === agentId).map(message => message.id))
    await this.send(conversationId, input, undefined, undefined, agentId)
    const response = this.store.history(conversationId).slice().reverse().find(message => message.role === 'assistant' && message.agentId === agentId && !previous.has(message.id))
    if (!response?.text.trim()) throw new Error('O agente terminou sem uma resposta.')
    if (response.status === 'failed') throw new Error(response.text)
    return response.text
  }
  recordRealtimeTranscript(conversationId: string, agentId: string, role: 'user' | 'assistant', value: string, final: boolean, messageId: string): Message {
    const conversation = this.store.conversation(conversationId)
    const previous = this.store.message(messageId)
    const agent = role === 'assistant' ? this.store.agent(agentId) : null
    const message: Message = {
      id: messageId, conversationId, agentId: agent?.id || null, author: agent?.name || 'Você', role,
      text: value.slice(0, 100000), status: final ? 'completed' : 'running', runId: null,
      createdAt: previous?.createdAt || new Date().toISOString(),
    }
    this.store.putMessage(message)
    this.emitEvent({ type: 'message', message })
    if (role === 'user' && final && conversation.titleAuto) { this.store.autoTitle(conversationId, value); this.emitEvent({ type: 'changed' }) }
    return message
  }
  async stop(conversationId: string): Promise<void> {
    for (const round of this.groupRoundSignals.get(conversationId) || []) round.abort()
    const runs = this.store.runs().filter(run => run.conversationId === conversationId && ['queued', 'running', 'waiting'].includes(run.status))
    for (const run of runs) await this.interruptRun(run)
    // Parar esvazia a fila: as mensagens que esperavam voltam ao chat como interrompidas, sem perder o texto.
    for (const queued of this.store.history(conversationId).filter(item => item.role === 'user' && item.status === 'queued')) this.dispatchQueuedInput(queued.id, 'interrupted')
  }
  private async interruptRun(run: Run): Promise<void> {
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
  /** A mensagem sai da fila e entra no chat agora, no fim da conversa. */
  private dispatchQueuedInput(messageId: string, status: 'completed' | 'interrupted' = 'completed'): void {
    const queued = this.store.message(messageId)
    if (queued?.role !== 'user' || queued.status !== 'queued') return
    const next = { ...queued, status, createdAt: new Date().toISOString() }
    this.store.moveMessageToEnd(next); this.emitEvent({ type: 'message', message: next })
  }
  private async steerInto(targets: RunContext[], userMessage: Message, input: string): Promise<void> {
    for (const target of targets) {
      await target.runtime!.steer!(target.run.threadId!, target.run.turnId!, input)
      if (target.sessionBindingKey) {
        const binding = this.store.sessionBinding(target.sessionBindingKey)
        if (binding) {
          const delivered = { ...userMessage, status: 'completed' as const }
          const digests = { ...binding.deliveredDigests, [delivered.id]: messageDigest(delivered) }
          target.deliveredDigests = Object.fromEntries(Object.entries(digests).slice(-40))
          this.store.putSessionBinding({ ...binding, deliveredDigests: target.deliveredDigests })
        }
      }
    }
  }
  /**
   * Enviar agora uma mensagem da fila. Se todas as execuções ativas dos destinatários aceitam steering (Codex, Pi),
   * a instrução entra na execução atual; senão a execução atual é interrompida e esta mensagem roda em seguida.
   */
  async sendQueuedNow(messageId: string): Promise<void> {
    const message = typeof messageId === 'string' && messageId.length <= 100 ? this.store.message(messageId) : undefined
    if (!message || message.role !== 'user' || message.status !== 'queued') throw new Error('A mensagem não está aguardando na fila.')
    const runs = this.store.runs().filter(run => run.inputMessageId === message.id && run.conversationId === message.conversationId && !run.parentId)
    const controllers = runs.map(run => this.active.get(run.id))
    if (!runs.length || runs.some((run, index) => run.status !== 'queued' || !controllers[index] || !this.queue.isPending(controllers[index]!.signal))) {
      throw new Error('A mensagem já começou a ser executada.')
    }
    const targets = runs.map(run => [...this.contexts.values()].find(context => context.run.conversationId === message.conversationId && context.agent.id === run.agentId && !context.run.parentId && ['running', 'waiting'].includes(context.run.status)))
    const steerable = !message.attachments?.length && !runs.some(run => run.planMode) && targets.every((target, index) => !!target?.runtime?.steer && !!target.run.threadId && !!target.run.turnId
      && target.agent.runtime === runs[index]!.agent.runtime && target.agent.model === runs[index]!.agent.model)
    if (steerable) {
      await this.steerInto(targets as RunContext[], message, message.text)
      runs.forEach((run, index) => { this.store.putRun({ ...run, status: 'cancelled' }); controllers[index]!.abort(); this.active.delete(run.id) })
      this.dispatchQueuedInput(message.id)
      this.emitEvent({ type: 'changed' })
      return
    }
    for (const controller of controllers) this.queue.prioritize(controller!.signal)
    const current = this.store.runs().filter(run => run.conversationId === message.conversationId && ['running', 'waiting'].includes(run.status))
    for (const run of current) await this.interruptRun(run)
    this.emitEvent({ type: 'changed' })
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
  async saveClaudeCredential(apiKey: string) { await this.credentials.save(apiKey); this.emit('provider-auth-changed') }
  async clearClaudeCredential() { await this.credentials.clear(); this.emit('provider-auth-changed') }
  async openRouterDecisionStatus() { return { ...await this.decisionRouting.status() } }
  async openRouterDecisionModels(key?: string) { return this.decisionRouting.models(key) }
  async saveOpenRouterDecision(key: string, modelId: string) { await this.decisionRouting.testKey(key, modelId); await this.decisionRouting.save(key, modelId) }
  async saveOpenRouterDecisionModel(modelId: string) { await this.decisionRouting.saveModel(modelId) }
  async clearOpenRouterDecision() { await this.decisionRouting.clear() }
  async models(runtimeName?: Agent['runtime']): Promise<Model[]> {
    const withProvider = (name: Agent['runtime'], models: Model[]) => models.map(model => ({ ...model, runtime: name, id: `${name}:${model.id}`, name: `${model.name} · ${RUNTIME_LABELS[name]}` }))
    // Prazo de espera de 12 s; não fecha o runtime compartilhado por conversas ativas.
    const load = async (name: Agent['runtime']) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const models = await Promise.race([
          Promise.resolve().then(() => this.cachedModels ? this.cachedModels(name) : this.runtimeFor(name).models()),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Tempo limite ao consultar modelos do ${RUNTIME_LABELS[name]}.`)), 12_000) }),
        ])
        return withProvider(name, models)
      } finally { if (timer) clearTimeout(timer) }
    }
    if (runtimeName) return load(runtimeName)
    const names: Agent['runtime'][] = this.cachedModels ? ['codex', 'claude', 'pi', 'opencode', 'antigravity'] : ['codex', 'claude']
    const results = await Promise.allSettled(names.map(load))
    const models = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    if (results.every(result => result.status === 'rejected')) {
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    return models
  }
  browserFrames(conversationId: string) { this.store.conversation(conversationId); return [] }
  browserControl(_key: string, _human: boolean) { throw new Error('Use o navegador compartilhado da plataforma.') }
  browserAction(_key: string, _action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }) { throw new Error('Use o navegador compartilhado da plataforma.') }
  async pickFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || !result.filePaths[0] ? null : canonicalDirectory(result.filePaths[0])
  }
  async openFolder(conversationId: string) { const conversation = this.store.conversation(conversationId); const workspace = this.store.workspace(conversation.workspaceId); const error = await shell.openPath(workspace.path); if (error) throw new Error(error) }
  private async runtimeInput(run: Run, text: string): Promise<string | AgentInput> {
    const message = run.inputMessageId ? this.store.message(run.inputMessageId) : undefined
    if (!message?.attachments?.length) return text
    const images = await Promise.all(message.attachments.map(async attachment => {
      const file = await this.attachments.resolve(message.conversationId, attachment.id)
      if (file.mimeType !== attachment.mimeType || file.size !== attachment.size) throw new Error('O anexo expirou ou foi alterado antes da execução.')
      return { path: file.path, mimeType: file.mimeType }
    }))
    return { text, images }
  }
  private async execute(context: RunContext, signal: AbortSignal): Promise<void> {
    const { run, message, conversation, agent } = context
    if (signal.aborted) return
    this.contexts.set(run.id, context)
    context.signal = signal
    try {
      const runtime = this.runtimeFor(agent.runtime)
      context.runtime = runtime
      const directory = run.workspacePath
      await fs.mkdir(directory, { recursive: true })
      const workspaceInstructions = this.store.workspace(run.workspaceId).instructions
      const workspaceContext = createHash('sha256').update(workspaceInstructions).digest('hex').slice(0, 16)
      const tools = this.tools(context)
      // Retomar uma sessão existente não atualiza as ferramentas do Codex/Claude: se a lista mudou (permissão, papel, ou código), força uma sessão nova em vez de reaproveitar uma com ferramentas desatualizadas.
      const permissions = this.store.workspace(run.workspaceId).permissions
      const permissionKey = createHash('sha256').update(JSON.stringify({
        agentCanWrite: agent.canWrite, workspaceFilesWrite: permissions?.filesWrite || 'inherit',
        agentComputerUse: agent.computerUse, workspaceComputerUse: permissions?.computerUse || 'deny',
        approvalMode: agent.approvalMode, terminalEnabled: this.store.terminalEnabled(), planMode: run.planMode === true,
      })).digest('hex').slice(0, 12)
      const toolsKey = fingerprintTools(tools, TOOL_BROKER_VERSION).slice(0, 16)
      // Codex/Claude recebem o proxy mesmo sem autorização, para que aprovar external_browser_request valha nesta execução.
      const externalBrowser = agent.runtime === 'codex' || agent.runtime === 'claude' ? await this.externalBrowserMcp(context) || undefined : undefined
      // Uma thread Codex retomada não troca seus servidores MCP: reiniciar o proxy (nova URL) exige sessão nova. O Claude recebe mcpServers a cada query.
      const bindingKey = `${conversation.id}:${agent.id}:w${run.workspaceId}:rt${agent.runtime}:r${agent.revision}:m${agent.model}:c${conversation.revision}:p${workspaceContext}:e${permissionKey}:t${toolsKey}${externalBrowser && agent.runtime === 'codex' ? `:x${externalBrowser.url}` : ''}`
      let binding = this.store.sessionBinding(bindingKey)
      if (binding?.runtime && binding.runtime !== agent.runtime) { this.store.deleteSessionBinding(bindingKey); binding = undefined }
      let thread: RuntimeThread
      let didRetryUnavailable = false
      try { thread = await runtime.thread(agent, directory, tools, binding?.threadId, workspaceInstructions, externalBrowser) }
      catch (error) {
        if (!(error instanceof SessionUnavailableError) || !binding?.threadId) throw error
        this.store.deleteSessionBinding(bindingKey); binding = undefined; didRetryUnavailable = true
        thread = await runtime.thread(agent, directory, tools, undefined, workspaceInstructions, externalBrowser)
      }
      const makeTurnContext = () => buildTurnContext({
        history: this.store.history(conversation.id), checkpoint: this.store.latestCheckpoint(conversation.id, agent.id),
        currentInput: run.input, inputMessageId: run.inputMessageId, responseMessageId: run.messageId,
        agentId: agent.id, session: binding?.contextVersion === 0 ? { ...thread, history: 'empty' } : thread,
        deliveredDigests: binding?.contextVersion ? binding.deliveredDigests : {},
        delegatedRequestIds: this.delegatedRequestIds(run),
      })
      let turnContext = makeTurnContext()
      let threadId = thread.id
      run.threadId = threadId; run.status = 'running'; this.store.putRun(run)
      this.updateMessage(message, 'running', message.text)
      let result
      try { result = await runtime.send(threadId, await this.runtimeInput(run, turnContext.text), agent.model || undefined, 600000) }
      catch (error) {
        if (!(error instanceof SessionUnavailableError) || didRetryUnavailable || !binding?.threadId || thread.history !== 'resume-pending') throw error
        this.store.deleteSessionBinding(bindingKey); binding = undefined; didRetryUnavailable = true
        thread = await runtime.thread(agent, directory, tools, undefined, workspaceInstructions, externalBrowser)
        threadId = thread.id; run.threadId = threadId; this.store.putRun(run)
        turnContext = makeTurnContext()
        result = await runtime.send(threadId, await this.runtimeInput(run, turnContext.text), agent.model || undefined, 600000)
      }
      if (result.thread?.id) { run.threadId = result.thread.id; this.store.putRun(run) }
      const turn = result.turn
      if (!turn?.id) throw new Error(`${agent.name}: o runtime não retornou um identificador de turno.`)
      const turnId = turn.id
      run.turnId = turnId; this.store.putRun(run)
      this.emitEvent({ type: 'changed' })
      if (turn.status === 'failed' || turn.status === 'interrupted') throw new Error(turn.error?.message || `O runtime encerrou o turno como ${turn.status}.`)
      this.store.putSessionBinding({ key: bindingKey, threadId: run.threadId || threadId, runtime: agent.runtime, contextVersion: 1, deliveredDigests: turnContext.deliveredDigests })
      context.sessionBindingKey = bindingKey; context.deliveredDigests = turnContext.deliveredDigests
      if (signal.aborted) { await runtime.interrupt(run.threadId || threadId, turnId).catch(() => undefined); throw new Error('Execução interrompida.') }
      await new Promise<void>((resolve, reject) => {
        const turnKey = `${run.threadId || threadId}:${turnId}`
        if (signal.aborted) { reject(new Error('Execução interrompida.')); return }
        const completed = this.completedTurns.get(runtime)?.get(turnKey) || this.completedTurns.get(runtime)?.get(`${threadId}:${turnId}`)
        if (completed) {
          if (completed.status === 'failed') reject(new Error(completed.error || 'O agente não concluiu a resposta.'))
          else if (completed.status === 'interrupted') reject(new Error('Execução interrompida pelo agente.'))
          else resolve()
          return
        }
        if (turn.status === 'failed') { reject(new Error(turn.error?.message || 'O runtime não conseguiu iniciar a resposta.')); return }
        if (turn.status === 'interrupted') { reject(new Error('Execução interrompida pelo runtime.')); return }
        const done = (event: any) => {
          if (event.method !== 'turn/completed') return
          if (event.params?.threadId !== run.threadId) return
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
      await this.finish(context, 'completed', context.message.text)
      const deliveredReply = this.store.message(context.message.id)
      if (deliveredReply && context.sessionBindingKey && context.deliveredDigests) {
        const nextDigests = { ...context.deliveredDigests, [deliveredReply.id]: messageDigest(deliveredReply) }
        context.deliveredDigests = Object.fromEntries(Object.entries(nextDigests).slice(-40))
        this.store.putSessionBinding({ key: context.sessionBindingKey, threadId: run.threadId || threadId, runtime: agent.runtime, contextVersion: 1, deliveredDigests: context.deliveredDigests })
      }
    } catch (error) {
      await this.finish(context, signal.aborted ? 'interrupted' : 'failed', context.message.text || (error instanceof Error ? error.message : 'Erro ao executar o agente.'))
    } finally { this.contexts.delete(run.id); this.active.delete(run.id) }
  }
  private updateMessage(message: Message, status: Message['status'], value: string) {
    const next = { ...message, text: value, status }; this.store.putMessage(next); this.emitEvent({ type: 'message', message: next })
  }
  private async finish(context: RunContext, status: Run['status'], value: string) {
    if (['completed', 'interrupted', 'failed'].includes(context.run.status)) return
    if (context.flushTimer) clearTimeout(context.flushTimer)
    context.run.status = status; this.store.putRun(context.run); this.updateMessage(context.message, status, value || (status === 'completed' ? '(Sem resposta em texto.)' : ''))
    // Encerra também as esperas de aprovação: uma decisão tardia não pode executar
    // uma ferramenta depois de timeout, falha de protocolo ou interrupção do motor.
    if (status === 'failed' || status === 'interrupted') this.active.get(context.run.id)?.abort()
    this.missions.onRunFinished(context.run)
    if (status === 'completed' && !this.store.openMission(context.conversation.id)) this.notifyWhenAway(context.conversation.id, 'Tarefa concluída', `${context.agent.name} concluiu a resposta.`)
    else if (status === 'failed') this.notifyWhenAway(context.conversation.id, 'Tarefa precisa de atenção', `${context.agent.name} não conseguiu concluir a resposta.`)
  }
  /** Chamado dentro da transação que cria/associa o time. Não inicia execuções. */
  private addTeamToConversation(context: RunContext, team: string[]): Conversation {
    const current = this.store.conversation(context.conversation.id)
    if (current.archived || current.workspaceId !== context.run.workspaceId) throw new Error('A conversa mudou; a associação da equipe foi cancelada.')
    const agentIds = [...new Set([...current.agentIds, ...team])]
    if (agentIds.length > 10) throw new Error('A conversa aceita até dez participantes, incluindo o coordenador.')
    const leaderAgentId = current.leaderAgentId && agentIds.includes(current.leaderAgentId)
      ? current.leaderAgentId : agentIds.includes(context.agent.id) ? context.agent.id : agentIds[0] || null
    return this.store.saveConversation({ id: current.id, agentIds, kind: agentIds.length > 1 ? 'group' : 'direct',
      responseMode: current.kind === 'group' ? current.responseMode : 'leader', leaderAgentId })
  }
  private tools(context: RunContext): DynamicTool[] {
    const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): DynamicTool => ({ type: 'function', name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } })
    const permissions = this.store.workspace(context.run.workspaceId).permissions
    const canWrite = context.agent.canWrite && permissions?.filesWrite !== 'deny'
    const canUseComputer = context.agent.computerUse && permissions?.computerUse !== 'deny'
    const planning = context.run.planMode === true
    return [
      tool('ask_user', 'Faça uma pergunta objetiva ao usuário somente quando uma decisão bloquear o trabalho. Mostre opções claras e aguarde a resposta. Nunca use para pedir permissão de executar ferramentas.', {
        question: { type: 'string', description: 'Pergunta direta.' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
      }, ['question', 'options']),
      tool('propose_plan', 'Registre um plano visual, em etapas verificáveis, para o usuário acompanhar. No modo plano, NÃO execute mudanças.', {
        title: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 15 },
      }, ['title', 'steps']),
      tool('workspace_list', 'Lista arquivos e pastas dentro da pasta deste grupo.', { path: { type: 'string', description: 'Caminho relativo; use . para a raiz.' } }, ['path']),
      tool('workspace_read', 'Lê um arquivo de texto dentro da pasta deste grupo.', { path: { type: 'string' } }, ['path']),
      ...(canWrite && !planning ? [tool('workspace_write', 'Cria ou substitui um arquivo de texto dentro da pasta deste grupo.', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content'])] : []),
      ...(canWrite && !planning && this.store.terminalEnabled() ? [tool('workspace_run_command', 'Executa um comando não interativo no terminal com diretório de trabalho nesta conversa. Não há sandbox do sistema operacional: o comando aprovado pode acessar outros caminhos. A confirmação segue o modo de aprovação do agente; no Bypass, executa sem perguntar. Comandos podem ler ou alterar arquivos e usar programas instalados; não use para comandos interativos. A execução aparece no painel Terminal do Boobot. Para servidores e processos que não terminam, use workspace_start_process.', { command: { type: 'string', description: 'Comando de shell a executar.' } }, ['command']),
        tool('workspace_start_process', 'Inicia um processo longo (por exemplo, servidor de desenvolvimento) no painel Terminal do Boobot, nesta pasta, e devolve o ID da sessão sem esperar o fim. Mesma aprovação de workspace_run_command; não há sandbox do sistema operacional. Nunca abre terminal externo.', { command: { type: 'string', description: 'Comando de shell a iniciar.' } }, ['command']),
        tool('workspace_process_status', 'Consulta status, código de saída e o final da saída de um processo iniciado nesta conversa.', { session_id: { type: 'string' } }, ['session_id']),
        tool('workspace_stop_process', 'Encerra um processo iniciado nesta conversa e seus processos filhos.', { session_id: { type: 'string' } }, ['session_id'])] : []),
      ...(canUseComputer && !planning ? [
        tool('browser_open', 'Abre um endereço HTTP ou HTTPS no navegador interno da plataforma (abre a aba Navegador automaticamente e compartilha com você, sem clique do usuário). É o navegador padrão; prefira-o ao externo.', { url: { type: 'string' } }, ['url']),
        tool('browser_observe', 'Lê o conteúdo visível e os controles da página aberta no navegador interno (use browser_open antes se não houver página).', {}, []),
        tool('browser_click', 'Clica em um seletor CSS ou em uma posição dentro da página.', { selector: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, []),
        tool('browser_fill', 'Preenche um campo da página com texto.', { selector: { type: 'string' }, text: { type: 'string' } }, ['selector', 'text']),
        tool('browser_key', 'Indisponível: não é possível comprovar o efeito seguro da tecla neste navegador.', { key: { type: 'string' } }, ['key']),
        tool('browser_scroll', 'Rola a página aberta.', { deltaY: { type: 'number' } }, ['deltaY']),
        tool('external_browser_status', 'Verifica se o usuário autorizou, nesta conversa, o navegador real dele (Brave/Chrome pela extensão oficial) e se a ponte está disponível, com o que fazer quando não estiver. Não lê nem lista abas.', {}, []),
        ...(['codex', 'claude'].includes(context.agent.runtime) ? [tool('external_browser_request', 'Pede ao usuário autorização para usar o navegador real dele (Brave/Chrome, com sessões logadas) nesta conversa. Use só quando a tarefa depende de login ou de algo que só existe no navegador do usuário; para o resto, use o navegador interno (browser_*). Depois de autorizado, use a ferramenta js do servidor MCP politron_external_browser.', {}, [])] : []),
      ] : []),
      ...(context.agent.id !== ASSISTANT_ID ? [tool('propose_self_profile', 'Edite SEU PRÓPRIO perfil cadastrado no Boobot, inclusive se você é o Chief. Use quando perguntarem se você consegue se editar, personalizar aparência, nome, especialidade, instruções, personalidade ou comportamento. O corpo do modelo/pesos não podem ser alterados. Sugira mudanças específicas, preservando campos omitidos. A confirmação segue o modo de aprovação do agente. NÃO permite alterar runtime, modelo, permissões, papel, menção, chaves, ferramentas ou acesso ao computador.', {
        name: { type: 'string', description: 'Novo nome visível (opcional).' },
        description: { type: 'string', description: 'Especialidade ou descrição (opcional).' },
        instructions: { type: 'string', description: 'Novo conjunto COMPLETO das instruções/personalidade. Se quiser alterar só uma frase, preserve as demais instruções atuais.' },
        color: { type: 'string', description: 'Cor do corpo no formato #RRGGBB.' },
        pitsShape: { type: 'string', enum: ['round', 'flat', 'long', 'drop', 'squircle', 'bean', 'ghost-wave', 'ghost-puff', 'ghost-peak', 'cute-squid', 'soft-square', 'little-cat'] },
        pitsAccessory: { type: 'string', enum: ['none', 'antenna', 'horns', 'glasses', 'cap'] },
        pitsHeadAccessory: { type: 'string', enum: ['none', 'antenna', 'horns', 'cap', 'cap-flat', 'cap-back', 'beanie', 'bucket', 'top-hat', 'witch-hat', 'headphones', 'crown', 'party-hat', 'chef-hat', 'bow', 'flower', 'halo'] },
        pitsFaceAccessory: { type: 'string', enum: ['none', 'glasses', 'round-glasses', 'sunglasses', 'heart-glasses', 'star-glasses', 'monocle', 'mustache', 'star-mask'] },
        pitsAccessoryColors: { type: 'object', description: 'Paletas personalizadas por acessório: IDs dos itens mapeados para listas de até 3 cores #RRGGBB.' },
        pitsEyeColor: { type: 'string' }, pitsCheekColor: { type: 'string' },
        pitsEyeSize: { type: 'number' }, pitsEyeSpacing: { type: 'number' },
        pitsBodyWidth: { type: 'number' }, pitsBodyHeight: { type: 'number' },
        pitsMouthSize: { type: 'number' }, pitsBlushStrength: { type: 'number' },
        pitsBlush: { type: 'boolean' }, pitsAura: { type: 'boolean' }, pitsAnimate: { type: 'boolean' },
        pitsSpeed: { type: 'number' }, pitsAmplitude: { type: 'number' },
      }, [])] : []),
      ...(!planning ? [
        ...(!context.run.parentId ? [tool('mission_start', 'Transforma o pedido atual em missão persistente quando ele exige várias etapas, pesquisa, equipe ou validação. O Boobot passa a continuar seus turnos automaticamente até mission_complete ou mission_block, inclusive após reinício. Não use para perguntas simples.', { title: { type: 'string', description: 'Título curto do objetivo.' }, goal: { type: 'string', description: 'Objetivo completo, critérios de sucesso e restrições.' }, steps: { type: 'array', items: { type: 'string' }, maxItems: 30, description: 'Plano inicial em passos verificáveis.' }, max_turns: { type: 'number', description: 'Orçamento de turnos (padrão 20).' } }, ['goal'])] : []),
        tool('mission_update', 'Registra o plano e o progresso da missão aberta nesta conversa. Envie a lista completa de passos com status (pending, doing, done, blocked, skipped) e assignee quando delegado, e/ou uma nota curta do que foi feito com evidência.', { steps: { type: 'array', maxItems: 30, items: { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string', enum: ['pending', 'doing', 'done', 'blocked', 'skipped'] }, assignee: { type: 'string' }, note: { type: 'string' } }, required: ['title'] } }, note: { type: 'string' } }, []),
        tool('mission_complete', 'Encerra a missão aberta somente depois de executar e validar o objetivo. Informe o resultado, o que foi entregue, onde está e as evidências (testes, comandos, arquivos, fontes).', { result: { type: 'string' } }, ['result']),
        tool('mission_block', 'Pausa a missão aberta porque falta uma decisão real do usuário, credencial, acesso ou aprovação externa. Não use para decisões triviais que você pode tomar dentro das permissões.', { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, ['question']),
      ] : []),
      ...(context.agent.role === 'chief' && !planning ? [
        tool('routine_create', 'Cria uma rotina permanente (responsabilidade contínua) neste projeto: o Boobot dispara uma missão a cada execução, mesmo com o chat fechado. Use quando o usuário pedir acompanhamento recorrente, revisão diária, monitoramento ou reação a mudanças.', { name: { type: 'string' }, instructions: { type: 'string', description: 'O que verificar, o que pode corrigir sozinho e o que entregar no resumo.' }, schedule: { type: 'string', enum: ['daily', 'interval', 'app-start', 'project-changed'] }, time: { type: 'string', description: 'HH:MM para daily.' }, weekdays: { type: 'array', items: { type: 'number' }, description: '0=domingo até 6=sábado; vazio = todos.' }, minutes: { type: 'number', description: 'Para interval, mínimo 15.' }, agent: { type: 'string', description: 'Responsável; padrão é você.' }, max_turns: { type: 'number' } }, ['name', 'instructions', 'schedule']),
        tool('routine_list', 'Lista as rotinas configuradas, seus gatilhos e últimas execuções.', {}, []),
      ] : []),
      tool('group_members', context.agent.role === 'chief' ? 'Lista o catálogo de Boos e informa separadamente disponibilidade e se este Chief pode delegar para cada um neste workspace. Reutilize especialistas elegíveis antes de criar novos.' : 'Mostra os agentes desta conversa e a equipe padrão do workspace, com disponibilidade e elegibilidade para delegação.', {}, []),
      tool('search_history', 'Busca mensagens nesta conversa para recuperar o pedido e o contexto antes de responder a um follow-up curto ou ambíguo, como “encaminha”, “faz isso” ou “continua”. Consulte o histórico antes de pedir ao usuário que repita algo já explicado. A busca é limitada à conversa atual.', { query: { type: 'string', description: 'Termos concretos do pedido anterior, da correção ou do assunto citado pelo usuário.' } }, ['query']),
      tool('save_context_checkpoint', 'Salva um resumo de continuidade deste trabalho para uma futura sessão nova. Use em trabalhos longos ou antes de uma troca de contexto; não substitui os registros originais nem repete ações.', { summary: { type: 'string', description: 'Objetivo, progresso com evidências e próximos passos.' }, decisions: { type: 'array', items: { type: 'string' }, maxItems: 20 }, pending: { type: 'array', items: { type: 'string' }, maxItems: 20 } }, ['summary']),
      tool('list_skills', 'Lista as skills disponíveis (nome e quando usar cada uma): as já instaladas no Codex/Claude Code desta máquina, as que o usuário adicionou e as que você ou outro agente já aprenderam. Use antes de uma tarefa para ver se já existe um procedimento conhecido; chame read_skill para ler o conteúdo completo de uma antes de segui-la.', {}, []),
      tool('read_skill', 'Lê o conteúdo completo (SKILL.md) de uma skill pelo id devolvido por list_skills.', { id: { type: 'string' } }, ['id']),
      ...(canWrite && !planning ? [tool('save_skill', 'Grava ou corrige uma skill própria do Boobot (nunca mexe nas skills do Codex/Claude Code da máquina) para reaproveitar um procedimento que funcionou e provavelmente vai se repetir. Use só depois de confirmar com workspace_read/list_skills que já não existe uma igual; para corrigir uma skill aprendida existente, use operation "update" com o mesmo slug, sem recriar do zero.', { operation: { type: 'string', enum: ['create', 'update'] }, slug: { type: 'string', description: 'Identificador curto em minúsculas com hífen, ex.: corrigir-login-expirado.' }, name: { type: 'string' }, description: { type: 'string', description: 'Quando essa skill deve ser usada; é isso que decide se ela aparece relevante depois.' }, content: { type: 'string', description: 'O procedimento em si, em markdown.' } }, ['operation', 'slug', 'description', 'content'])] : []),
      ...(context.agent.role === 'chief' && !planning ? [
        tool('propose_agent', 'Propõe criar um agente novo (um "Boo" novo) ou alterar o perfil de um agente que já participa desta equipe. A confirmação segue o modo do Chief. Agentes novos herdam acesso a arquivos, navegador e modo de aprovação do Chief, respeitando a política do workspace. Se o usuário pedir para "criar um Boo", isso significa criar um agente: use esta ferramenta diretamente, sem perguntar o que "Pits" significa.', { operation: { type: 'string', enum: ['create', 'update'] }, agent: { type: 'string', description: 'Para update, nome ou menção do agente da equipe.' }, name: { type: 'string' }, alias: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' } }, ['operation', 'name', 'instructions']),
        tool('propose_agent_model', 'Propõe mudar o runtime/modelo/esforço de um Boo da equipe. Use quando o usuário pedir para trocar GPT por Claude, Codex por outro motor ou definir outro modelo para front-end/back-end. A confirmação segue o modo de aprovação do Chief; NÃO muda permissões, papel, nome nem avatar. Modelo vazio seleciona o padrão do runtime.', { agent: { type: 'string', description: 'Nome ou @menção do Boo a reconfigurar.' }, runtime: { type: 'string', enum: ['codex','claude','pi','opencode','antigravity'] }, model: { type: 'string', description: 'Identificador exato do modelo; vazio usa o padrão do motor.' }, effort: { type: 'string', enum: ['low','medium','high','xhigh','max'] } }, ['agent','runtime']),
        tool('propose_boos', 'Propõe 1 a 5 Boos com UMA aprovação. Primeiro consulte group_members e reutilize especialistas adequados. Se o usuário pedir uma EQUIPE, escolha purpose=team (padrão): os novos Boos são PERMANENTES, mesmo que ele cite um projeto ou tarefa, exceto se pedir explicitamente temporários. Se o Chief identificar, por iniciativa própria, falta de especialista para uma tarefa pontual, escolha purpose=task: os novos Boos são TEMPORÁRIOS e se aposentam após a delegação; não crie se um Boo existente servir. Cada Boo recebe nome de mitologia misturada e cor coerente com a função, quando não informados. O campo temporary substitui o padrão individual apenas para respeitar pedido explícito do usuário. Herda as permissões e o modo de aprovação do Chief, sem ampliar seu acesso. Para purpose=team, exige chiefManageTeam e associa os Boos à equipe padrão e à conversa atual na mesma operação; sem essa permissão, falha antes de criar qualquer Boo. Continue com ask_agent se o pedido incluir trabalho para o time.', { purpose: { type: 'string', enum: ['team', 'task'], description: 'team (padrão) = equipe permanente pedida pelo usuário; task = reforço temporário proposto espontaneamente pelo Chief para lacuna numa tarefa pontual.' }, agents: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' }, color: { type: 'string' }, temporary: { type: 'boolean', description: 'Defina apenas se o usuário pedir exceção explícita. O padrão depende de purpose.' } }, required: ['instructions'] } } }, ['agents']),
        tool('propose_team', 'Altera a equipe padrão deste workspace e adiciona os Boos à conversa atual, preservando o coordenador e sem iniciar broadcast. A confirmação segue o modo do Chief.', { agents: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, ['agents']),
        tool('propose_session', 'Propõe criar uma nova sessão neste workspace, com a equipe informada ou o Assistente padrão. A confirmação segue o modo do Chief.', { name: { type: 'string' }, agents: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, ['name', 'agents']),
      ] : []),
      tool('ask_agent', context.agent.role === 'chief' ? 'Delegue apenas a candidatos com canDelegate=true em group_members, quando o usuário pedir encaminhamento ou quando a tarefa se beneficiar de trabalho paralelo. A confirmação segue o modo do Chief; no Bypass, delegue sem perguntar novamente. Se o usuário fizer um follow-up curto, consulte search_history para identificar o pedido original antes de perguntar novamente. Escreva um pedido autônomo com objetivo, sintomas ou contexto, arquivos relevantes e resultado esperado; não dependa de referências como “isso” ou de histórico que o destinatário não verá. Para complementar uma tarefa anterior do mesmo especialista, use delegation_id da resposta; isso reutiliza a conversa privada e preserva as evidências.' : 'Pede a outro agente cadastrado uma análise ou tarefa. O pedido será executado em uma conversa privada, com as instruções e permissões próprias do destinatário. Use mode=background para continuar sem aguardar; o resultado será publicado nesta conversa quando terminar. Marque continue_on_result para receber uma continuação sua depois do resultado. Para complementar uma tarefa anterior do mesmo especialista, use delegation_id da resposta.', { agent: { type: 'string', description: 'Nome ou menção do agente.' }, task: { type: 'string', description: 'Pedido autônomo: objetivo, problema e sintomas, contexto e resultado esperado.' }, delegation_id: { type: 'string', description: 'ID devolvido por uma delegação anterior para continuar com o mesmo destinatário na mesma conversa privada.' }, mode: { type: 'string', enum: ['wait', 'background'], description: 'wait aguarda o resultado; background devolve um recibo e publica o resultado mais tarde.' }, continue_on_result: { type: 'boolean', description: 'Depois do resultado em background, iniciar uma única continuação sua nesta conversa.' } }, ['agent', 'task']),
      tool('delegation_result', 'Consulta o resultado, as evidências de arquivos e os registros de comandos de uma delegação autorizada. Use o ID recebido em ask_agent antes de repetir trabalho ou pedir um complemento.', { delegation_id: { type: 'string', description: 'ID da delegação recebida na resposta de ask_agent.' } }, ['delegation_id'])
    ]
  }
  private async onRuntimeEvent(event: any, runtime: AgentRuntime) {
    const params = event?.params || {}
    if (event.method === 'turn/completed' && params.threadId && params.turn?.id) {
      const outcomes = this.completedTurns.get(runtime) || new Map<string, { status: string; error?: string }>()
      outcomes.set(`${params.threadId}:${params.turn.id}`, { status: params.turn.status, error: typeof params.turn.error === 'string' ? params.turn.error : params.turn.error?.message })
      if (outcomes.size > 1000) outcomes.delete(outcomes.keys().next().value!)
      this.completedTurns.set(runtime, outcomes)
    }
    if (event.method === 'item/tool/call') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (!context) { runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: 'Execução não encontrada.' }] }); return }
      const activity = typeof params.tool === 'string' ? toolActivityText(params.tool, params.arguments || {}) : null
      if (activity) this.addMessage(context.conversation.id, context.agent, 'activity', redactApprovalUrls(activity), 'completed', context.run.id)
      try {
        const result = await this.callTool(context, params.tool, params.arguments || {}, String(event.id ?? params.toolCallId ?? ''))
        runtime.respond(event.id, { success: true, contentItems: [{ type: 'inputText', text: typeof result === 'string' ? result : JSON.stringify(result) }] })
      } catch (error) { runtime.respond(event.id, { success: false, contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : 'A ferramenta falhou.' }] }) }
      return
    }
    if (event.method === 'item/agentMessage/delta') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.delta === 'string' && params.delta.length) {
        this.replyFor(context, typeof params.itemId === 'string' ? params.itemId : undefined)
        const firstToken = !context.message.text
        context.message.text += params.delta
        if (firstToken) {
          // Never hold the first real model output behind a streaming batch timer.
          if (context.flushTimer) { clearTimeout(context.flushTimer); context.flushTimer = undefined }
          this.updateMessage(context.message, 'running', context.message.text)
        } else if (!context.flushTimer) {
          // Coalesce later deltas at display-frame cadence to avoid saturating IPC.
          context.flushTimer = setTimeout(() => { context.flushTimer = undefined; this.updateMessage(context.message, 'running', context.message.text) }, 16)
        }
      }
    }
    if (event.method === 'item/completed' && params.item?.type === 'agentMessage') {
      const context = [...this.contexts.values()].find(entry => entry.runtime === runtime && entry.run.threadId === params.threadId && entry.run.turnId === params.turnId)
      if (context && typeof params.item.text === 'string') {
        const itemId = typeof params.item.id === 'string' ? params.item.id : undefined
        let value: string = params.item.text
        // Sem id, Pi/OpenCode/CLI entregam o texto acumulado do turno: tira o que já foi para mensagens anteriores.
        if (!itemId && context.priorText) value = value.startsWith(context.priorText) ? value.slice(context.priorText.length).trimStart() : context.message.text || value
        if (!value.trim()) return
        if (itemId) this.replyFor(context, itemId)
        if (context.flushTimer) { clearTimeout(context.flushTimer); context.flushTimer = undefined }
        context.message.text = value
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
    const workspace = this.store.workspace(context.run.workspaceId)
    if (name.startsWith('mission_') && !context.run.planMode) return this.missions.tool({ conversationId: context.conversation.id, agentId: context.agent.id, runId: context.run.id, parentRunId: context.run.parentId, workspaceId: context.run.workspaceId }, name, args)
    if (name === 'routine_list') return JSON.stringify(this.store.routines().map(routine => ({ id: routine.id, name: routine.name, enabled: routine.enabled, trigger: describeTrigger(routine.trigger), agentId: routine.agentId, workspaceId: routine.workspaceId, lastRunAt: routine.lastRunAt, nextRunAt: routine.nextRunAt })))
    if (name === 'routine_create') {
      if (context.agent.role !== 'chief' || context.run.planMode) throw new Error('Somente o Chief cria rotinas fora do modo plano.')
      const schedule = String(args.schedule)
      const trigger = validateTrigger(schedule === 'daily' ? { kind: 'daily', time: args.time, weekdays: args.weekdays } : schedule === 'interval' ? { kind: 'interval', minutes: args.minutes } : { kind: 'event', event: schedule })
      const requested = typeof args.agent === 'string' ? args.agent.replace(/^@/, '').trim().toLocaleLowerCase('pt-BR') : ''
      const agent = requested ? this.store.agents().find(item => item.temporaryStatus !== 'retired' && (item.alias.toLocaleLowerCase('pt-BR') === requested || item.name.toLocaleLowerCase('pt-BR') === requested)) : context.agent
      if (!agent) throw new Error('Responsável não encontrado.')
      const routineName = text(args.name, 80).trim()
      const instructions = text(args.instructions, 8000).trim()
      if (!await this.requestApproval(context, 'agent-change', { action: `Criar rotina ${routineName} (${describeTrigger(trigger)})`, recipientName: agent.name, task: instructions })) return 'Criação da rotina negada pelo usuário.'
      const routine = this.missions.saveRoutine({ name: routineName, instructions, agentId: agent.id, workspaceId: context.run.workspaceId, trigger, maxTurns: typeof args.max_turns === 'number' ? args.max_turns : undefined, enabled: true })
      return `Rotina ${routine.name} criada (${describeTrigger(routine.trigger)}${routine.nextRunAt ? `, próxima em ${new Date(routine.nextRunAt).toLocaleString('pt-BR')}` : ''}). Ela aparece em Rotinas e roda mesmo com o chat fechado enquanto o Boobot estiver aberto ou na bandeja.`
    }
    if (name === 'ask_user') {
      const question = text(args.question, 500).trim()
      const raw = args.options
      if (!question || !Array.isArray(raw) || raw.length < 2 || raw.length > 6 ||
        !raw.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100))
        throw new Error('Pergunta ou opções inválidas.')
      return 'Resposta do usuário: ' + await this.askUser(context, question, raw as string[])
    }
    if (name === 'propose_plan') {
      const title = text(args.title, 140).trim()
      const raw = args.steps
      if (!title || !Array.isArray(raw) || raw.length < 1 || raw.length > 15 ||
        !raw.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 300))
        throw new Error('Título ou etapas do plano inválidos.')
      const record: Approval = { id: randomUUID(), runId: context.run.id, conversationId: context.conversation.id,
        agentId: context.agent.id, kind: 'plan', details: { planTitle: title, planSteps: raw as string[] },
        status: 'approved', createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString() }
      this.store.putApproval(record); this.emitEvent({ type: 'approval', approval: record })
      return context.run.planMode
        ? 'Plano apresentado no Boobot. Aguarde o próximo pedido do usuário fora do modo plano.'
        : 'Plano registrado no Boobot. Continue a execução da tarefa autorizada e valide o resultado.'
    }
    if (context.run.planMode && !['workspace_list', 'workspace_read', 'ask_user', 'propose_plan',
      'group_members', 'search_history', 'list_skills', 'read_skill'].includes(name))
      throw new Error('Modo plano: ferramenta de alteração indisponível.')
    if (name === 'workspace_run_command') {
      if (!this.store.terminalEnabled()) throw new Error('A execução de comandos no terminal está desativada nas configurações globais.')
      if (!context.agent.canWrite) throw new Error('Este agente não tem permissão de escrita para executar comandos.')
      if (workspace.permissions?.filesWrite === 'deny') throw new Error('A política deste workspace bloqueia comandos que podem alterar arquivos.')
      const command = text(args.command, 8000).trim()
      if (!command) throw new Error('Informe um comando para executar.')
      if (!await this.requestApproval(context, 'command', { command, cwd: root }, isSensitiveCommand(command))) return 'O usuário não aprovou a execução do comando.'
      return runWorkspaceCommand(command, root, context, callId || randomUUID(), this.store, this.agentTerminals)
    }
    if (name === 'workspace_start_process') {
      if (!this.store.terminalEnabled()) throw new Error('A execução de comandos no terminal está desativada nas configurações globais.')
      if (!context.agent.canWrite) throw new Error('Este agente não tem permissão de escrita para executar comandos.')
      if (workspace.permissions?.filesWrite === 'deny') throw new Error('A política deste workspace bloqueia comandos que podem alterar arquivos.')
      const command = text(args.command, 8000).trim()
      if (!command) throw new Error('Informe um comando para iniciar.')
      if (!await this.requestApproval(context, 'command', { command, cwd: root }, isSensitiveCommand(command))) return 'O usuário não aprovou a execução do comando.'
      const toolCallId = callId || randomUUID(), createdAt = new Date().toISOString()
      const session = this.agentTerminals.start({ command, cwd: root, owner: terminalOwner(context), onFinish: done => {
        if (done.status === 'running') return
        this.store.putCommandEvidence(createCommandEvidence({ runId: context.run.id, toolCallId, agentId: context.agent.id, conversationId: context.conversation.id, workspaceId: context.run.workspaceId, command, cwd: root },
          { output: stripTerminalControls(done.output), exitCode: done.exitCode, status: done.status, truncated: done.truncated }, createdAt))
      } })
      return `Processo iniciado no painel Terminal do Boobot. Sessão: ${session.id}. Status: ${session.status}. Use workspace_process_status para acompanhar e workspace_stop_process para encerrar.`
    }
    if (name === 'workspace_process_status' || name === 'workspace_stop_process') {
      const sessionId = text(args.session_id, 100)
      const scope = { workspaceId: context.run.workspaceId, conversationId: context.conversation.id }
      if (name === 'workspace_stop_process') this.agentTerminals.stop(sessionId, scope)
      const session = this.agentTerminals.get(sessionId, scope)
      const output = stripTerminalControls(session.output).slice(-8000)
      return `Sessão ${session.id} (${session.command}): ${session.status}${session.exitCode !== null ? `, código ${session.exitCode}` : ''}.${name === 'workspace_stop_process' ? ' Encerramento solicitado.' : ''}\nSaída recente${session.truncated ? ' (truncada)' : ''}:\n${output}`
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
      if (!context.agent.canWrite) throw new Error('Este agente não tem permissão para alterar arquivos.')
      if (workspace.permissions?.filesWrite === 'deny') throw new Error('A política deste workspace bloqueia alterações em arquivos.')
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
      let original = Buffer.alloc(0)
      let expectedVersion: Awaited<ReturnType<typeof captureFileVersion>>
      try {
        expectedVersion = await captureFileVersion(root, relativePath)
        if (expectedVersion.exists) original = await fs.readFile(target)
        binary = original.includes(0)
        truncated = original.length > 200_000 || Buffer.byteLength(content) > 200_000
        if (!binary) before = original.subarray(0, 200_000).toString('utf8')
      } catch (error) { record('failed', before, '', binary, truncated); throw error }
      const next = Buffer.from(content, 'utf8')
      if (expectedVersion.exists && fileContentMatches(original, next)) { record('unchanged', before, binary ? '' : before, binary, truncated); return `Sem alterações: ${relativePath}` }
      if (!await this.requestApproval(context, 'write', { path: relativePath, before: binary ? '' : before, after: content.slice(0, 200_000), truncated: truncated || content.length > 200_000 })) {
        record('failed', before, before, binary, truncated)
        return `Alteração negada pelo usuário: ${relativePath}`
      }
      try {
        await commitFileWrite({ root, relativePath, content: next, expectedVersion, signal: this.active.get(context.run.id)?.signal })
        const afterBinary = next.includes(0)
        const after = afterBinary ? '' : next.subarray(0, 200_000).toString('utf8')
        record('applied', before, after, binary || afterBinary, truncated || next.length > 200_000)
      } catch (error) {
        record(error instanceof FileVersionConflictError || this.active.get(context.run.id)?.signal.aborted ? 'failed' : 'unknown', before, '', binary, truncated)
        throw error
      }
      return `Arquivo salvo: ${relative(root, target)}`
    }
    if (name === 'group_members') {
      // O Chief coordena o aplicativo inteiro: precisa enxergar todo o catálogo, não só quem já está nesta conversa.
      const ids = context.agent.role === 'chief' ? this.store.agents().filter(item => item.temporaryStatus !== 'retired' && (!item.temporary || item.temporaryWorkspaceId === workspace.id)).map(item => item.id) : [...new Set([...context.conversation.agentIds, ...workspace.defaultAgentIds])]
      const busyIds = new Set(this.store.runs().filter(run => ['queued', 'running', 'waiting'].includes(run.status)).map(run => run.agentId))
      const eligibilityContext = { agentId: context.agent.id, role: context.agent.role, workspaceId: workspace.id, eligibleAgentIds: new Set([...context.conversation.agentIds, ...workspace.defaultAgentIds]), ancestry: context.run.ancestry || [context.agent.id] }
      return ids.map(id => {
        const agent = this.store.agent(id)
        const eligibility = delegationEligibility(eligibilityContext, agent)
        return { name: agent.name, alias: `@${agent.alias}`, description: agent.description, runtime: agent.runtime,
          temporary: agent.temporary === true, availability: agent.temporaryStatus === 'working' || busyIds.has(id) ? 'busy' : 'available',
          canDelegate: eligibility.canDelegate, ...(eligibility.reason ? { reason: eligibility.reason } : {}) }
      })
    }
    if (name === 'search_history') {
      const query = text(args.query, 200)
      const hits = this.store.searchHistory(context.conversation.id, query, 8)
      return hits.length ? JSON.stringify(hits.map(hit => ({ author: hit.message.author, createdAt: hit.message.createdAt, snippet: hit.snippet, messageId: hit.message.id }))) : 'Nenhuma mensagem correspondente nesta conversa.'
    }
    if (name === 'save_context_checkpoint') {
      const asList = (value: unknown, label: string) => {
        if (value === undefined) return []
        if (!Array.isArray(value) || value.length > 20) throw new Error(`${label} precisa ser uma lista com até vinte itens.`)
        return value.map(item => text(item, 500))
      }
      const checkpoint = { id: randomUUID(), conversationId: context.conversation.id, agentId: context.agent.id, runId: context.run.id, summary: text(args.summary, 8000), decisions: asList(args.decisions, 'Decisões'), pending: asList(args.pending, 'Pendências'), createdAt: new Date().toISOString() }
      this.store.saveCheckpoint(checkpoint)
      return `Checkpoint salvo (${checkpoint.id}). Será recuperado quando uma sessão nova deste agente for iniciada nesta conversa.`
    }
    if (name === 'list_skills') {
      const skills = await this.skills.list()
      return skills.length ? JSON.stringify(skills.map(skill => ({ id: skill.id, name: skill.name, description: skill.description, source: skill.source }))) : 'Nenhuma skill encontrada.'
    }
    if (name === 'read_skill') return this.skills.readContent(text(args.id, 500))
    if (name === 'save_skill') {
      if (workspace.permissions?.filesWrite === 'deny' || !context.agent.canWrite) throw new Error('Este Boo não tem permissão para criar ou alterar skills.')
      const operation = args.operation === 'update' ? 'update' : args.operation === 'create' ? 'create' : null
      if (!operation) throw new Error('Escolha create ou update.')
      const saved = await this.skills.save({ operation, slug: text(args.slug, 100), name: text(args.name ?? args.slug, 100), description: text(args.description, 500), content: text(args.content, 20000) })
      this.emitEvent({ type: 'changed' })
      return `Skill "${saved.name}" ${operation === 'create' ? 'criada' : 'atualizada'} (${saved.id}). Aparece em Configurações → Skills.`
    }
    if (name === 'propose_self_profile') {
      if (context.agent.id === ASSISTANT_ID) throw new Error('O Assistente padrão não tem perfil cadastrado para autoedição.')
      const original = this.store.agent(context.agent.id)
      const next = buildSelfProfileUpdate(original, args)
      const changedKeys = SELF_PROFILE_FIELDS.filter(key => next[key] !== original[key])
      if (!changedKeys.length) return 'Seu perfil já possui esses valores; nenhuma alteração necessária.'
      const proposal = {
        operation: 'self-profile', agentId: original.id, agent: original.name,
        changes: Object.fromEntries(changedKeys.map(key => [key, next[key]])),
      }
      const description = changedKeys.map(key => key === 'instructions' ? 'instruções/personalidade' : key).join(', ')
      if (!await this.requestApproval(context, 'agent-change', {
        action: 'Editar meu perfil no Boobot: ' + original.name,
        task: 'Alterar: ' + description,
        proposal: JSON.stringify(proposal),
      })) return 'Autoedição cancelada: o usuário não aprovou a proposta.'
      // Reaplicar sobre a versão mais recente evita sobrescrever outras edições enquanto a aprovação estava pendente.
      const current = this.store.agent(context.agent.id)
      const saved = this.store.saveAgent(buildSelfProfileUpdate(current, args))
      this.emitEvent({ type: 'changed' })
      return 'Perfil de ' + saved.name + ' atualizado com aprovação. As alterações de personalidade/instruções passam a valer em novas respostas; nenhuma permissão, modelo ou runtime foi alterado.'
    }
    if (name === 'propose_boos') {
      if (context.agent.role !== 'chief') throw new Error('Somente o Chief pode criar equipes de Boos.')
      if (!workspace.permissions?.chiefCreateAgents) throw new Error('O Chief não pode criar agentes neste workspace ainda.' + howToEnablePermission('Chief pode propor novos agentes'))
      if (args.purpose !== undefined && args.purpose !== 'team' && args.purpose !== 'task') throw new Error('Finalidade inválida: use team ou task.')
      const purpose = args.purpose === 'task' ? 'task' : 'team'
      if (purpose === 'team' && !workspace.permissions?.chiefManageTeam) throw new Error('O Chief não pode formar uma equipe neste workspace porque a permissão de associação está desativada. Nenhum Boo foi criado.' + howToEnablePermission('Chief pode propor mudanças na equipe'))
      if (!Array.isArray(args.agents) || !args.agents.length || args.agents.length > 5) throw new Error('Informe entre um e cinco Boos.')
      const existingAgents = this.store.agents()
      const currentTemp = existingAgents.filter(agent => agent.temporary && agent.temporaryWorkspaceId === workspace.id && agent.temporaryStatus !== 'retired').length
      const proposed: Partial<Agent>[] = []
      for (const item of args.agents) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Cada Boo precisa de uma especialidade válida.')
        const input = item as Record<string, unknown>
        const instructions = text(input.instructions, 20000).trim()
        const description = text(input.description ?? '', 500).trim()
        if (!instructions) throw new Error('Cada Boo precisa de instruções de trabalho.')
        const identity = chooseBooIdentity({ name: text(input.name ?? '', 80), color: text(input.color ?? '', 7), description, instructions }, [...existingAgents, ...(proposed as Agent[])])
        if (existingAgents.some(agent => agent.name.toLocaleLowerCase('pt-BR') === identity.name.toLocaleLowerCase('pt-BR')) && typeof input.name === 'string' && input.name.trim()) throw new Error('Já existe um Boo com esse nome. Reutilize-o ou escolha outro.')
        if (input.temporary !== undefined && typeof input.temporary !== 'boolean') throw new Error('temporary deve ser verdadeiro ou falso.')
        const temporary = typeof input.temporary === 'boolean' ? input.temporary : purpose === 'task'
        proposed.push({ ...identity, description, instructions, temporary, temporaryStatus: temporary ? 'available' : undefined, temporaryWorkspaceId: temporary ? workspace.id : undefined, temporaryTask: temporary ? description || instructions.slice(0, 500) : undefined, runtime: context.agent.runtime, model: context.agent.model, effort: context.agent.effort, role: 'agent', canWrite: context.agent.canWrite, computerUse: context.agent.computerUse, approvalMode: context.agent.approvalMode })
      }
      if (currentTemp + proposed.filter(item => item.temporary).length > 10) throw new Error('Limite de dez Boos temporários ativos por workspace.')
      const taskLabel = proposed.map(item => String(item.name) + ': ' + String(item.description || item.instructions)).join('\n').slice(0, 5000)
      const attachTeam = purpose === 'team'
      const proposal = { workspaceId: workspace.id, purpose, conversationId: attachTeam ? context.conversation.id : undefined,
        access: { canWrite: context.agent.canWrite, computerUse: context.agent.computerUse, approvalMode: context.agent.approvalMode },
        agents: proposed.map(item => ({ name: item.name, alias: item.alias, color: item.color, temporary: item.temporary, description: item.description, instructions: item.instructions })) }
      if (!await this.requestApproval(context, 'agent-change', { action: (purpose === 'team' ? 'Criar equipe de ' : 'Criar reforço de ') + proposed.length + (proposed.length === 1 ? ' Boo' : ' Boos'), task: taskLabel, proposal: JSON.stringify(proposal) })) return 'Criação dos Boos negada pelo usuário.'
      this.store.db.exec('BEGIN IMMEDIATE')
      let saved: Agent[]
      let updatedConversation: Conversation | undefined
      try {
        const latest = this.store.workspace(workspace.id)
        if (latest.archived || !latest.permissions?.chiefCreateAgents || attachTeam && !latest.permissions?.chiefManageTeam) throw new Error('As permissões do workspace mudaram; a criação foi cancelada.')
        saved = proposed.map(agent => this.store.saveAgent(agent))
        if (attachTeam) {
          this.store.saveWorkspace({ id: workspace.id, defaultAgentIds: [...new Set([...latest.defaultAgentIds, ...saved.map(agent => agent.id)])] })
          updatedConversation = this.addTeamToConversation(context, saved.map(agent => agent.id))
        }
        this.store.db.exec('COMMIT')
      }
      catch (error) { this.store.db.exec('ROLLBACK'); throw error }
      if (updatedConversation) context.conversation = updatedConversation
      this.emitEvent({ type: 'changed' })
      return 'Boos criados: ' + saved.map(agent => agent.name + ' (@' + agent.alias + ', ' + agent.color + (agent.temporary ? ', temporário' : ', permanente') + ')').join('; ') + '.'
        + ' Equipe associada ao workspace e à conversa atual. Continue com ask_agent para executar as tarefas solicitadas.'
        + (saved.some(agent => agent.temporary) ? ' Os temporários estão disponíveis via ask_agent neste workspace e serão aposentados após uma tarefa, sem apagar o histórico.' : ' Os Boos são permanentes.')
    }
    if (name === 'propose_agent_model') {
      if (context.agent.role !== 'chief') throw new Error('Somente o Chief pode propor troca de modelos.')
      if (!workspace.permissions?.chiefEditAgents) throw new Error('O Chief não pode editar agentes neste workspace ainda.' + howToEnablePermission('Chief pode propor alterações de agentes'))
      const requested = text(args.agent, 100).trim().replace(/^@/, '').toLocaleLowerCase('pt-BR')
      const candidate = this.store.agents().find(item => item.temporaryStatus !== 'retired' && [...context.conversation.agentIds, ...workspace.defaultAgentIds].includes(item.id) && (item.alias.toLocaleLowerCase('pt-BR') === requested || item.name.toLocaleLowerCase('pt-BR') === requested))
      if (!candidate) throw new Error('Boo não encontrado na equipe deste workspace.')
      const runtime = args.runtime
      if (!['codex','claude','pi','opencode','antigravity'].includes(String(runtime))) throw new Error('Motor inválido.')
      const model = args.model === undefined ? '' : text(args.model, 150)
      const effort = args.effort === undefined ? candidate.effort || 'medium' : String(args.effort)
      if (!['low','medium','high','xhigh','max'].includes(effort)) throw new Error('Esforço inválido.')
      const proposal = { agentId: candidate.id, agent: candidate.name, previous: { runtime: candidate.runtime, model: candidate.model, effort: candidate.effort }, next: { runtime, model, effort } }
      const approved = await this.requestApproval(context, 'agent-change', { action: 'Trocar modelo de ' + candidate.name, recipientName: candidate.name, proposal: JSON.stringify(proposal) })
      if (!approved) return 'Troca de modelo não aprovada.'
      const current = this.store.agent(candidate.id)
      this.store.saveAgent({ ...current, runtime: runtime as Agent['runtime'], model, effort: effort as Agent['effort'] })
      this.emitEvent({ type: 'changed' })
      return 'Modelo de ' + candidate.name + ' alterado para ' + runtime + (model ? '/' + model : ' (padrão)') + '.'
    }
    if (name === 'propose_agent') {
      if (context.agent.role !== 'chief') throw new Error('Somente o Chief pode propor alterações no catálogo de agentes.')
      const operation = args.operation === 'update' ? 'update' : args.operation === 'create' ? 'create' : null
      if (!operation) throw new Error('Escolha criar ou atualizar um agente.')
      if (operation === 'create' && !workspace.permissions?.chiefCreateAgents) throw new Error('O Chief não pode criar agentes neste workspace ainda.' + howToEnablePermission('Chief pode propor novos agentes'))
      if (operation === 'update' && !workspace.permissions?.chiefEditAgents) throw new Error('O Chief não pode editar agentes neste workspace ainda.' + howToEnablePermission('Chief pode propor alterações de agentes'))
      const nameValue = text(args.name, 80).trim()
      const instructions = text(args.instructions, 20000).trim()
      const description = text(args.description ?? '', 500).trim()
      const existing = operation === 'update' ? this.store.agents().find(agent => agent.alias.toLocaleLowerCase('pt-BR') === String(args.agent || '').replace(/^@/, '').toLocaleLowerCase('pt-BR') || agent.name.toLocaleLowerCase('pt-BR') === String(args.agent || '').toLocaleLowerCase('pt-BR')) : undefined
      if (operation === 'update' && (!existing || ![...context.conversation.agentIds, ...workspace.defaultAgentIds].includes(existing.id))) throw new Error('O Chief só pode propor alterações em agentes desta equipe.')
      if (!nameValue || !instructions) throw new Error('A proposta precisa de nome e instruções.')
      const desiredAlias = (text(args.alias ?? existing?.alias ?? '', 80).trim() || nameValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
      if (!/^[\p{L}\p{N}_-]+$/u.test(desiredAlias)) throw new Error('A menção proposta deve usar letras, números, hífen ou sublinhado.')
      if (this.store.agents().some(agent => agent.id !== existing?.id && agent.alias.toLocaleLowerCase('pt-BR') === desiredAlias.toLocaleLowerCase('pt-BR'))) throw new Error('A menção proposta já pertence a outro agente.')
      const proposal = operation === 'create'
        ? { operation, name: nameValue, alias: desiredAlias, description, instructions, runtime: context.agent.runtime, model: context.agent.model, effort: context.agent.effort, canWrite: context.agent.canWrite, computerUse: context.agent.computerUse, approvalMode: context.agent.approvalMode }
        : { operation, id: existing!.id, previousName: existing!.name, name: nameValue, alias: desiredAlias, description, instructions, runtime: existing!.runtime, model: existing!.model, effort: existing!.effort, role: existing!.role || 'agent', color: existing!.color, avatar: existing!.avatar ? 'Imagem existente preservada' : '', pitsShape: existing!.pitsShape, pitsEyeColor: existing!.pitsEyeColor, pitsEyeSize: existing!.pitsEyeSize, pitsEyeSpacing: existing!.pitsEyeSpacing, pitsCheekColor: existing!.pitsCheekColor, pitsBlush: existing!.pitsBlush, pitsAura: existing!.pitsAura, pitsAnimate: existing!.pitsAnimate, pitsSpeed: existing!.pitsSpeed, pitsAmplitude: existing!.pitsAmplitude, canWrite: existing!.canWrite, computerUse: existing!.computerUse, approvalMode: existing!.approvalMode }
      const label = operation === 'create' ? `Criar agente ${nameValue}` : `Atualizar agente ${existing!.name}`
      if (!await this.requestApproval(context, 'agent-change', { action: label, recipientName: nameValue, task: instructions, proposal: JSON.stringify(proposal) })) return `Proposta negada: ${label}.`
      const saveInput = operation === 'create' ? proposal as Partial<Agent> : { ...existing!, name: nameValue, alias: desiredAlias, description, instructions }
      const saved = this.store.saveAgent(saveInput)
      this.emitEvent({ type: 'changed' })
      return `Alteração aprovada e salva para ${saved.name}.`
    }
    if (name === 'propose_team') {
      if (context.agent.role !== 'chief') throw new Error('Somente o Chief pode propor alterações de equipe.')
      if (!workspace.permissions?.chiefManageTeam) throw new Error('O Chief não pode alterar a equipe deste workspace ainda.' + howToEnablePermission('Chief pode propor mudanças na equipe'))
      if (!Array.isArray(args.agents) || args.agents.length > 10 || args.agents.some(id => typeof id !== 'string')) throw new Error('Informe até dez nomes ou menções de agentes.')
      const requestedNames = args.agents.map(value => String(value).replace(/^@/, '').trim())
      const team = requestedNames.map(value => this.store.agents().find(agent => agent.temporaryStatus !== 'retired' && (agent.id === value || agent.alias.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR') || agent.name.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))))
      if (team.some(agent => !agent)) throw new Error('A proposta inclui um agente que não existe.')
      const agentIds = [...new Set(team.map(agent => agent!.id))]
      const proposal = { workspaceId: workspace.id, workspace: workspace.name, conversationId: context.conversation.id, agentIds, agents: team.map(agent => agent!.name) }
      if (!await this.requestApproval(context, 'agent-change', { action: `Alterar equipe de ${workspace.name}`, task: team.map(agent => agent!.name).join(', ') || 'Equipe vazia', proposal: JSON.stringify(proposal) })) return `Proposta de equipe negada para ${workspace.name}.`
      this.store.db.exec('BEGIN IMMEDIATE')
      let updatedConversation: Conversation
      try {
        const latest = this.store.workspace(workspace.id)
        if (latest.archived || !latest.permissions?.chiefManageTeam) throw new Error('As permissões do workspace mudaram; a associação foi cancelada.')
        this.store.saveWorkspace({ id: workspace.id, defaultAgentIds: agentIds })
        updatedConversation = this.addTeamToConversation(context, agentIds)
        this.store.db.exec('COMMIT')
      } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
      context.conversation = updatedConversation
      this.emitEvent({ type: 'changed' })
      return `Equipe atualizada em ${workspace.name} e adicionada à conversa atual. Continue as tarefas autorizadas com ask_agent.`
    }
    if (name === 'propose_session') {
      if (context.agent.role !== 'chief') throw new Error('Somente o Chief pode propor sessões.')
      if (!workspace.permissions?.chiefCreateSessions) throw new Error('O Chief não pode criar sessões neste workspace ainda.' + howToEnablePermission('Chief pode propor novas sessões'))
      const sessionName = text(args.name, 100).trim()
      if (!sessionName) throw new Error('Informe um nome para a sessão proposta.')
      if (!Array.isArray(args.agents) || args.agents.length > 10 || args.agents.some(id => typeof id !== 'string')) throw new Error('Informe até dez agentes para a sessão.')
      const requestedNames = args.agents.map(value => String(value).replace(/^@/, '').trim())
      const eligibleIds = new Set([...context.conversation.agentIds, ...workspace.defaultAgentIds])
      const team = requestedNames.map(value => this.store.agents().find(agent => agent.temporaryStatus !== 'retired' && (eligibleIds.has(agent.id) || (agent.temporary && agent.temporaryWorkspaceId === workspace.id && agent.temporaryStatus === 'available')) && (agent.id === value || agent.alias.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR') || agent.name.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))))
      if (team.some(agent => !agent)) throw new Error('A sessão proposta só pode incluir agentes desta equipe.')
      const agentIds = [...new Set(team.map(agent => agent!.id))]
      const proposal = { workspaceId: workspace.id, workspace: workspace.name, name: sessionName, kind: agentIds.length > 1 ? 'group' : 'direct', agentIds, agents: team.map(agent => agent!.name) }
      if (!await this.requestApproval(context, 'agent-change', { action: `Criar sessão ${sessionName} em ${workspace.name}`, task: agentIds.length ? `Participantes: ${team.map(agent => agent!.name).join(', ')}` : 'Assistente padrão', proposal: JSON.stringify(proposal) })) return `Proposta de sessão negada: ${sessionName}.`
      const conversation = this.store.saveConversation({ workspaceId: workspace.id, name: sessionName, kind: agentIds.length > 1 ? 'group' : 'direct', agentIds })
      this.emitEvent({ type: 'changed' })
      return `Sessão ${conversation.name} aprovada e criada em ${workspace.name}.`
    }
    if (['browser_open', 'browser_observe', 'browser_click', 'browser_fill', 'browser_key', 'browser_scroll'].includes(name)) {
      const owner = { workspaceId: context.run.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }
      const check = () => {
        if (context.signal?.aborted || !this.canShareBrowser(owner)) throw new Error('O uso do navegador está bloqueado neste agente ou workspace.')
        if (!this.platformBrowser) throw new Error('O navegador compartilhado da plataforma não está disponível.')
        return this.platformBrowser
      }
      const activeBrowser = check()
      if (name === 'browser_key') throw new Error('Tecla não suportada com segurança; o foco não foi alterado.')
      const busy = this.browserBusyBy(owner)
      if (busy) throw new Error(`Aguarde: navegador em uso por ${busy.agent} em ${busy.conversation}.`)
      const operation = name === 'browser_open' || name === 'browser_observe' ? '' : name.replace('browser_', '')
      // Abrir: a aprovação vem antes de o acquire navegar.
      if (name === 'browser_open' && !await this.requestApproval(context, 'browser', { action: `Abrir ${approvalUrl(text(args.url, 2000))}` })) return 'Ação de navegador negada pelo usuário.'
      await check().acquireForAgent(owner, name === 'browser_open' ? text(args.url, 2000) : undefined)
      const token = await check().captureDocument(owner, operation, args)
      check().assertSharing(owner, token)
      if (name !== 'browser_observe' && name !== 'browser_open') {
        const action = `${operation}: ${redactApprovalUrls(JSON.stringify(args)).slice(0, 1000)}`
        if (!await this.requestApproval(context, 'browser', { action })) return 'Ação de navegador negada pelo usuário.'
      }
      const browser = check()
      browser.assertSharing(owner, token)
      const result = name === 'browser_open' || name === 'browser_observe' ? await browser.observeForAgent(owner, token)
        : await browser.actForAgent(owner, name.replace('browser_', ''), args, token)
      check().assertSharing(owner, token, name !== 'browser_open')
      return result
    }
    if (name === 'external_browser_status' || name === 'external_browser_request') {
      const owner = { workspaceId: context.run.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }
      let status = this.externalBrowserStatus(owner)
      if (name === 'external_browser_request') {
        this.externalBrowserFailures.delete(`${owner.conversationId}:${owner.agentId}`)
        if (status.granted) return 'Navegador real já autorizado para este agente nesta conversa.'
        if (!await this.requestApproval(context, 'browser', { action: `Permitir ${context.agent.name} usar seu navegador real (Brave/Chrome) nesta conversa`, task: 'O agente poderá ler e agir em qualquer site em que você está logado, incluindo cookies e dados salvos, até você revogar.', desktopOnly: true }, true, true)) return 'O usuário negou o navegador real nesta conversa.'
        status = this.setExternalBrowserGrant(owner, true)
      }
      const ready = !!this.externalBrowserProxies.get(`${owner.conversationId}:${owner.agentId}`)?.ready
      const bridge = status.problems.length ? `Ponte indisponível: ${status.problems.join('; ')}. Para corrigir, reinstale o plugin Browser pelo Codex/ChatGPT e a extensão no navegador; até lá, use o navegador interno (browser_*).`
        : ready ? `Ponte pronta: use a ferramenta js do servidor MCP ${EXTERNAL_BROWSER_MCP}.`
        : 'A ponte foi detectada, mas o proxy não está ativo nesta execução; ele entra na próxima execução do agente. Até lá, use o navegador interno (browser_*).'
      if (name === 'external_browser_request') return `Navegador real autorizado nesta conversa. ${bridge}`
      return [`granted: ${status.granted}`, `problems: ${status.problems.length ? status.problems.join('; ') : 'nenhum'}`,
        status.granted ? bridge : `${bridge} Sem autorização, peça com a ferramenta external_browser_request.`].join('\n')
    }
    if (name === 'delegation_result') {
      const id = text(args.delegation_id, 100)
      const delegation = this.store.delegation(id)
      if (!delegation) throw new Error('Delegação não encontrada.')
      const isRequester = delegation.requesterAgentId === context.agent.id && delegation.sourceConversationId === context.conversation.id
      const isRecipient = delegation.recipientAgentId === context.agent.id && delegation.targetConversationId === context.conversation.id
      const source = this.store.conversation(delegation.sourceConversationId)
      const target = this.store.conversation(delegation.targetConversationId)
      if ((!isRequester && !isRecipient) || source.workspaceId !== target.workspaceId || source.workspaceId !== context.run.workspaceId || context.conversation.workspaceId !== context.run.workspaceId) throw new Error('Você não tem acesso ao resultado desta delegação neste workspace.')
      return {
        delegationId: delegation.id, status: delegation.status, recipientAgentId: delegation.recipientAgentId,
        task: delegation.task, result: delegation.result, error: delegation.error,
        previousDelegationId: delegation.previousDelegationId,
        commandEvidence: this.store.commandEvidenceForRun(delegation.childRunId),
        fileChanges: this.store.fileChangesForRun(delegation.childRunId),
      }
    }
    if (name === 'ask_agent') {
      const requested = text(args.agent, 100).replace(/^@/, '').toLocaleLowerCase('pt-BR')
      const task = text(args.task, 5000)
      const mode = args.mode === undefined ? 'wait' : text(args.mode, 20)
      if (mode !== 'wait' && mode !== 'background') throw new Error('Modo de delegação inválido. Use wait ou background.')
      const continueOnResult = args.continue_on_result === true
      if (args.continue_on_result !== undefined && typeof args.continue_on_result !== 'boolean') throw new Error('continue_on_result precisa ser verdadeiro ou falso.')
      if (continueOnResult && mode !== 'background') throw new Error('continue_on_result só pode ser usado com mode=background.')
      const workspace = this.store.workspace(context.run.workspaceId)
      const eligibleAgentIds = new Set([...context.conversation.agentIds, ...workspace.defaultAgentIds])
      const eligibilityContext = { agentId: context.agent.id, role: context.agent.role, workspaceId: workspace.id, eligibleAgentIds, ancestry: context.run.ancestry || [context.agent.id] }
      let candidate = this.store.agents().find(agent => agent.alias.toLocaleLowerCase('pt-BR') === requested || agent.name.toLocaleLowerCase('pt-BR') === requested)
      if (!candidate) throw new Error('Esse agente não existe no catálogo.')
      const previousId = args.delegation_id === undefined ? undefined : text(args.delegation_id, 100)
      let previousDelegation = previousId ? this.store.delegation(previousId) : undefined
      if (previousId && !previousDelegation) throw new Error('A delegação indicada não existe ou não está disponível.')
      if (previousDelegation) this.validateDelegationContinuation(context, candidate, previousDelegation)
      let eligibility = delegationEligibility(eligibilityContext, candidate)
      if (!eligibility.canDelegate) throw new Error(eligibility.reason || 'Esse agente não pode receber esta delegação.')
      if (context.agent.role === 'chief' && !await this.requestApproval(context, 'delegation', { action: previousDelegation ? `Continuar a delegação ${previousDelegation.id} com ${candidate.name}` : `Enviar uma tarefa para ${candidate.name}`, recipientName: candidate.name, task })) return `Delegação para ${candidate.name} negada pelo usuário.`
      if (context.agent.role === 'chief') {
        const latestConversation = this.store.conversation(context.conversation.id)
        if (latestConversation.archived || latestConversation.workspaceId !== context.run.workspaceId) throw new Error('A conversa ou o workspace mudou durante a aprovação; a delegação foi cancelada.')
        const latestRequester = this.store.agent(context.agent.id)
        if (latestRequester.role !== context.agent.role || latestRequester.temporaryStatus === 'retired') throw new Error('A elegibilidade do solicitante mudou durante a aprovação; a delegação foi cancelada.')
        candidate = this.store.agent(candidate.id)
        const latestWorkspace = this.store.workspace(latestConversation.workspaceId)
        if (latestWorkspace.archived) throw new Error('O workspace foi arquivado durante a aprovação; a delegação foi cancelada.')
        eligibility = delegationEligibility({ agentId: latestRequester.id, role: latestRequester.role, workspaceId: latestWorkspace.id, eligibleAgentIds: new Set([...latestConversation.agentIds, ...latestWorkspace.defaultAgentIds]), ancestry: context.run.ancestry || [latestRequester.id] }, candidate)
        if (!eligibility.canDelegate) throw new Error(eligibility.reason || 'A elegibilidade do destinatário mudou durante a aprovação.')
        if (previousDelegation) {
          previousDelegation = this.store.delegation(previousDelegation.id)
          if (!previousDelegation) throw new Error('A delegação anterior foi removida durante a aprovação.')
          this.validateDelegationContinuation(context, candidate, previousDelegation)
        }
      }
      const idempotencyKey = `${context.run.id}:${callId || `${candidate.id}:${task}`}`
      const existing = this.store.delegationByKey(idempotencyKey)
      if (existing) {
        if (existing.status === 'completed') {
          if (continueOnResult && !existing.continuationRunId) await this.continueAfterDelegation(context, existing, existing.result)
          return this.delegationReceipt(existing.id, existing.result)
        }
        if (existing.status === 'failed' || existing.status === 'interrupted') throw new Error(existing.error || `O pedido anterior terminou como ${existing.status}.`)
        const pending = this.delegationTasks.get(idempotencyKey)
        if (pending) return mode === 'background' ? `Pedido ${existing.id} para ${candidate.name} continua em andamento. O resultado aparecerá nesta conversa.` : this.delegationReceipt(existing.id, await pending)
        throw new Error('Este pedido está persistido como em andamento, mas não há execução ativa. Não será repetido automaticamente.')
      }
      if (candidate.temporary) this.store.saveAgent({ ...candidate, temporaryStatus: 'working' })
      const pending = this.delegate(context, candidate, task, idempotencyKey, mode === 'wait', previousDelegation).finally(() => {
        if (candidate.temporary) {
          const latest = this.store.agent(candidate.id)
          if (latest.temporaryStatus === 'working') {
            this.store.saveAgent({ ...latest, temporaryStatus: 'retired' })
            this.emitEvent({ type: 'changed' })
          }
        }
      })
      this.delegationTasks.set(idempotencyKey, pending)
      if (mode === 'background') {
        void pending.then(async result => {
          if (continueOnResult) {
            const delegation = this.store.delegationByKey(idempotencyKey)
            if (delegation && !delegation.continuationRunId) await this.continueAfterDelegation(context, delegation, result)
          }
        }).catch(() => undefined).finally(() => this.delegationTasks.delete(idempotencyKey))
        const delegation = this.store.delegationByKey(idempotencyKey)
        return `Pedido ${delegation?.id || ''} enviado para ${candidate.name}. Vou continuar e publicarei o resultado nesta conversa quando terminar.`.trim()
      }
      try { return this.delegationReceipt(this.store.delegationByKey(idempotencyKey)?.id || '', await pending) } finally { this.delegationTasks.delete(idempotencyKey) }
    }
    throw new Error(`Ferramenta desconhecida: ${name}`)
  }
  private delegationReceipt(id: string, result: string): string { return id ? `${result}\n\nID da delegação: ${id}` : result }
  private delegatedRequestIds(run: Run): string[] {
    const delegations = this.store.delegations()
    let current = delegations.find(item => item.childRunId === run.id)
    const ids: string[] = [], seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id); ids.push(current.requestMessageId)
      current = current.previousDelegationId ? this.store.delegation(current.previousDelegationId) : undefined
    }
    return ids
  }
  private validateDelegationContinuation(context: RunContext, recipient: Agent, previous: Delegation): void {
    if (previous.status !== 'completed' || previous.requesterAgentId !== context.agent.id || previous.sourceConversationId !== context.conversation.id || previous.recipientAgentId !== recipient.id) throw new Error('Esta delegação não pode ser continuada por esta conversa, agente ou destinatário.')
    const source = this.store.conversation(previous.sourceConversationId)
    const target = this.store.conversation(previous.targetConversationId)
    const workspace = this.store.workspace(context.run.workspaceId)
    if (source.archived || target.archived || workspace.archived || source.workspaceId !== context.run.workspaceId || target.workspaceId !== context.run.workspaceId || source.workspaceId !== target.workspaceId || target.kind !== 'direct' || target.agentIds.length !== 1 || target.agentIds[0] !== recipient.id) throw new Error('O workspace ou a conversa privada mudou; não é possível elevar o escopo da delegação.')
  }
  private async delegate(parent: RunContext, recipient: Agent, task: string, idempotencyKey: string, inheritLease = false, previousDelegation?: Delegation): Promise<string> {
    const now = new Date().toISOString()
    this.store.db.exec('BEGIN IMMEDIATE')
    let targetConversation: Conversation
    let request: Message, resultMessage: Message, originMessage: Message, child: Run, delegation: Delegation
    try {
    targetConversation = previousDelegation
      ? this.store.conversation(previousDelegation.targetConversationId)
      : this.store.saveConversation({ kind: 'direct', name: delegatedConversationName(recipient.name, task), agentIds: [recipient.id], workspaceId: parent.run.workspaceId })
    if (previousDelegation && (targetConversation.archived || targetConversation.workspaceId !== parent.run.workspaceId || targetConversation.agentIds.length !== 1 || targetConversation.agentIds[0] !== recipient.id)) throw new Error('A conversa privada da delegação mudou; a continuação foi cancelada.')
    request = { id: randomUUID(), conversationId: targetConversation.id, agentId: parent.agent.id, author: `Pedido de ${parent.agent.name}`, role: 'activity', text: task, status: 'queued', runId: null, createdAt: now }
    resultMessage = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, author: recipient.name, role: 'assistant', text: '', status: 'queued', runId: null, createdAt: now }
    originMessage = { id: randomUUID(), conversationId: parent.conversation.id, agentId: recipient.id, author: recipient.name, role: 'activity', text: `Pedido para ${recipient.name}: ${task}\nAguardando execução na conversa privada do agente.`, status: 'queued', runId: null, relatedConversationId: targetConversation.id, delegationTask: task, createdAt: now }
    const targetWorkspace = this.store.workspace(targetConversation.workspaceId)
    child = { id: randomUUID(), conversationId: targetConversation.id, agentId: recipient.id, rootId: parent.run.rootId, parentId: parent.run.id, ancestry: [...parent.run.ancestry, recipient.id], status: 'queued', threadId: null, turnId: null, messageId: resultMessage.id, input: task, inputMessageId: request.id, agent: recipient, workspaceId: targetWorkspace.id, workspacePath: targetWorkspace.path, createdAt: now }
    resultMessage.runId = child.id
    delegation = { id: randomUUID(), idempotencyKey, rootRunId: parent.run.rootId, parentRunId: parent.run.id, childRunId: child.id, requesterAgentId: parent.agent.id, recipientAgentId: recipient.id, sourceConversationId: parent.conversation.id, targetConversationId: targetConversation.id, sourceMessageId: originMessage.id, requestMessageId: request.id, resultMessageId: resultMessage.id, task, status: 'queued', result: '', error: '', createdAt: now, updatedAt: now, ...(previousDelegation ? { previousDelegationId: previousDelegation.id } : {}) }
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
    const context: RunContext = { run: child, message: resultMessage, conversation: targetConversation, agent: recipient }
    try { await this.queue.enqueueDelegation(child.workspacePath, signal, async lease => {
      context.lease = lease
      if (signal.aborted) return
      delegation.status = 'running'; delegation.updatedAt = new Date().toISOString(); this.store.putDelegation(delegation)
      child.status = 'running'; this.store.putRun(child)
      this.store.putMessage(runningOrigin); this.emitEvent({ type: 'message', message: runningOrigin })
      this.store.putMessage(runningRequest); this.emitEvent({ type: 'message', message: runningRequest })
      await this.execute(context, signal)
    }, inheritLease ? parent.lease : undefined) }
    finally { parentController?.signal.removeEventListener('abort', abortFromParent); this.active.delete(child.id) }
    if (signal.aborted && child.status === 'queued') {
      child.status = 'interrupted'; this.store.putRun(child)
      this.updateMessage(resultMessage, 'interrupted', 'Pedido cancelado antes do início.')
    }
    const completed = this.store.runs().find(run => run.id === child.id)!
    const result = this.store.message(completed.messageId)?.text || ''
    if (!this.store.delegation(delegation.id) || !this.store.conversations().some(item => item.id === parent.conversation.id)) throw new Error('A conversa de origem foi excluída; o resultado não foi republicado nela.')
    delegation.status = completed.status; delegation.result = completed.status === 'completed' ? result : ''; delegation.error = completed.status === 'completed' ? '' : result || `O pedido terminou como ${completed.status}.`; delegation.updatedAt = new Date().toISOString(); this.store.putDelegation(delegation)
    const finalOrigin = { ...runningOrigin, status: completed.status, text: completed.status === 'completed' ? `Pedido concluído por ${recipient.name}. Resultado disponível na conversa relacionada.\n\n${result}` : `Pedido para ${recipient.name}: ${task}\n${completed.status === 'interrupted' ? 'Cancelado.' : `Falhou: ${delegation.error}`}` }
    const finalRequest = { ...runningRequest, status: completed.status }
    this.store.putMessage(finalOrigin); this.emitEvent({ type: 'message', message: finalOrigin }); this.store.putMessage(finalRequest); this.emitEvent({ type: 'message', message: finalRequest })
    this.missions.onDelegationFinished(parent.conversation.id)
    if (completed.status !== 'completed') throw new Error(delegation.error || `${recipient.name} não concluiu o pedido.`)
    return result
  }
  private async continueAfterDelegation(parent: RunContext, delegation: Delegation, result: string): Promise<void> {
    const latest = this.store.delegation(delegation.id)
    if (!latest || latest.continuationRunId) return
    delegation = latest
    const conversation = this.store.conversation(delegation.sourceConversationId)
    if (conversation.agentIds.length && !conversation.agentIds.includes(delegation.requesterAgentId)) return
    const workspace = this.store.workspace(conversation.workspaceId)
    const recipient = this.store.agent(delegation.recipientAgentId)
    const requester = this.store.agent(delegation.requesterAgentId)
    const now = new Date().toISOString()
    const input = `O pedido delegado a ${recipient.name} foi concluído. Resultado:\n\n${result.slice(0, 12000)}\n\nContinue a solicitação original do usuário usando esse resultado. Esta continuação pertence somente a você nesta conversa.`
    const message: Message = { id: randomUUID(), conversationId: conversation.id, agentId: requester.id, author: requester.name, role: 'assistant', text: '', status: 'queued', runId: null, delegationId: delegation.id, relatedConversationId: delegation.targetConversationId, createdAt: now }
    const run: Run = { id: randomUUID(), conversationId: conversation.id, agentId: requester.id, rootId: parent.run.rootId, parentId: parent.run.id, ancestry: parent.run.ancestry, status: 'queued', threadId: null, turnId: null, messageId: message.id, input, inputMessageId: message.id, agent: requester, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: now }
    message.runId = run.id
    const updated = { ...delegation, continuationRunId: run.id, updatedAt: now }
    this.store.db.exec('BEGIN IMMEDIATE')
    try { this.store.putDelegation(updated); this.store.putRun(run); this.store.putMessage(message); this.store.db.exec('COMMIT') }
    catch (error) { this.store.db.exec('ROLLBACK'); throw error }
    this.emitEvent({ type: 'message', message }); this.emitEvent({ type: 'changed' })
    const controller = new AbortController(); this.active.set(run.id, controller)
    await this.queue.enqueue(workspace.path, controller.signal, lease => this.execute({ run, message, conversation, agent: requester, lease }, controller.signal))
  }
  agentTerminalSessions(conversationId: string, workspaceId: string) { return this.agentTerminals.list(this.terminalScope(conversationId, workspaceId)) }
  agentTerminalStop(sessionId: string, conversationId: string, workspaceId: string) { return this.agentTerminals.stop(text(sessionId, 100), this.terminalScope(conversationId, workspaceId)) }
  private terminalScope(conversationId: string, workspaceId: string) {
    const conversation = this.store.conversation(text(conversationId, 100))
    if (conversation.workspaceId !== workspaceId) throw new Error('A conversa não pertence a este workspace.')
    return { workspaceId, conversationId: conversation.id }
  }
  /** Ação separada e explícita do usuário. Não é chamada por ferramentas de agente nem pela RPC remota. */
  openExternalTerminal(workspaceId: string) {
    const cwd = this.workspacePath(workspaceId)
    if (!cwd) throw new Error('Este projeto não tem pasta.')
    const [command, args] = process.platform === 'win32' ? ['powershell.exe', ['-NoExit']] : process.platform === 'darwin' ? ['open', ['-a', 'Terminal', cwd]] : ['x-terminal-emulator', []]
    const child = spawn(command as string, args as string[], { cwd, detached: true, stdio: 'ignore', shell: false })
    child.once('error', () => undefined)
    child.unref()
  }
  dispose() {
    if (this.statusSignal.signal.aborted) return
    this.agentTerminals.terminateAll()
    clearInterval(this.statusTimer)
    this.missions.dispose()
    this.statusSignal.abort()
    for (const context of this.contexts.values()) if (context.flushTimer) clearTimeout(context.flushTimer)
    for (const key of [...this.externalBrowserProxies.keys()]) this.closeExternalBrowserProxy(key)
    this.platformBrowser?.revokeSharing(); this.runtime.close(); this.claudeRuntime.close(); this.piRuntime.close(); this.openCodeRuntime.close(); this.antigravityRuntime.close(); this.store.close()
  }
}
