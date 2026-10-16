import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { ASSISTANT_ID, type Agent, type Approval, type Conversation, type Delegation, type FileChange, type Message, type Run, type Snapshot, type Workspace } from '../../shared/v9'

export const SCHEMA_VERSION = 5
export const ASSISTANT: Agent = {
  id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: 'Assistente padrão do aplicativo, sem cadastro.',
  instructions: 'Você é o Assistente padrão do Politron. Responda de forma direta e útil. Você não tem acesso a arquivos nem ao navegador, a menos que as ferramentas correspondentes sejam disponibilizadas nesta conversa.',
  runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-01-01T00:00:00.000Z'
}

function normalizeConversation(value: Conversation): Conversation {
  return { ...value, titleAuto: value.titleAuto ?? false }
}
export type AssistantPreferences = Pick<Agent, 'canWrite' | 'computerUse' | 'approvalMode'>
const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = { canWrite: false, computerUse: false, approvalMode: 'ask' }
function normalizeAgent(value: Agent): Agent { return { ...value, pitsShape: ['round', 'flat', 'long'].includes(value.pitsShape || '') ? value.pitsShape : 'round', approvalMode: value.approvalMode === 'automatic' ? 'automatic' : 'ask' } }

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
    if (previousSchema !== null && previousSchema < SCHEMA_VERSION) this.migrateWorkspaces(previousSchema)
    else this.db.prepare("UPDATE v9_meta SET value=? WHERE key='schema'").run(String(SCHEMA_VERSION))
    // Agrupar sessões livres antigas sem mover seus diretórios originais.
    const existingWorkspaces = this.workspaces()
    if (this.conversations().some(conversation => existingWorkspaces.some(workspace => workspace.id === conversation.workspaceId && !workspace.name && !workspace.archived)) &&
      !existingWorkspaces.some(workspace => workspace.kind === 'free' && workspace.name === 'Livre' && !workspace.archived)) {
      this.saveWorkspace({ name: 'Livre' })
    }
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
  private migrateWorkspaces(fromVersion: number): void {
    const legacyConversations = this.all<Record<string, any>>('v9_conversations')
    const legacyRuns = this.all<Record<string, any>>('v9_runs')
    const workspaceRecords = new Map<string, Record<string, any>>()
    for (const workspace of this.all<Record<string, any>>('v9_workspaces')) workspaceRecords.set(workspace.id, workspace)
    const legacyPath = (value: unknown): string | null => {
      if (typeof value !== 'string' || !value.trim()) return null
      const candidate = isAbsolute(value) ? value : resolve(this.dataDirectory, value)
      try { return canonicalDirectory(candidate) || resolve(candidate) } catch { return resolve(candidate) }
    }
    const makePrivateWorkspace = (name: string): Record<string, any> => {
      const id = randomUUID()
      const dir = join(this.dataDirectory, 'workspaces', id)
      mkdirSync(dir, { recursive: true })
      const workspace = { id, name, kind: 'free', path: realpathSync.native(dir), branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: new Date().toISOString() }
      workspaceRecords.set(id, workspace)
      return workspace
    }
    // Esquemas abaixo de 4 guardavam "directory" direto em projetos/conversas/runs, sem workspaces próprios.
    if (fromVersion < 4) {
      const legacyProjects = this.all<Record<string, any>>('v9_projects')
      const pathKey = (projectId: string | null, path: string) => `${projectId || ''}\0${path.toLocaleLowerCase()}`
      const makeWorkspace = (projectId: string | null, path: string, branch: string | null = null): Record<string, any> => {
        const key = pathKey(projectId, path)
        const existing = [...workspaceRecords.values()].find(item => pathKey(item.legacyProjectId ?? null, item.path) === key)
        if (existing) return existing
        const workspace = { id: randomUUID(), legacyProjectId: projectId, name: '', kind: 'local', path, branch, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: new Date().toISOString() }
        workspaceRecords.set(workspace.id, workspace)
        return workspace
      }
      const projectWorkspaces = new Map<string, Record<string, any>>()
      for (const project of legacyProjects) {
        const path = legacyPath(project.directory)
        const workspace = path ? makeWorkspace(project.id, path) : undefined
        if (workspace) { projectWorkspaces.set(project.id, workspace); workspace.name = project.name; workspace.instructions = project.instructions || ''; workspace.defaultAgentIds = project.defaultAgentIds || [] }
        project.defaultWorkspaceId = workspace?.id || null
      }
      for (const conversation of legacyConversations) {
        const projectId = conversation.projectId || null
        const path = legacyPath(conversation.directory)
        const projectWorkspace = projectId ? projectWorkspaces.get(projectId) : undefined
        let workspace: Record<string, any> | undefined = path
          ? projectWorkspace?.path === path ? projectWorkspace : makeWorkspace(projectId, path)
          : projectWorkspace
        if (!workspace) workspace = makePrivateWorkspace('')
        if (projectId) { const project = legacyProjects.find((item: any) => item.id === projectId); if (project && !workspace.name) { workspace.name = project.name; workspace.instructions = project.instructions || ''; workspace.defaultAgentIds = project.defaultAgentIds || [] } }
        delete conversation.directory
        conversation.workspaceId = workspace.id
        conversation.titleAuto ??= false
      }
      const conversationWorkspaces = new Map(legacyConversations.map(conversation => [conversation.id, conversation.workspaceId as string]))
      for (const run of legacyRuns) {
        const workspace = workspaceRecords.get(conversationWorkspaces.get(run.conversationId) || '')
        if (!workspace) continue
        delete run.directory
        run.workspaceId = workspace.id
        run.workspacePath = workspace.path
      }
      for (const workspace of workspaceRecords.values()) delete workspace.legacyProjectId
      this.db.exec('DROP TABLE IF EXISTS v9_projects')
    } else {
      // Esquema 4: projetos e workspaces já existiam separados; funde um no outro.
      const legacyProjects = this.all<Record<string, any>>('v9_projects')
      for (const project of legacyProjects) {
        let primary = project.defaultWorkspaceId ? workspaceRecords.get(project.defaultWorkspaceId) : undefined
        if (!primary) primary = [...workspaceRecords.values()].find(item => item.projectId === project.id)
        if (!primary) primary = makePrivateWorkspace(project.name)
        primary.name = project.name
        primary.instructions = project.instructions || ''
        primary.defaultAgentIds = project.defaultAgentIds || []
        for (const sibling of workspaceRecords.values()) {
          if (sibling.projectId === project.id && sibling.id !== primary.id) sibling.parentWorkspaceId = primary.id
        }
      }
      for (const workspace of workspaceRecords.values()) {
        if (workspace.parentWorkspaceId === undefined) workspace.parentWorkspaceId = null
        if (!workspace.projectId && !workspace.name) workspace.kind = 'free'
        delete workspace.projectId
      }
      for (const conversation of legacyConversations) delete conversation.projectId
      this.db.exec('DROP TABLE IF EXISTS v9_projects')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const workspace of workspaceRecords.values()) this.put('v9_workspaces', workspace as { id: string })
      for (const conversation of legacyConversations) this.put('v9_conversations', conversation as { id: string })
      for (const run of legacyRuns) this.put('v9_runs', run as { id: string })
      this.db.prepare("UPDATE v9_meta SET value=? WHERE key='schema'").run(String(SCHEMA_VERSION))
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private tableExists(table: string): boolean { return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) }
  private all<T>(table: string): T[] { if (!this.tableExists(table)) return []; return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(row => JSON.parse(row.data) as T) }
  private get<T>(table: string, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as T : undefined }
  private put<T extends { id: string }>(table: string, value: T): void { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value)) }
  agents(): Agent[] { return this.all<Agent>('v9_agents').map(normalizeAgent) }
  workspaces(): Workspace[] { return this.all('v9_workspaces') }
  workspace(id: string): Workspace { const value = this.get<Workspace>('v9_workspaces', id); if (!value) throw new Error('Workspace não encontrado.'); return value }
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
  snapshot(): Snapshot { return { assistant: this.agent(ASSISTANT_ID), agents: this.agents(), workspaces: this.workspaces(), conversations: this.conversations(), messages: [], runs: this.runs().slice(-100), fileChanges: this.fileChanges().slice(-500), approvals: this.approvals() } }
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
    const value: Agent = { id: previous?.id || randomUUID(), name, alias, description: String(input.description || '').slice(0, 500), instructions: requiredText(input.instructions, 'Instruções', 20000), runtime, model: String(input.model || '').slice(0, 150), effort, color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color! : '#6366f1', avatar: typeof input.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(input.avatar) && input.avatar.length < 2_000_000 ? input.avatar : '', pitsShape: ['round', 'flat', 'long'].includes(input.pitsShape || '') ? input.pitsShape : previous?.pitsShape || 'round',
      pitsEyeColor: /^#[\da-f]{6}$/i.test(input.pitsEyeColor || '') ? input.pitsEyeColor : previous?.pitsEyeColor || '#ffffff',
      pitsCheekColor: /^#[\da-f]{6}$/i.test(input.pitsCheekColor || '') ? input.pitsCheekColor : previous?.pitsCheekColor || '#f5a5d1',
      pitsEyeSize: typeof input.pitsEyeSize === 'number' && Number.isFinite(input.pitsEyeSize) ? Math.max(4, Math.min(15, input.pitsEyeSize)) : previous?.pitsEyeSize ?? 8,
      pitsEyeSpacing: typeof input.pitsEyeSpacing === 'number' && Number.isFinite(input.pitsEyeSpacing) ? Math.max(16, Math.min(42, input.pitsEyeSpacing)) : previous?.pitsEyeSpacing ?? 26,
      pitsSpeed: typeof input.pitsSpeed === 'number' && Number.isFinite(input.pitsSpeed) ? Math.max(1, Math.min(6, input.pitsSpeed)) : previous?.pitsSpeed ?? 3,
      pitsAmplitude: typeof input.pitsAmplitude === 'number' && Number.isFinite(input.pitsAmplitude) ? Math.max(0, Math.min(24, input.pitsAmplitude)) : previous?.pitsAmplitude ?? 9,
      pitsAura: input.pitsAura ?? previous?.pitsAura ?? true,
      pitsBlush: input.pitsBlush ?? previous?.pitsBlush ?? true,
      pitsAnimate: input.pitsAnimate ?? previous?.pitsAnimate ?? true,
      canWrite: input.canWrite === true, computerUse: input.computerUse === true, approvalMode, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_agents', value); return value
  }
  private userAgents(ids: string[]): void {
    for (const id of ids) { if (id === ASSISTANT_ID) throw new Error('O Assistente padrão não é cadastrado como participante.'); this.agent(id) }
  }
  saveWorkspace(input: Partial<Workspace> & { path?: string | null }): Workspace {
    const previous = input.id ? this.workspace(input.id) : undefined
    const defaultAgentIds = [...new Set(input.defaultAgentIds ?? previous?.defaultAgentIds ?? [])]
    if (defaultAgentIds.length > 10) throw new Error('A equipe padrão aceita até dez agentes.')
    this.userAgents(defaultAgentIds)
    const instructions = input.instructions === undefined ? previous?.instructions || '' : String(input.instructions)
    if (instructions.length > 20000) throw new Error('Instruções: use até 20000 caracteres.')
    const parentWorkspaceId = input.parentWorkspaceId !== undefined ? input.parentWorkspaceId : previous?.parentWorkspaceId ?? null
    if (parentWorkspaceId) this.workspace(parentWorkspaceId)
    let path = previous?.path
    let kind = previous?.kind ?? 'free'
    const id = input.id || randomUUID()
    if (input.path !== undefined) {
      const resolved = canonicalDirectory(input.path)
      if (resolved) { path = resolved; kind = input.kind === 'worktree' ? 'worktree' : 'local' }
      else { path = previous?.path; kind = previous?.kind ?? 'free' }
    }
    if (!path) {
      const dir = join(this.dataDirectory, 'workspaces', id)
      mkdirSync(dir, { recursive: true })
      path = realpathSync.native(dir)
      kind = 'free'
    }
    const name = String(input.name ?? previous?.name ?? '').trim().slice(0, 100)
    const value: Workspace = { id, name, kind, path, branch: input.branch ?? previous?.branch ?? null, baseBranch: input.baseBranch ?? previous?.baseBranch ?? null, parentWorkspaceId, instructions: instructions.trim(), defaultAgentIds, changes: Math.max(0, input.changes ?? previous?.changes ?? 0), archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_workspaces', value)
    return value
  }
  updateWorkspace(value: Workspace): Workspace { this.workspace(value.id); this.put('v9_workspaces', value); return value }
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }): Conversation {
    const previous = input.id ? this.conversation(input.id) : undefined
    let workspace = input.workspaceId ? this.workspace(input.workspaceId) : previous ? this.workspace(previous.workspaceId) : undefined
    if (input.workspacePath !== undefined) {
      const path = canonicalDirectory(input.workspacePath)
      workspace = path ? this.workspaces().find(item => item.kind === 'local' && item.path === path && !item.archived) || this.saveWorkspace({ path, kind: 'local', name: basename(path) }) : undefined
    }
    // Conversas sem projeto pertencem ao workspace Livre, sem criar pastas anônimas na navegação.
    if (!workspace) workspace = this.workspaces().find(item => !item.archived && !item.parentWorkspaceId && item.kind === 'free' && item.name === 'Livre') || this.saveWorkspace({ name: 'Livre' })
    if (workspace.archived) throw new Error('Este workspace está arquivado.')
    const agentIds = [...new Set(input.agentIds ?? previous?.agentIds ?? (!previous ? workspace.defaultAgentIds : []))]
    if (agentIds.length > 10) throw new Error('Selecione até dez agentes.')
    this.userAgents(agentIds)
    const kind = input.kind ?? (agentIds.length > 1 ? 'group' : previous?.kind ?? 'direct')
    if (kind !== 'direct' && kind !== 'group') throw new Error('Tipo de conversa inválido.')
    if (kind === 'direct' && agentIds.length > 1) throw new Error('Conversas individuais têm no máximo um agente.')
    if (kind === 'group' && !agentIds.length) throw new Error('Selecione de um a dez agentes para um grupo.')
    const named = typeof input.name === 'string' && input.name.trim() !== ''
    const name = named ? requiredText(input.name, 'Nome', 100) : previous?.name || 'Nova conversa'
    const value: Conversation = { id: previous?.id || randomUUID(), kind, name, agentIds, workspaceId: workspace.id, titleAuto: named ? false : previous?.titleAuto ?? true, revision: previous ? previous.revision + (workspace.id !== previous.workspaceId ? 1 : 0) : 1, archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_conversations', value); return value
  }
  deleteConversation(id: string): void {
    this.conversation(id)
    const runIds = this.runs().filter(run => run.conversationId === id).map(run => run.id)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM v9_messages WHERE conversation_id=?').run(id)
      for (const runId of runIds) {
        this.db.prepare('DELETE FROM v9_approvals WHERE run_id=?').run(runId)
        this.db.prepare('DELETE FROM v9_file_changes WHERE run_id=?').run(runId)
        this.db.prepare('DELETE FROM v9_runs WHERE id=?').run(runId)
      }
      this.db.prepare('DELETE FROM v9_delegations WHERE source_conversation_id=? OR target_conversation_id=?').run(id, id)
      this.db.prepare('DELETE FROM v9_conversations WHERE id=?').run(id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  deleteWorkspace(id: string, options: { cascade?: boolean } = {}): void {
    this.workspace(id)
    const children = this.workspaces().filter(item => item.parentWorkspaceId === id)
    if (children.length && !options.cascade) throw new Error(`Este workspace tem ${children.length} worktree(s) vinculado(s). Remova-os antes de excluir.`)
    for (const child of children) this.deleteWorkspace(child.id, { cascade: true })
    for (const conversation of this.conversations().filter(item => item.workspaceId === id)) this.deleteConversation(conversation.id)
    this.db.prepare('DELETE FROM v9_file_changes WHERE workspace_id=?').run(id)
    this.db.prepare('DELETE FROM v9_workspaces WHERE id=?').run(id)
  }
  deleteAgent(id: string): void {
    if (id === ASSISTANT_ID) throw new Error('O Assistente padrão não pode ser excluído.')
    this.agent(id)
    for (const conversation of this.conversations().filter(item => item.agentIds.includes(id))) this.put('v9_conversations', { ...conversation, agentIds: conversation.agentIds.filter(agentId => agentId !== id) })
    for (const workspace of this.workspaces().filter(item => item.defaultAgentIds.includes(id))) this.put('v9_workspaces', { ...workspace, defaultAgentIds: workspace.defaultAgentIds.filter(agentId => agentId !== id) })
    this.db.prepare('DELETE FROM v9_agents WHERE id=?').run(id)
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
