import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { ASSISTANT_ID, type Agent, type Approval, type Conversation, type Delegation, type FileChange, type Message, type Project, type Run, type Snapshot, type Workspace } from '../../shared/v9'

export const SCHEMA_VERSION = 4
export const ASSISTANT: Agent = {
  id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: 'Assistente padrão do aplicativo, sem cadastro.',
  instructions: 'Você é o Assistente padrão do Politron. Responda de forma direta e útil. Você não tem acesso a arquivos nem ao navegador, a menos que as ferramentas correspondentes sejam disponibilizadas nesta conversa.',
  runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-01-01T00:00:00.000Z'
}

function normalizeConversation(value: Conversation): Conversation {
  return { ...value, projectId: value.projectId ?? null, titleAuto: value.titleAuto ?? false }
}
export type AssistantPreferences = Pick<Agent, 'canWrite' | 'computerUse' | 'approvalMode'>
const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = { canWrite: false, computerUse: false, approvalMode: 'ask' }
function normalizeAgent(value: Agent): Agent { return { ...value, approvalMode: value.approvalMode === 'automatic' ? 'automatic' : 'ask' } }

export function requiredText(value: unknown, label: string, limit = 10000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${label}: informe um texto válido de até ${limit} caracteres.`)
  return value.trim()
}
export function canonicalDirectory(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !isAbsolute(value) || !existsSync(value) || !statSync(value).isDirectory()) throw new Error('Selecione uma pasta existente.')
  return realpathSync.native(value)
}

export class WorkspaceStore {
  readonly db: DatabaseSync
  readonly dataDirectory: string
  constructor(directory: string) {
    this.dataDirectory = directory
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    const previousSchema = this.schemaVersion()
    if (previousSchema !== null && previousSchema > SCHEMA_VERSION) {
      this.db.close()
      throw new Error(`O banco V9 usa o esquema ${previousSchema}, mais novo que o suportado (${SCHEMA_VERSION}).`)
    }
    if (previousSchema !== null && previousSchema < SCHEMA_VERSION) {
      const backup = join(directory, `politron-v9.backup-schema${previousSchema}-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
      this.db.prepare('VACUUM INTO ?').run(backup)
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_workspaces (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES v9_conversations(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_message_context ON v9_messages(conversation_id);
      CREATE TABLE IF NOT EXISTS v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_file_changes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(run_id, tool_call_id));
      CREATE TABLE IF NOT EXISTS v9_approvals (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_delegation_source ON v9_delegations(source_conversation_id);
      CREATE INDEX IF NOT EXISTS v9_delegation_target ON v9_delegations(target_conversation_id);
      INSERT OR IGNORE INTO v9_meta VALUES ('schema','${previousSchema ?? SCHEMA_VERSION}');`)
    if (previousSchema !== null && previousSchema < SCHEMA_VERSION) this.migrateWorkspaces()
    else this.db.prepare("UPDATE v9_meta SET value=? WHERE key='schema'").run(String(SCHEMA_VERSION))
    for (const run of this.runs()) {
      if (['queued', 'running', 'waiting'].includes(run.status)) {
        this.putRun({ ...run, status: 'interrupted' })
        const message = this.message(run.messageId)
        if (message) this.putMessage({ ...message, status: 'interrupted', text: message.text || 'Execução interrompida ao fechar o aplicativo.' })
      }
    }
    for (const delegation of this.delegations()) {
      if (['queued', 'running', 'waiting'].includes(delegation.status)) {
        const updated = { ...delegation, status: 'interrupted' as const, error: 'Execução interrompida ao fechar o aplicativo; o pedido não foi repetido automaticamente.', updatedAt: new Date().toISOString() }
        this.putDelegation(updated)
        for (const id of [delegation.sourceMessageId, delegation.requestMessageId]) {
          const message = this.message(id)
          if (message) this.putMessage({ ...message, status: 'interrupted', text: id === delegation.sourceMessageId ? `Pedido para o agente destinatário interrompido ao fechar o aplicativo. O pedido não foi repetido automaticamente.` : message.text })
        }
        const result = this.message(delegation.resultMessageId)
        if (result) this.putMessage({ ...result, status: 'interrupted', text: result.text || 'Execução interrompida ao fechar o aplicativo.' })
      }
    }
    for (const approval of this.approvals().filter(item => item.status === 'pending')) this.putApproval({ ...approval, status: 'interrupted', resolvedAt: new Date().toISOString() })
  }
  private schemaVersion(): number | null {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='v9_meta'").get()) return null
    const row = this.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string } | undefined
    if (!row) return 0
    const version = Number(row.value)
    if (!Number.isInteger(version) || version < 1) {
      this.db.close()
      throw new Error('O banco V9 contém uma versão de esquema inválida.')
    }
    return version
  }
  private migrateWorkspaces(): void {
    const legacyProjects = this.all<Record<string, any>>('v9_projects')
    const legacyConversations = this.all<Record<string, any>>('v9_conversations')
    const legacyRuns = this.all<Record<string, any>>('v9_runs')
    const workspaceRecords = new Map<string, Workspace>()
    const pathKey = (projectId: string | null, path: string) => `${projectId || ''}\0${path.toLocaleLowerCase()}`
    const legacyPath = (value: unknown): string | null => {
      if (typeof value !== 'string' || !value.trim()) return null
      const candidate = isAbsolute(value) ? value : resolve(this.dataDirectory, value)
      try { return canonicalDirectory(candidate) || resolve(candidate) } catch { return resolve(candidate) }
    }
    const makeWorkspace = (projectId: string | null, path: string, branch: string | null = null): Workspace => {
      const key = pathKey(projectId, path)
      const existing = [...workspaceRecords.values()].find(item => pathKey(item.projectId, item.path) === key)
      if (existing) return existing
      const workspace: Workspace = { id: randomUUID(), projectId, kind: 'local', path, branch, baseBranch: null, changes: 0, archived: false, createdAt: new Date().toISOString() }
      workspaceRecords.set(workspace.id, workspace)
      return workspace
    }
    const projectWorkspaces = new Map<string, Workspace>()
    for (const project of legacyProjects) {
      const path = legacyPath(project.directory)
      const workspace = path ? makeWorkspace(project.id, path) : undefined
      if (workspace) projectWorkspaces.set(project.id, workspace)
      delete project.directory
      project.defaultWorkspaceId = workspace?.id || null
    }
    for (const conversation of legacyConversations) {
      const projectId = conversation.projectId || null
      const path = legacyPath(conversation.directory)
      const projectWorkspace = projectId ? projectWorkspaces.get(projectId) : undefined
      let workspace = path
        ? projectWorkspace?.path === path ? projectWorkspace : makeWorkspace(projectId, path)
        : projectWorkspace
      if (!workspace && !path && !projectId) {
        const privatePath = join(this.dataDirectory, 'workspaces', conversation.id)
        mkdirSync(privatePath, { recursive: true })
        workspace = makeWorkspace(null, realpathSync.native(privatePath))
      }
      if (!workspace && !path) {
        const privatePath = join(this.dataDirectory, 'workspaces', conversation.id)
        mkdirSync(privatePath, { recursive: true })
        workspace = makeWorkspace(projectId, realpathSync.native(privatePath))
      }
      if (!workspace) throw new Error(`Não foi possível migrar o workspace da conversa ${conversation.id}.`)
      delete conversation.directory
      conversation.workspaceId = workspace.id
      conversation.projectId = projectId
      conversation.titleAuto ??= false
    }
    const legacyAgents = this.all<Record<string, any>>('v9_agents')
    for (const agent of legacyAgents) agent.approvalMode ??= 'ask'
    const conversationWorkspaces = new Map(legacyConversations.map(conversation => [conversation.id, conversation.workspaceId as string]))
    for (const run of legacyRuns) {
      const workspaceId = conversationWorkspaces.get(run.conversationId)
      const workspace = workspaceRecords.get(workspaceId || '')
      if (!workspace) continue
      delete run.directory
      run.workspaceId = workspace.id
      run.workspacePath = workspace.path
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const workspace of workspaceRecords.values()) this.put('v9_workspaces', workspace)
      for (const agent of legacyAgents) this.put('v9_agents', agent as { id: string })
      for (const project of legacyProjects) this.put('v9_projects', project as { id: string })
      for (const conversation of legacyConversations) this.put('v9_conversations', conversation as { id: string })
      for (const run of legacyRuns) this.put('v9_runs', run as { id: string })
      this.db.prepare("UPDATE v9_meta SET value=? WHERE key='schema'").run(String(SCHEMA_VERSION))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private all<T>(table: string): T[] { return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(row => JSON.parse(row.data) as T) }
  private get<T>(table: string, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as T : undefined }
  private put(table: string, value: { id: string }): void { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value)) }
  agents(): Agent[] { return this.all<Agent>('v9_agents').map(normalizeAgent) }
  projects(): Project[] { return this.all('v9_projects') }
  workspaces(): Workspace[] { return this.all('v9_workspaces') }
  workspace(id: string): Workspace { const value = this.get<Workspace>('v9_workspaces', id); if (!value) throw new Error('Workspace não encontrado.'); return value }
  project(id: string): Project { const value = this.get<Project>('v9_projects', id); if (!value) throw new Error('Projeto não encontrado.'); return value }
  conversations(): Conversation[] { return this.all<Conversation>('v9_conversations').map(normalizeConversation) }
  runs(): Run[] { return this.all('v9_runs') }
  delegations(): Delegation[] { return (this.db.prepare('SELECT data FROM v9_delegations ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  delegation(id: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  delegationByKey(key: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE idempotency_key=?').get(key) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  assistantPreferences(): AssistantPreferences {
    const read = (key: keyof AssistantPreferences) => this.db.prepare('SELECT value FROM v9_meta WHERE key=?').get(`assistant_${key}`) as { value: string } | undefined
    return {
      canWrite: read('canWrite')?.value === undefined ? DEFAULT_ASSISTANT_PREFERENCES.canWrite : read('canWrite')?.value === 'true',
      computerUse: read('computerUse')?.value === undefined ? DEFAULT_ASSISTANT_PREFERENCES.computerUse : read('computerUse')?.value === 'true',
      approvalMode: read('approvalMode')?.value === 'automatic' ? 'automatic' : 'ask'
    }
  }
  saveAssistantPreferences(input: Partial<AssistantPreferences>): Agent {
    const previous = this.assistantPreferences()
    const value: AssistantPreferences = {
      canWrite: input.canWrite ?? previous.canWrite,
      computerUse: input.computerUse ?? previous.computerUse,
      approvalMode: input.approvalMode ?? previous.approvalMode
    }
    if (typeof value.canWrite !== 'boolean' || typeof value.computerUse !== 'boolean' || !['ask', 'automatic'].includes(value.approvalMode)) throw new Error('Preferências do Assistente inválidas.')
    for (const [key, setting] of Object.entries(value)) this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`assistant_${key}`, String(setting))
    return { ...ASSISTANT, ...value }
  }
  agent(id: string): Agent { if (id === ASSISTANT_ID) return { ...ASSISTANT, ...this.assistantPreferences() }; const value = this.get<Agent>('v9_agents', id); if (!value) throw new Error('Agente não encontrado.'); return normalizeAgent(value) }
  conversation(id: string): Conversation { const value = this.get<Conversation>('v9_conversations', id); if (!value) throw new Error('Conversa não encontrada.'); return normalizeConversation(value) }
  message(id: string): Message | undefined { return this.get('v9_messages', id) }
  history(id: string): Message[] {
    return (this.db.prepare('SELECT data FROM (SELECT rowid,data FROM v9_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 500) ORDER BY rowid').all(id) as { data: string }[]).map(row => JSON.parse(row.data))
  }
  snapshot(): Snapshot { return { assistant: this.agent(ASSISTANT_ID), agents: this.agents(), projects: this.projects(), workspaces: this.workspaces(), conversations: this.conversations(), messages: [], runs: this.runs().slice(-100), fileChanges: this.fileChanges().slice(-500), approvals: this.approvals() } }
  saveAgent(input: Partial<Agent>): Agent {
    const previous = input.id ? this.agent(input.id) : undefined
    const name = requiredText(input.name, 'Nome', 80)
    const alias = requiredText(input.alias || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), 'Menção', 80)
    if (!/^[\p{L}\p{N}_-]+$/u.test(alias)) throw new Error('Use letras, números, hífen ou sublinhado na menção.')
    if (alias.toLowerCase() === ASSISTANT.alias || this.agents().some(agent => agent.id !== input.id && agent.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Essa menção já pertence a outro agente.')
    const runtime = input.runtime ?? previous?.runtime ?? 'codex'
    if (runtime !== 'codex' && runtime !== 'claude') throw new Error('Motor de agente inválido.')
    const approvalMode = input.approvalMode ?? previous?.approvalMode ?? 'ask'
    if (approvalMode !== 'ask' && approvalMode !== 'automatic') throw new Error('Modo de aprovação inválido.')
    const effort = input.effort ?? previous?.effort ?? 'medium'
    if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw new Error('Esforço do agente inválido.')
    const value: Agent = { id: previous?.id || randomUUID(), name, alias, description: String(input.description || '').slice(0, 500), instructions: requiredText(input.instructions, 'Instruções', 20000), runtime, model: String(input.model || '').slice(0, 150), effort, color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color! : '#6366f1', avatar: typeof input.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(input.avatar) && input.avatar.length < 2_000_000 ? input.avatar : '', canWrite: input.canWrite === true, computerUse: input.computerUse === true, approvalMode, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_agents', value); return value
  }
  saveProject(input: Partial<Project> & { workspacePath?: string | null }): Project {
    const previous = input.id ? this.project(input.id) : undefined
    const name = requiredText(input.name ?? previous?.name, 'Nome do projeto', 100)
    const defaultAgentIds = [...new Set(input.defaultAgentIds ?? previous?.defaultAgentIds ?? [])]
    if (defaultAgentIds.length > 10) throw new Error('A equipe padrão aceita até dez agentes.')
    this.userAgents(defaultAgentIds)
    const instructions = input.instructions === undefined ? previous?.instructions || '' : String(input.instructions)
    if (instructions.length > 20000) throw new Error('Instruções do projeto: use até 20000 caracteres.')
    const id = previous?.id || randomUUID()
    let defaultWorkspaceId = input.defaultWorkspaceId ?? previous?.defaultWorkspaceId ?? null
    if (input.workspacePath !== undefined) {
      const path = canonicalDirectory(input.workspacePath)
      if (path) {
        const existingWorkspace = this.workspaces().find(item => item.projectId === id && item.kind === 'local' && item.path === path && !item.archived)
        const workspace = existingWorkspace || this.saveWorkspace({ projectId: id, kind: 'local', path, branch: null, baseBranch: null, changes: 0, archived: false })
        defaultWorkspaceId = workspace.id
      } else defaultWorkspaceId = null
    }
    const value: Project = { id, name, defaultWorkspaceId, instructions: instructions.trim(), defaultAgentIds, revision: (previous?.revision || 0) + 1, archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_projects', value); return value
  }
  private userAgents(ids: string[]): void {
    for (const id of ids) { if (id === ASSISTANT_ID) throw new Error('O Assistente padrão não é cadastrado como participante.'); this.agent(id) }
  }
  saveWorkspace(input: Omit<Workspace, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Workspace {
    const path = canonicalDirectory(input.path)
    if (!path) throw new Error('Selecione uma pasta existente para o workspace.')
    const value: Workspace = { id: input.id || randomUUID(), projectId: input.projectId ?? null, kind: input.kind, path, branch: input.branch ?? null, baseBranch: input.baseBranch ?? null, changes: Math.max(0, input.changes || 0), archived: input.archived ?? false, createdAt: input.createdAt || new Date().toISOString() }
    this.put('v9_workspaces', value)
    return value
  }
  updateWorkspace(value: Workspace): Workspace { this.workspace(value.id); this.put('v9_workspaces', value); return value }
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }): Conversation {
    const previous = input.id ? this.conversation(input.id) : undefined
    if (previous && input.projectId !== undefined && input.projectId !== previous.projectId) throw new Error('Uma conversa não muda de projeto depois de criada.')
    const projectId = previous ? previous.projectId : input.projectId ?? null
    const project = projectId ? this.project(projectId) : undefined
    if (project?.archived && !previous) throw new Error('Este projeto está arquivado.')
    const agentIds = [...new Set(input.agentIds ?? previous?.agentIds ?? project?.defaultAgentIds ?? [])]
    if (agentIds.length > 10) throw new Error('Selecione até dez agentes.')
    this.userAgents(agentIds)
    const kind = input.kind ?? (agentIds.length > 1 ? 'group' : previous?.kind ?? 'direct')
    if (kind !== 'direct' && kind !== 'group') throw new Error('Tipo de conversa inválido.')
    if (kind === 'direct' && agentIds.length > 1) throw new Error('Conversas individuais têm no máximo um agente.')
    if (kind === 'group' && !agentIds.length) throw new Error('Selecione de um a dez agentes para um grupo.')
    const named = typeof input.name === 'string' && input.name.trim() !== ''
    const name = named ? requiredText(input.name, 'Nome', 100) : previous?.name || 'Nova conversa'
    let workspace = input.workspaceId ? this.workspace(input.workspaceId) : previous ? this.workspace(previous.workspaceId) : project?.defaultWorkspaceId ? this.workspace(project.defaultWorkspaceId) : undefined
    if (input.workspacePath !== undefined) {
      const path = canonicalDirectory(input.workspacePath)
      if (path) workspace = this.workspaces().find(item => item.projectId === projectId && item.kind === 'local' && item.path === path && !item.archived) || this.saveWorkspace({ projectId, kind: 'local', path, branch: null, baseBranch: null, changes: 0, archived: false })
      else workspace = undefined
    }
    if (!workspace) {
      const privatePath = join(this.dataDirectory, 'workspaces', previous?.id || input.id || randomUUID())
      mkdirSync(privatePath, { recursive: true })
      const path = realpathSync.native(privatePath)
      workspace = this.workspaces().find(item => item.projectId === projectId && item.path === path && !item.archived) || this.saveWorkspace({ projectId, kind: 'local', path, branch: null, baseBranch: null, changes: 0, archived: false })
    }
    if (workspace.archived) throw new Error('Este workspace está arquivado.')
    if (projectId && workspace.projectId && workspace.projectId !== projectId) throw new Error('O workspace pertence a outro projeto.')
    const value: Conversation = { id: previous?.id || randomUUID(), kind, name, agentIds, projectId, workspaceId: workspace.id, titleAuto: named ? false : previous?.titleAuto ?? true, revision: previous ? previous.revision + (workspace.id !== previous.workspaceId ? 1 : 0) : 1, archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_conversations', value); return value
  }
  autoTitle(conversationId: string, firstMessage: string): Conversation {
    const conversation = this.conversation(conversationId)
    if (!conversation.titleAuto) return conversation
    const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60)
    const value = { ...conversation, name: title || conversation.name, titleAuto: false }
    this.put('v9_conversations', value); return value
  }
  putMessage(value: Message): void { this.db.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, value.conversationId, JSON.stringify(value)) }
  putRun(value: Run): void { this.put('v9_runs', value) }
  putFileChange(value: FileChange): boolean {
    const result = this.db.prepare('INSERT OR IGNORE INTO v9_file_changes(id,run_id,tool_call_id,workspace_id,data) VALUES(?,?,?,?,?)').run(value.id, value.runId, value.toolCallId, value.workspaceId, JSON.stringify(value))
    return result.changes > 0
  }
  fileChanges(): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  fileChangesForRun(runId: string): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes WHERE run_id=? ORDER BY rowid').all(runId) as { data: string }[]).map(row => JSON.parse(row.data)) }
  fileChangesForWorkspace(workspaceId: string): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes WHERE workspace_id=? ORDER BY rowid DESC LIMIT 200').all(workspaceId) as { data: string }[]).map(row => JSON.parse(row.data)).reverse() }
  approvals(): Approval[] { return (this.db.prepare('SELECT data FROM v9_approvals ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  approval(id: string): Approval | undefined { const row = this.db.prepare('SELECT data FROM v9_approvals WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Approval : undefined }
  pendingApprovalForRun(runId: string): Approval | undefined { const row = this.db.prepare("SELECT data FROM v9_approvals WHERE run_id=? ORDER BY rowid DESC").all(runId) as { data: string }[]; return row.map(item => JSON.parse(item.data) as Approval).find(item => item.status === 'pending') }
  putApproval(value: Approval): void { this.db.prepare('INSERT INTO v9_approvals(id,run_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, value.runId, JSON.stringify(value)) }
  putDelegation(value: Delegation): void { this.db.prepare('INSERT INTO v9_delegations(id,idempotency_key,source_conversation_id,target_conversation_id,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, source_conversation_id=excluded.source_conversation_id, target_conversation_id=excluded.target_conversation_id').run(value.id, value.idempotencyKey, value.sourceConversationId, value.targetConversationId, JSON.stringify(value)) }
  binding(key: string): string | undefined { return (this.db.prepare('SELECT thread_id FROM v9_sessions WHERE key=?').get(key) as { thread_id: string } | undefined)?.thread_id }
  bind(key: string, threadId: string): void { this.db.prepare('INSERT OR REPLACE INTO v9_sessions VALUES(?,?)').run(key, threadId) }
  close(): void { this.db.close() }
}
