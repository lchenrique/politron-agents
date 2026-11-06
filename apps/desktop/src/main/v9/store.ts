import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { ASSISTANT_ID, randomPitColor, type Agent, type Approval, type ApprovalGrant, type BoardEvidence, type BoardEvent, type BoardTask, type BoardTaskMission, type BoardTeam, type CommandEvidence, type ContextCheckpoint, type Conversation, type Delegation, type FileChange, type Message, type MessageSearchHit, type Mission, type Routine, type Run, type SidebarLayout, type Snapshot, type Workspace } from '../../shared/v9'
import { validateBooAccessoryColors } from '../../shared/boo-accessory-colors'

export const SCHEMA_VERSION = 11
export const ASSISTANT: Agent = {
  id: ASSISTANT_ID, name: 'Assistente', alias: 'assistente', description: 'Assistente padrão do aplicativo, sem cadastro.',
  instructions: 'Você é o Assistente padrão do Boobot. Responda de forma direta e útil. Você não tem acesso a arquivos nem ao navegador, a menos que as ferramentas correspondentes sejam disponibilizadas nesta conversa.',
  runtime: 'codex', model: 'gpt-6-luna', color: '#6366f1', avatar: '', canWrite: true, computerUse: false, approvalMode: 'ask', runtimePermissionMode: 'managed', revision: 1, createdAt: '2026-01-01T00:00:00.000Z'
}

function normalizeConversation(value: Conversation): Conversation {
  const agentIds = Array.isArray(value.agentIds) ? value.agentIds.filter((id): id is string => typeof id === 'string') : []
  const responseMode = value.responseMode ?? 'leader'
  return { ...value, agentIds, titleAuto: value.titleAuto ?? false, responseMode, leaderAgentId: value.leaderAgentId ?? (responseMode === 'leader' ? agentIds[0] || null : null) }
}
function normalizeWorkspace(value: Workspace): Workspace {
  const defaultAgentIds = Array.isArray(value.defaultAgentIds) ? value.defaultAgentIds.filter((id): id is string => typeof id === 'string') : []
  return { ...value, defaultAgentIds }
}
export type AssistantPreferences = Pick<Agent, 'canWrite' | 'computerUse' | 'approvalMode' | 'runtimePermissionMode'>
export type SessionBinding = { key: string; threadId: string; runtime: Agent['runtime'] | null; contextVersion: number; deliveredDigests: Record<string, string> }
const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = { canWrite: true, computerUse: false, approvalMode: 'ask', runtimePermissionMode: 'managed' }
function normalizeAgent(value: Agent): Agent { return { ...value, pitsShape: ['round', 'flat', 'long', 'drop', 'squircle', 'bean', 'ghost-wave', 'ghost-puff', 'ghost-peak', 'cute-squid', 'soft-square', 'little-cat'].includes(value.pitsShape || '') ? value.pitsShape : 'ghost-wave', approvalMode: value.approvalMode === 'automatic' || value.approvalMode === 'bypass' ? value.approvalMode : 'ask', runtimePermissionMode: value.runtimePermissionMode === 'bypass' ? 'bypass' : 'managed' } }

const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = { projectOrder: [], groups: [], sessionOrder: {}, agentOrder: [] }
const LAYOUT_ERROR = 'Ordem do sidebar inválida.'
function layoutIds(value: unknown, limit = 5000): string[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)) throw new Error(LAYOUT_ERROR)
  return [...new Set(value as string[])]
}
/** Valida a entrada (fronteira IPC/host remoto) e mescla sobre o layout anterior. */
export function validateSidebarLayout(input: unknown, previous: SidebarLayout): SidebarLayout {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(LAYOUT_ERROR)
  const value = input as Record<string, unknown>
  const next: SidebarLayout = { ...previous, sessionOrder: { ...previous.sessionOrder } }
  if (value.projectOrder !== undefined) next.projectOrder = layoutIds(value.projectOrder)
  if (value.agentOrder !== undefined) next.agentOrder = layoutIds(value.agentOrder)
  if (value.groups !== undefined) {
    if (!Array.isArray(value.groups) || value.groups.length > 200) throw new Error(LAYOUT_ERROR)
    next.groups = value.groups.map(group => {
      const item = group as Record<string, unknown> | null
      if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200) throw new Error(LAYOUT_ERROR)
      return { name: item.name.trim(), workspaceIds: layoutIds(item.workspaceIds) }
    })
    if (new Set(next.groups.map(group => group.name)).size !== next.groups.length) throw new Error(LAYOUT_ERROR)
  }
  if (value.sessionOrder !== undefined) {
    const entries = value.sessionOrder && typeof value.sessionOrder === 'object' && !Array.isArray(value.sessionOrder) ? Object.entries(value.sessionOrder) : null
    if (!entries || entries.length > 2000) throw new Error(LAYOUT_ERROR)
    for (const [id, ids] of entries) {
      if (!id || id.length > 200 || id === '__proto__') throw new Error(LAYOUT_ERROR)
      next.sessionOrder[id] = layoutIds(ids)
    }
  }
  return next
}

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
    let previousSchema: number | null
    // Falha na primeira leitura fecha a conexão, para uma nova tentativa não deixar o arquivo preso.
    try { previousSchema = this.schemaVersion() } catch (error) { this.db.close(); throw error }
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
      CREATE TABLE IF NOT EXISTS v9_approval_grants (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, scope_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(agent_id, workspace_id, kind, scope_key));
      CREATE INDEX IF NOT EXISTS v9_approval_grant_scope ON v9_approval_grants(agent_id, workspace_id, kind);
      CREATE TABLE IF NOT EXISTS v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL, runtime TEXT, context_version INTEGER NOT NULL DEFAULT 0, delivered_digests TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_checkpoints (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, agent_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_command_evidence (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES v9_conversations(id) ON DELETE CASCADE, data TEXT NOT NULL, UNIQUE(run_id, tool_call_id));
      CREATE INDEX IF NOT EXISTS v9_command_evidence_conversation ON v9_command_evidence(conversation_id, run_id);
      CREATE INDEX IF NOT EXISTS v9_checkpoint_scope ON v9_checkpoints(conversation_id, agent_id, created_at);
      CREATE INDEX IF NOT EXISTS v9_delegation_source ON v9_delegations(source_conversation_id);
      CREATE INDEX IF NOT EXISTS v9_delegation_target ON v9_delegations(target_conversation_id);
      CREATE TABLE IF NOT EXISTS v9_missions (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_mission_conversation ON v9_missions(conversation_id);
      CREATE TABLE IF NOT EXISTS v9_routines (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_board_teams (id TEXT PRIMARY KEY, name_key TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_board_tasks (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES v9_board_teams(id) ON DELETE RESTRICT, status TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_board_task_status ON v9_board_tasks(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS v9_board_task_team ON v9_board_tasks(team_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS v9_board_events (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v9_board_tasks(id) ON DELETE CASCADE, created_at TEXT NOT NULL, idempotency_key TEXT UNIQUE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_board_event_task ON v9_board_events(task_id, created_at, id);
      CREATE TABLE IF NOT EXISTS v9_board_task_missions (task_id TEXT NOT NULL REFERENCES v9_board_tasks(id) ON DELETE CASCADE, role TEXT NOT NULL, round INTEGER NOT NULL CHECK(round >= 0), mission_id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(task_id, role, round));
      CREATE INDEX IF NOT EXISTS v9_board_mission_task ON v9_board_task_missions(task_id, round);
      CREATE TABLE IF NOT EXISTS v9_board_evidence (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v9_board_tasks(id) ON DELETE CASCADE, round INTEGER NOT NULL CHECK(round >= 0), created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_board_evidence_task ON v9_board_evidence(task_id, round, created_at);
      INSERT OR IGNORE INTO v9_meta VALUES ('schema','${previousSchema ?? SCHEMA_VERSION}');`)
    if (previousSchema !== null && previousSchema < 7) this.migrateWorkspaces(previousSchema)
    if (previousSchema !== null && previousSchema < 8) this.migrateSessionBindings()
    if (previousSchema !== null && previousSchema < 9) this.migrateCommandEvidence()
    if (previousSchema !== null && previousSchema < 10) this.db.prepare("UPDATE v9_meta SET value='10' WHERE key='schema'").run()
    if (previousSchema !== null && previousSchema < 11) this.db.prepare("UPDATE v9_meta SET value='11' WHERE key='schema'").run()
    if (previousSchema === null) this.db.prepare("UPDATE v9_meta SET value=? WHERE key='schema'").run(String(SCHEMA_VERSION))
    // Agrupar sessões livres antigas sem mover seus diretórios originais.
    const existingWorkspaces = this.workspaces()
    if (this.conversations().some(conversation => existingWorkspaces.some(workspace => workspace.id === conversation.workspaceId && !workspace.name && !workspace.archived)) &&
      !existingWorkspaces.some(workspace => workspace.kind === 'free' && workspace.name === 'Livre' && !workspace.archived)) {
      this.saveWorkspace({ name: 'Livre' })
    }
    this.repairDelegatedMessageLinks()
    for (const run of this.runs()) {
      if (['queued', 'running', 'waiting'].includes(run.status)) {
        this.putRun({ ...run, status: 'interrupted' })
        const message = this.message(run.messageId)
        if (message) this.putMessage({ ...message, status: 'interrupted', text: message.text || 'Execução interrompida ao fechar o aplicativo.' })
        // A fila não sobrevive ao fechamento: a mensagem que esperava fica no chat como interrompida.
        const input = run.inputMessageId ? this.message(run.inputMessageId) : undefined
        if (input?.role === 'user' && input.status === 'queued') this.putMessage({ ...input, status: 'interrupted' })
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
    this.ensureMessageSearchIndex()
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
    const legacyConversations = this.all<Record<string, any>>('v9_conversations')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
    const legacyRuns = this.all<Record<string, any>>('v9_runs')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
    const workspaceRecords = new Map<string, Record<string, any>>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
    for (const workspace of this.all<Record<string, any>>('v9_workspaces')) workspaceRecords.set(workspace.id, workspace)
    const legacyPath = (value: unknown): string | null => {
      if (typeof value !== 'string' || !value.trim()) return null
      const candidate = isAbsolute(value) ? value : resolve(this.dataDirectory, value)
      try { return canonicalDirectory(candidate) || resolve(candidate) } catch { return resolve(candidate) }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
      const legacyProjects = this.all<Record<string, any>>('v9_projects')
      const pathKey = (projectId: string | null, path: string) => `${projectId || ''}\0${path.toLocaleLowerCase()}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
      const makeWorkspace = (projectId: string | null, path: string, branch: string | null = null): Record<string, any> => {
        const key = pathKey(projectId, path)
        const existing = [...workspaceRecords.values()].find(item => pathKey(item.legacyProjectId ?? null, item.path) === key)
        if (existing) return existing
        const workspace = { id: randomUUID(), legacyProjectId: projectId, name: '', kind: 'local', path, branch, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: new Date().toISOString() }
        workspaceRecords.set(workspace.id, workspace)
        return workspace
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
        let workspace: Record<string, any> | undefined = path
          ? projectWorkspace?.path === path ? projectWorkspace : makeWorkspace(projectId, path)
          : projectWorkspace
        if (!workspace) workspace = makePrivateWorkspace('')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registros dinâmicos de migração/IPC/eventos de runtime; tipar exigiria refatoração fora do escopo
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
    // Esquema 6: o Chief nasceu sem nenhuma permissão habilitada, mesmo com a aprovação do usuário já exigida em cada proposta; libera as quatro permissões nos workspaces existentes para igualar o padrão novo.
    if (fromVersion < 6) {
      for (const workspace of workspaceRecords.values()) {
        const permissions = workspace.permissions || {}
        workspace.permissions = { ...permissions, chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true }
      }
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const workspace of workspaceRecords.values()) this.put('v9_workspaces', workspace as { id: string })
      for (const conversation of legacyConversations) this.put('v9_conversations', conversation as { id: string })
      for (const run of legacyRuns) this.put('v9_runs', run as { id: string })
      this.db.prepare("UPDATE v9_meta SET value='7' WHERE key='schema'").run()
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private tableExists(table: string): boolean { return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) }
  private all<T>(table: string): T[] { if (!this.tableExists(table)) return []; return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(row => JSON.parse(row.data) as T) }
  private recent<T>(table: 'v9_runs' | 'v9_file_changes', limit: number): T[] {
    const rows = this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC LIMIT ?`).all(limit) as { data: string }[]
    return rows.reverse().map(row => JSON.parse(row.data) as T)
  }
  private get<T>(table: string, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as T : undefined }
  private put<T extends { id: string }>(table: string, value: T): void { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value)) }
  agents(): Agent[] { return this.all<Agent>('v9_agents').map(normalizeAgent) }
  workspaces(): Workspace[] { return this.all<Workspace>('v9_workspaces').map(normalizeWorkspace) }
  workspace(id: string): Workspace { const value = this.get<Workspace>('v9_workspaces', id); if (!value) throw new Error('Workspace não encontrado.'); return normalizeWorkspace(value) }
  conversations(): Conversation[] { return this.all<Conversation>('v9_conversations').map(normalizeConversation) }
  runs(): Run[] { return this.all('v9_runs') }
  run(id: string): Run | undefined { return this.get('v9_runs', id) }
  delegations(): Delegation[] { return (this.db.prepare('SELECT data FROM v9_delegations ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  delegation(id: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  delegationByKey(key: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE idempotency_key=?').get(key) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  assistantPreferences(): AssistantPreferences {
    const read = (key: keyof AssistantPreferences) => this.db.prepare('SELECT value FROM v9_meta WHERE key=?').get(`assistant_${key}`) as { value: string } | undefined
    return {
      canWrite: read('canWrite')?.value === undefined ? DEFAULT_ASSISTANT_PREFERENCES.canWrite : read('canWrite')?.value === 'true',
      computerUse: read('computerUse')?.value === undefined ? DEFAULT_ASSISTANT_PREFERENCES.computerUse : read('computerUse')?.value === 'true',
      approvalMode: read('approvalMode')?.value === 'automatic' || read('approvalMode')?.value === 'bypass' ? read('approvalMode')!.value as Agent['approvalMode'] : 'ask',
      runtimePermissionMode: read('runtimePermissionMode')?.value === 'bypass' ? 'bypass' : 'managed'
    }
  }
  saveAssistantPreferences(input: Partial<AssistantPreferences>): Agent {
    const previous = this.assistantPreferences()
    const value: AssistantPreferences = {
      canWrite: input.canWrite ?? previous.canWrite,
      computerUse: input.computerUse ?? previous.computerUse,
      approvalMode: input.approvalMode ?? previous.approvalMode,
      runtimePermissionMode: input.runtimePermissionMode ?? previous.runtimePermissionMode
    }
    if (typeof value.canWrite !== 'boolean' || typeof value.computerUse !== 'boolean' || !['ask', 'automatic', 'bypass'].includes(value.approvalMode) || !['managed', 'bypass'].includes(value.runtimePermissionMode || 'managed')) throw new Error('Preferências do Assistente inválidas.')
    for (const [key, setting] of Object.entries(value)) this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`assistant_${key}`, String(setting))
    return { ...ASSISTANT, ...value, runtimePermissionMode: value.runtimePermissionMode || 'managed' }
  }
  terminalEnabled(): boolean {
    const row = this.db.prepare('SELECT value FROM v9_meta WHERE key=?').get('terminal_enabled') as { value: string } | undefined
    return row ? row.value === 'true' : true
  }
  saveTerminalAccess(enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new Error('A permissão global de terminal precisa ser booleana.')
    this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('terminal_enabled', String(enabled))
  }
  /** Ordem manual do sidebar; null enquanto nunca foi salva (o renderer migra os grupos antigos). */
  sidebarLayout(): SidebarLayout | null {
    const row = this.db.prepare('SELECT value FROM v9_meta WHERE key=?').get('sidebar_layout') as { value: string } | undefined
    if (!row) return null
    try { return validateSidebarLayout(JSON.parse(row.value), EMPTY_SIDEBAR_LAYOUT) } catch { return { ...EMPTY_SIDEBAR_LAYOUT } }
  }
  /** Mescla campos enviados; sessionOrder mescla por projeto e lista vazia apaga a entrada. */
  saveSidebarLayout(input: unknown): SidebarLayout {
    const next = validateSidebarLayout(input, this.sidebarLayout() ?? EMPTY_SIDEBAR_LAYOUT)
    // Projetos apagados não deixam ordem órfã crescendo no banco.
    const workspaces = new Set(this.all<Workspace>('v9_workspaces').map(item => item.id))
    next.sessionOrder = Object.fromEntries(Object.entries(next.sessionOrder).filter(([id, ids]) => ids.length && workspaces.has(id)))
    this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('sidebar_layout', JSON.stringify(next))
    return next
  }
  /** Autorização global do navegador real: vale para todas as conversas e agentes com uso do computador. */
  externalBrowserAlways(): boolean {
    const row = this.db.prepare('SELECT value FROM v9_meta WHERE key=?').get('external_browser_always') as { value: string } | undefined
    return row?.value === 'true'
  }
  saveExternalBrowserAlways(enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new Error('A permissão global do navegador real precisa ser booleana.')
    this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('external_browser_always', String(enabled))
  }
  /** Consentimento do navegador externo (extensão oficial), por conversa e agente; ausência significa não autorizado. */
  externalBrowserGrant(conversationId: string, agentId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM v9_meta WHERE key=?').get(`external_browser:${conversationId}:${agentId}`)
  }
  saveExternalBrowserGrant(conversationId: string, agentId: string, enabled: boolean): void {
    const key = `external_browser:${conversationId}:${agentId}`
    if (enabled) this.db.prepare('INSERT INTO v9_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, new Date().toISOString())
    else this.db.prepare('DELETE FROM v9_meta WHERE key=?').run(key)
  }
  agent(id: string): Agent { if (id === ASSISTANT_ID) return { ...ASSISTANT, ...this.assistantPreferences() }; const value = this.get<Agent>('v9_agents', id); if (!value) throw new Error('Agente não encontrado.'); return normalizeAgent(value) }
  conversation(id: string): Conversation { const value = this.get<Conversation>('v9_conversations', id); if (!value) throw new Error('Conversa não encontrada.'); return normalizeConversation(value) }
  message(id: string): Message | undefined { return this.get('v9_messages', id) }
  history(id: string): Message[] {
    return (this.db.prepare('SELECT data FROM (SELECT rowid,data FROM v9_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 500) ORDER BY rowid').all(id) as { data: string }[]).map(row => JSON.parse(row.data))
  }
  historyPage(id: string, beforeCursor?: number | string | null, limit = 100) {
    const pageSize = Math.max(1, Math.min(200, Math.floor(limit)))
    // A âncora por ID mantém a paginação correta quando o renderer descarta páginas da memória.
    const cursor = typeof beforeCursor === 'string'
      ? (this.db.prepare('SELECT rowid FROM v9_messages WHERE id=? AND conversation_id=?').get(beforeCursor, id) as { rowid: number } | undefined)?.rowid ?? 0
      : beforeCursor
    const rows = (cursor == null
      ? this.db.prepare('SELECT rowid,data FROM v9_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?').all(id, pageSize + 1)
      : this.db.prepare('SELECT rowid,data FROM v9_messages WHERE conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(id, cursor, pageSize + 1)) as { rowid: number; data: string }[]
    const hasMore = rows.length > pageSize
    const page = rows.slice(0, pageSize).reverse()
    return { messages: page.map(row => JSON.parse(row.data) as Message), hasMore, beforeCursor: page.length ? page[0].rowid : null }
  }
  searchHistory(id: string, query: string, limit = 25): MessageSearchHit[] {
    const clean = query.normalize('NFC').trim().slice(0, 200)
    if (!clean) return []
    const pageSize = Math.max(1, Math.min(50, Math.floor(limit)))
    try {
      const match = clean.split(/\s+/).slice(0, 12).map(term => `"${term.split('"').join('""')}"`).join(' AND ')
      const rows = this.db.prepare(`SELECT m.rowid AS cursor,m.data AS data,snippet(v9_message_fts,3,'','', ' … ',16) AS snippet FROM v9_message_fts JOIN v9_messages m ON m.id=v9_message_fts.message_id WHERE v9_message_fts MATCH ? AND v9_message_fts.conversation_id=? ORDER BY bm25(v9_message_fts) LIMIT ?`).all(match, id, pageSize) as { cursor: number; data: string; snippet: string }[]
      return rows.map(row => ({ message: JSON.parse(row.data) as Message, cursor: row.cursor, snippet: row.snippet }))
    } catch {
      const rows = this.db.prepare('SELECT rowid AS cursor,data FROM v9_messages WHERE conversation_id=? AND data LIKE ? ORDER BY rowid DESC LIMIT ?').all(id, `%${clean}%`, pageSize) as { cursor: number; data: string }[]
      return rows.map(row => { const message = JSON.parse(row.data) as Message; return { message, cursor: row.cursor, snippet: message.text.slice(0, 240) } })
    }
  }
  historyAround(id: string, cursor: number, limit = 100) {
    const pageSize = Math.max(20, Math.min(200, Math.floor(limit)))
    const olderSize = Math.floor(pageSize / 2)
    const newerSize = pageSize - olderSize - 1
    const older = this.db.prepare('SELECT rowid,data FROM v9_messages WHERE conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(id, cursor, olderSize + 1) as { rowid: number; data: string }[]
    const target = this.db.prepare('SELECT rowid,data FROM v9_messages WHERE conversation_id=? AND rowid=?').get(id, cursor) as { rowid: number; data: string } | undefined
    if (!target) return { messages: [], hasMore: false, beforeCursor: null }
    const newer = this.db.prepare('SELECT rowid,data FROM v9_messages WHERE conversation_id=? AND rowid>? ORDER BY rowid ASC LIMIT ?').all(id, cursor, newerSize) as { rowid: number; data: string }[]
    const rows = [...older.slice(0, olderSize).reverse(), target, ...newer]
    return { messages: rows.map(row => JSON.parse(row.data) as Message), hasMore: older.length > olderSize, beforeCursor: rows[0]?.rowid ?? null }
  }
  latestCheckpoint(conversationId: string, agentId: string): ContextCheckpoint | undefined {
    const row = this.db.prepare('SELECT data FROM v9_checkpoints WHERE conversation_id=? AND agent_id=? ORDER BY rowid DESC LIMIT 1').get(conversationId, agentId) as { data: string } | undefined
    return row ? JSON.parse(row.data) as ContextCheckpoint : undefined
  }
  saveCheckpoint(checkpoint: ContextCheckpoint): void {
    this.db.prepare('INSERT INTO v9_checkpoints(id,conversation_id,agent_id,created_at,data) VALUES(?,?,?,?,?)').run(checkpoint.id, checkpoint.conversationId, checkpoint.agentId, checkpoint.createdAt, JSON.stringify(checkpoint))
    this.db.prepare('DELETE FROM v9_checkpoints WHERE conversation_id=? AND agent_id=? AND id NOT IN (SELECT id FROM v9_checkpoints WHERE conversation_id=? AND agent_id=? ORDER BY rowid DESC LIMIT 10)').run(checkpoint.conversationId, checkpoint.agentId, checkpoint.conversationId, checkpoint.agentId)
  }
  private ensureMessageSearchIndex(): void {
    try {
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS v9_message_fts USING fts5(message_id UNINDEXED, conversation_id UNINDEXED, author, text, tokenize='unicode61 remove_diacritics 2')")
      this.db.exec('DELETE FROM v9_message_fts WHERE message_id NOT IN (SELECT id FROM v9_messages)')
      this.db.exec("INSERT INTO v9_message_fts(message_id,conversation_id,author,text) SELECT m.id,m.conversation_id,json_extract(m.data,'$.author'),json_extract(m.data,'$.text') FROM v9_messages m WHERE (json_extract(m.data,'$.role') IN ('user','activity') OR json_extract(m.data,'$.status') IN ('completed','failed','interrupted')) AND NOT EXISTS (SELECT 1 FROM v9_message_fts f WHERE f.message_id=m.id)")
    } catch { /* SQLite sem FTS5 mantém a busca limitada por LIKE. */ }
  }
  snapshot(): Snapshot {
    const parents = new Map((this.db.prepare('SELECT source_conversation_id AS source, target_conversation_id AS target FROM v9_delegations ORDER BY rowid').all() as { source: string; target: string }[]).map(row => [row.target, row.source]))
    // Última mensagem por conversa: MAX(rowid) percorre só o índice v9_message_context.
    const updated = new Map((this.db.prepare("SELECT conversation_id AS id, json_extract(data,'$.createdAt') AS at FROM v9_messages WHERE rowid IN (SELECT MAX(rowid) FROM v9_messages GROUP BY conversation_id)").all() as { id: string; at: string | null }[]).map(row => [row.id, row.at]))
    const conversations = this.conversations().map(item => {
      const parent = parents.get(item.id), updatedAt = updated.get(item.id)
      return { ...item, ...(parent && parent !== item.id ? { parentConversationId: parent } : {}), ...(updatedAt ? { updatedAt } : {}) }
    })
    return { assistant: this.agent(ASSISTANT_ID), agents: this.agents(), workspaces: this.workspaces(), conversations, messages: [], runs: this.recent<Run>('v9_runs', 100), fileChanges: this.recent<FileChange>('v9_file_changes', 500), approvals: this.approvals(), terminalEnabled: this.terminalEnabled(), missions: this.missions(100), routines: this.routines() }
  }
  saveAgent(input: Partial<Agent>): Agent {
    const previous = input.id ? this.agent(input.id) : undefined
    const name = requiredText(input.name, 'Nome', 80)
    const alias = requiredText(input.alias || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), 'Menção', 80)
    if (!/^[\p{L}\p{N}_-]+$/u.test(alias)) throw new Error('Use letras, números, hífen ou sublinhado na menção.')
    if (alias.toLowerCase() === ASSISTANT.alias || this.agents().some(agent => agent.id !== input.id && agent.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Essa menção já pertence a outro agente.')
    const runtime = input.runtime ?? previous?.runtime ?? 'codex'
    if (!['codex', 'claude', 'pi', 'opencode', 'antigravity'].includes(runtime)) throw new Error('Motor de agente inválido.')
    const approvalMode = input.approvalMode ?? previous?.approvalMode ?? 'ask'
    if (approvalMode !== 'ask' && approvalMode !== 'automatic' && approvalMode !== 'bypass') throw new Error('Modo de aprovação inválido.')
    const runtimePermissionMode = input.runtimePermissionMode ?? previous?.runtimePermissionMode ?? 'managed'
    if (runtimePermissionMode !== 'managed' && runtimePermissionMode !== 'bypass') throw new Error('Permissão do motor inválida.')
    const effort = input.effort ?? previous?.effort ?? 'medium'
    if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw new Error('Esforço do agente inválido.')
    const role = input.role ?? previous?.role ?? 'agent'
    if (role !== 'agent' && role !== 'chief') throw new Error('Papel de agente inválido.')
    if (role === 'chief' && this.agents().some(agent => agent.id !== input.id && agent.role === 'chief')) throw new Error('Já existe um Chief. Remova esse papel do agente atual antes de transferi-lo.')
    const temporary = input.temporary ?? previous?.temporary ?? false
    const temporaryStatus = temporary ? input.temporaryStatus ?? previous?.temporaryStatus ?? 'available' : undefined
    if (temporaryStatus && !['available', 'working', 'retired'].includes(temporaryStatus)) throw new Error('Estado de Boo temporário inválido.')
    if (temporary && role === 'chief') throw new Error('O Chief não pode ser temporário.')
    const temporaryWorkspaceId = temporary ? input.temporaryWorkspaceId ?? previous?.temporaryWorkspaceId : undefined
    // Skills do Marketplace do Boo (slugs das pastas do catálogo); slug desconhecido só é ignorado na hora de listar.
    if (input.skillIds !== undefined && (!Array.isArray(input.skillIds) || input.skillIds.length > 80 || input.skillIds.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)))) throw new Error('Skills do Boo inválidas.')
    const skillIds = input.skillIds !== undefined ? [...new Set(input.skillIds)] : previous?.skillIds
    if (temporaryWorkspaceId) this.workspace(temporaryWorkspaceId)
    const value: Agent = { id: previous?.id || randomUUID(), name, alias, temporary, temporaryStatus, temporaryWorkspaceId, temporaryTask: temporary ? String(input.temporaryTask ?? previous?.temporaryTask ?? '').slice(0, 5000) : undefined, description: String(input.description || '').slice(0, 500), instructions: requiredText(input.instructions, 'Instruções', 20000), runtime, model: String(input.model || '').slice(0, 150), effort, role, ...(skillIds?.length ? { skillIds } : {}), color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color! : previous?.color || randomPitColor(), avatar: typeof input.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(input.avatar) && input.avatar.length < 2_000_000 ? input.avatar : '', pitsShape: ['round', 'flat', 'long', 'drop', 'squircle', 'bean', 'ghost-wave', 'ghost-puff', 'ghost-peak', 'cute-squid', 'soft-square', 'little-cat'].includes(input.pitsShape || '') ? input.pitsShape : previous?.pitsShape || 'ghost-wave',
      pitsAccessory: ['none', 'antenna', 'horns', 'glasses', 'cap'].includes(input.pitsAccessory || '') ? input.pitsAccessory : previous?.pitsAccessory || 'none',
      pitsHeadAccessory: ['boo-sprout', 'boo-star', 'boo-king-crown', 'boo-halo', 'boo-noel', 'none', 'antenna', 'horns', 'cap', 'cap-flat', 'cap-back', 'beanie', 'bucket', 'top-hat', 'witch-hat', 'headphones', 'crown', 'party-hat', 'chef-hat', 'bow', 'flower', 'halo'].includes(input.pitsHeadAccessory || '') ? input.pitsHeadAccessory : previous?.pitsHeadAccessory ?? ((input.pitsAccessory || previous?.pitsAccessory) === 'glasses' ? 'none' : (input.pitsAccessory || previous?.pitsAccessory || 'none')) as Agent['pitsHeadAccessory'],
      pitsFaceAccessory: ['none', 'glasses', 'round-glasses', 'sunglasses', 'heart-glasses', 'star-glasses', 'monocle', 'mustache', 'star-mask'].includes(input.pitsFaceAccessory || '') ? input.pitsFaceAccessory : previous?.pitsFaceAccessory ?? ((input.pitsAccessory || previous?.pitsAccessory) === 'glasses' ? 'glasses' : 'none'),
      pitsAccessoryColors: input.pitsAccessoryColors === undefined ? previous?.pitsAccessoryColors : validateBooAccessoryColors(input.pitsAccessoryColors),
      pitsEyeColor: /^#[\da-f]{6}$/i.test(input.pitsEyeColor || '') ? input.pitsEyeColor : previous?.pitsEyeColor || '#ffffff',
      pitsCheekColor: /^#[\da-f]{6}$/i.test(input.pitsCheekColor || '') ? input.pitsCheekColor : previous?.pitsCheekColor || '#f5a5d1',
      pitsEyeSize: typeof input.pitsEyeSize === 'number' && Number.isFinite(input.pitsEyeSize) ? Math.max(4, Math.min(15, input.pitsEyeSize)) : previous?.pitsEyeSize ?? 8,
      pitsEyeSpacing: typeof input.pitsEyeSpacing === 'number' && Number.isFinite(input.pitsEyeSpacing) ? Math.max(16, Math.min(42, input.pitsEyeSpacing)) : previous?.pitsEyeSpacing ?? 26,
      pitsMouthSize: typeof input.pitsMouthSize === 'number' && Number.isFinite(input.pitsMouthSize) ? Math.max(.65, Math.min(1.6, input.pitsMouthSize)) : previous?.pitsMouthSize ?? 1,
      pitsBlushStrength: typeof input.pitsBlushStrength === 'number' && Number.isFinite(input.pitsBlushStrength) ? Math.max(0, Math.min(1, input.pitsBlushStrength)) : previous?.pitsBlushStrength ?? .45,
      pitsBodyWidth: typeof input.pitsBodyWidth === 'number' && Number.isFinite(input.pitsBodyWidth) ? Math.max(.75, Math.min(1.25, input.pitsBodyWidth)) : previous?.pitsBodyWidth ?? 1,
      pitsBodyHeight: typeof input.pitsBodyHeight === 'number' && Number.isFinite(input.pitsBodyHeight) ? Math.max(.75, Math.min(1.25, input.pitsBodyHeight)) : previous?.pitsBodyHeight ?? 1,
      pitsSpeed: typeof input.pitsSpeed === 'number' && Number.isFinite(input.pitsSpeed) ? Math.max(1, Math.min(6, input.pitsSpeed)) : previous?.pitsSpeed ?? 3,
      pitsAmplitude: typeof input.pitsAmplitude === 'number' && Number.isFinite(input.pitsAmplitude) ? Math.max(0, Math.min(24, input.pitsAmplitude)) : previous?.pitsAmplitude ?? 9,
      pitsAura: input.pitsAura ?? previous?.pitsAura ?? true,
      pitsBlush: input.pitsBlush ?? previous?.pitsBlush ?? true,
      pitsAnimate: input.pitsAnimate ?? previous?.pitsAnimate ?? true,
      pitsAccentColor: /^#[\da-f]{6}$/i.test(input.pitsAccentColor || '') ? input.pitsAccentColor : previous?.pitsAccentColor,
      pitsHeadset: input.pitsHeadset ?? previous?.pitsHeadset ?? true,
      canWrite: input.canWrite ?? previous?.canWrite ?? true, computerUse: input.computerUse ?? previous?.computerUse ?? false, approvalMode, runtimePermissionMode, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || new Date().toISOString() }
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
    const permissionInput: Partial<NonNullable<Workspace['permissions']>> = input.permissions || {}
    const oldPermissions = previous?.permissions
    const filesWrite = permissionInput.filesWrite ?? oldPermissions?.filesWrite ?? 'inherit'
    const computerUse = permissionInput.computerUse ?? oldPermissions?.computerUse ?? 'inherit'
    if (!['inherit', 'deny'].includes(filesWrite) || !['inherit', 'deny'].includes(computerUse)) throw new Error('Política de acesso do workspace inválida.')
    // Workspaces novos permitem propostas do Chief; o modo de aprovação do agente controla a confirmação.
    const chiefCreateAgents = permissionInput.chiefCreateAgents ?? oldPermissions?.chiefCreateAgents ?? true
    const chiefEditAgents = permissionInput.chiefEditAgents ?? oldPermissions?.chiefEditAgents ?? true
    const chiefManageTeam = permissionInput.chiefManageTeam ?? oldPermissions?.chiefManageTeam ?? true
    const chiefCreateSessions = permissionInput.chiefCreateSessions ?? oldPermissions?.chiefCreateSessions ?? true
    if ([chiefCreateAgents, chiefEditAgents, chiefManageTeam, chiefCreateSessions].some(value => typeof value !== 'boolean')) throw new Error('Permissões do Chief inválidas.')
    const permissions = {
      chiefCreateAgents,
      chiefEditAgents,
      chiefManageTeam,
      chiefCreateSessions,
      filesWrite: filesWrite as NonNullable<Workspace['permissions']>['filesWrite'],
      computerUse: computerUse as NonNullable<Workspace['permissions']>['computerUse']
    }
    const value: Workspace = { id, name, kind, path, branch: input.branch ?? previous?.branch ?? null, baseBranch: input.baseBranch ?? previous?.baseBranch ?? null, parentWorkspaceId, instructions: instructions.trim(), defaultAgentIds, permissions, changes: Math.max(0, input.changes ?? previous?.changes ?? 0), archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_workspaces', value)
    return value
  }
  updateWorkspace(value: Workspace): Workspace { this.workspace(value.id); this.put('v9_workspaces', value); return value }
  updateWorkspaceGitStatus(id: string, info: { branch: string | null; changes: number }): Workspace | undefined {
    const current = this.get<Workspace>('v9_workspaces', id)
    if (!current || current.archived) return undefined
    const updated = { ...normalizeWorkspace(current), branch: info.branch, changes: Math.max(0, info.changes) }
    this.put('v9_workspaces', updated)
    return updated
  }
  private migrateSessionBindings(): void {
    const columns = new Set((this.db.prepare('PRAGMA table_info(v9_sessions)').all() as { name: string }[]).map(column => column.name))
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!columns.has('runtime')) this.db.exec('ALTER TABLE v9_sessions ADD COLUMN runtime TEXT')
      if (!columns.has('context_version')) this.db.exec("ALTER TABLE v9_sessions ADD COLUMN context_version INTEGER NOT NULL DEFAULT 0")
      if (!columns.has('delivered_digests')) this.db.exec("ALTER TABLE v9_sessions ADD COLUMN delivered_digests TEXT NOT NULL DEFAULT '{}'")
      this.db.prepare("UPDATE v9_meta SET value='8' WHERE key='schema'").run()
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private migrateCommandEvidence(): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('CREATE TABLE IF NOT EXISTS v9_command_evidence (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES v9_conversations(id) ON DELETE CASCADE, data TEXT NOT NULL, UNIQUE(run_id, tool_call_id)); CREATE INDEX IF NOT EXISTS v9_command_evidence_conversation ON v9_command_evidence(conversation_id, run_id);')
      this.db.prepare("UPDATE v9_meta SET value='9' WHERE key='schema'").run()
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
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
    const responseMode = input.responseMode ?? previous?.responseMode ?? 'leader'
    if (responseMode !== 'broadcast' && responseMode !== 'leader' && responseMode !== 'auto' && responseMode !== 'discussion') throw new Error('Modo de resposta do grupo inválido.')
    // O líder também é o fallback do modo automático. Se o grupo ainda não tinha líder, o primeiro participante assume.
    const leaderAgentId = kind === 'group' && responseMode !== 'broadcast' ? (input.leaderAgentId !== undefined ? input.leaderAgentId : previous?.leaderAgentId) || agentIds[0] || null : null
    if (kind === 'group' && responseMode !== 'broadcast' && (!leaderAgentId || !agentIds.includes(leaderAgentId))) throw new Error('Escolha um líder que participe desta conversa.')
    const value: Conversation = { id: previous?.id || randomUUID(), kind, name, agentIds, workspaceId: workspace.id, titleAuto: named ? false : previous?.titleAuto ?? true, responseMode, leaderAgentId, revision: previous ? previous.revision + (workspace.id !== previous.workspaceId ? 1 : 0) : 1, archived: input.archived ?? previous?.archived ?? false, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_conversations', value); return value
  }
  deleteConversation(id: string): void {
    this.conversation(id)
    const runIds = this.runs().filter(run => run.conversationId === id).map(run => run.id)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM v9_messages WHERE conversation_id=?').run(id)
      this.db.prepare('DELETE FROM v9_checkpoints WHERE conversation_id=?').run(id)
      try { this.db.prepare('DELETE FROM v9_message_fts WHERE conversation_id=?').run(id) } catch { /* Índice FTS5 pode não estar disponível. */ }
      for (const runId of runIds) {
        this.db.prepare('DELETE FROM v9_command_evidence WHERE run_id=?').run(runId)
        this.db.prepare('DELETE FROM v9_approvals WHERE run_id=?').run(runId)
        this.db.prepare('DELETE FROM v9_file_changes WHERE run_id=?').run(runId)
        this.db.prepare('DELETE FROM v9_runs WHERE id=?').run(runId)
      }
      this.db.prepare('DELETE FROM v9_delegations WHERE source_conversation_id=? OR target_conversation_id=?').run(id, id)
      this.db.prepare('DELETE FROM v9_missions WHERE conversation_id=?').run(id)
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
    this.db.prepare('DELETE FROM v9_approval_grants WHERE workspace_id=?').run(id)
    this.db.prepare('DELETE FROM v9_workspaces WHERE id=?').run(id)
  }
  deleteAgent(id: string): void {
    if (id === ASSISTANT_ID) throw new Error('O Assistente padrão não pode ser excluído.')
    this.agent(id)
    for (const conversation of this.conversations()) {
      const currentAgentIds = Array.isArray(conversation.agentIds) ? conversation.agentIds : []
      if (!currentAgentIds.includes(id) && conversation.leaderAgentId !== id) continue
      const agentIds = currentAgentIds.filter(agentId => agentId !== id)
      this.put('v9_conversations', { ...conversation, agentIds, leaderAgentId: conversation.leaderAgentId === id ? agentIds[0] || null : conversation.leaderAgentId })
    }
    for (const workspace of this.workspaces()) {
      const defaultAgentIds = Array.isArray(workspace.defaultAgentIds) ? workspace.defaultAgentIds : []
      if (!defaultAgentIds.includes(id)) continue
      this.put('v9_workspaces', { ...workspace, defaultAgentIds: defaultAgentIds.filter(agentId => agentId !== id) })
    }
    this.db.prepare('DELETE FROM v9_agents WHERE id=?').run(id)
    this.db.prepare('DELETE FROM v9_checkpoints WHERE agent_id=?').run(id)
    this.db.prepare('DELETE FROM v9_approval_grants WHERE agent_id=?').run(id)
  }
  autoTitle(conversationId: string, firstMessage: string): Conversation {
    const conversation = this.conversation(conversationId)
    if (!conversation.titleAuto) return conversation
    const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60)
    const value = { ...conversation, name: title || conversation.name, titleAuto: false }
    this.put('v9_conversations', value); return value
  }
  putMessage(value: Message): void {
    this.db.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, value.conversationId, JSON.stringify(value))
    if (value.role === 'user' || value.role === 'activity' || ['completed', 'failed', 'interrupted'].includes(value.status)) {
      try {
        this.db.prepare('DELETE FROM v9_message_fts WHERE message_id=?').run(value.id)
        this.db.prepare('INSERT INTO v9_message_fts(message_id,conversation_id,author,text) VALUES(?,?,?,?)').run(value.id, value.conversationId, value.author, value.text)
      } catch { /* A busca LIKE continua disponível se FTS5 não existir. */ }
    }
  }
  /** Reinsere a mensagem para ela ficar no fim da ordem do histórico (rowid). */
  moveMessageToEnd(value: Message): void { this.db.prepare('DELETE FROM v9_messages WHERE id=?').run(value.id); this.putMessage(value) }
  putRun(value: Run): void { this.put('v9_runs', value) }
  putFileChange(value: FileChange): boolean {
    const result = this.db.prepare('INSERT OR IGNORE INTO v9_file_changes(id,run_id,tool_call_id,workspace_id,data) VALUES(?,?,?,?,?)').run(value.id, value.runId, value.toolCallId, value.workspaceId, JSON.stringify(value))
    return result.changes > 0
  }
  fileChanges(): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  fileChangesForRun(runId: string): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes WHERE run_id=? ORDER BY rowid').all(runId) as { data: string }[]).map(row => JSON.parse(row.data)) }
  fileChangesForWorkspace(workspaceId: string): FileChange[] { return (this.db.prepare('SELECT data FROM v9_file_changes WHERE workspace_id=? ORDER BY rowid DESC LIMIT 200').all(workspaceId) as { data: string }[]).map(row => JSON.parse(row.data)).reverse() }
  putCommandEvidence(value: CommandEvidence): CommandEvidence {
    this.db.prepare('INSERT OR IGNORE INTO v9_command_evidence(id,run_id,tool_call_id,conversation_id,data) VALUES(?,?,?,?,?)').run(value.id, value.runId, value.toolCallId, value.conversationId, JSON.stringify(value))
    const row = this.db.prepare('SELECT data FROM v9_command_evidence WHERE run_id=? AND tool_call_id=?').get(value.runId, value.toolCallId) as { data: string } | undefined
    if (!row) throw new Error('A evidência do comando não foi persistida.')
    return JSON.parse(row.data) as CommandEvidence
  }
  commandEvidenceForRun(runId: string): CommandEvidence[] { return (this.db.prepare('SELECT data FROM v9_command_evidence WHERE run_id=? ORDER BY rowid').all(runId) as { data: string }[]).map(row => JSON.parse(row.data)) }
  approvals(): Approval[] { return (this.db.prepare('SELECT data FROM v9_approvals ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  approval(id: string): Approval | undefined { const row = this.db.prepare('SELECT data FROM v9_approvals WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Approval : undefined }
  pendingApprovalForRun(runId: string): Approval | undefined { const row = this.db.prepare("SELECT data FROM v9_approvals WHERE run_id=? ORDER BY rowid DESC").all(runId) as { data: string }[]; return row.map(item => JSON.parse(item.data) as Approval).find(item => item.status === 'pending') }
  putApproval(value: Approval): void { this.db.prepare('INSERT INTO v9_approvals(id,run_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, value.runId, JSON.stringify(value)) }
  approvalGrants(agentId: string): ApprovalGrant[] { return (this.db.prepare('SELECT data FROM v9_approval_grants WHERE agent_id=? ORDER BY rowid DESC').all(agentId) as { data: string }[]).map(row => JSON.parse(row.data)) }
  approvalGrant(agentId: string, workspaceId: string, kind: ApprovalGrant['kind'], scopeKey: string): ApprovalGrant | undefined {
    const row = this.db.prepare('SELECT data FROM v9_approval_grants WHERE agent_id=? AND workspace_id=? AND kind=? AND scope_key=?').get(agentId, workspaceId, kind, scopeKey) as { data: string } | undefined
    return row ? JSON.parse(row.data) as ApprovalGrant : undefined
  }
  putApprovalGrant(value: ApprovalGrant): ApprovalGrant {
    this.db.prepare('INSERT OR IGNORE INTO v9_approval_grants(id,agent_id,workspace_id,kind,scope_key,data) VALUES(?,?,?,?,?,?)').run(value.id, value.agentId, value.workspaceId, value.kind, value.scopeKey, JSON.stringify(value))
    return this.approvalGrant(value.agentId, value.workspaceId, value.kind, value.scopeKey)!
  }
  deleteApprovalGrant(id: string, agentId: string): void { this.db.prepare('DELETE FROM v9_approval_grants WHERE id=? AND agent_id=?').run(id, agentId) }
  putDelegation(value: Delegation): void { this.db.prepare('INSERT INTO v9_delegations(id,idempotency_key,source_conversation_id,target_conversation_id,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, source_conversation_id=excluded.source_conversation_id, target_conversation_id=excluded.target_conversation_id').run(value.id, value.idempotencyKey, value.sourceConversationId, value.targetConversationId, JSON.stringify(value)) }
  repairDelegatedMessageLinks(): number {
    const candidates = this.delegations().flatMap(delegation => {
      const message = this.message(delegation.resultMessageId)
      const run = this.run(delegation.childRunId)
      if (!message || !run || message.runId !== null || message.role !== 'assistant') return []
      if (run.messageId !== message.id || run.conversationId !== delegation.targetConversationId || run.agentId !== delegation.recipientAgentId) return []
      if (message.conversationId !== delegation.targetConversationId || message.agentId !== delegation.recipientAgentId || (message.delegationId && message.delegationId !== delegation.id)) return []
      return [{ message, run }]
    })
    const byMessage = new Map<string, typeof candidates>()
    for (const candidate of candidates) byMessage.set(candidate.message.id, [...(byMessage.get(candidate.message.id) || []), candidate])
    const unambiguous = [...byMessage.values()].filter(matches => matches.length === 1).map(matches => matches[0])
    if (!unambiguous.length) return 0

    const backup = join(this.dataDirectory, `politron-v9.backup-delegated-links-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`)
    this.db.prepare('VACUUM INTO ?').run(backup)
    this.db.exec('BEGIN IMMEDIATE')
    let repaired = 0
    try {
      for (const { message, run } of unambiguous) {
        const current = this.message(message.id)
        if (!current || current.runId !== null || current.conversationId !== run.conversationId || current.agentId !== run.agentId) continue
        this.putMessage({ ...current, runId: run.id })
        repaired++
      }
      this.db.exec('COMMIT')
      return repaired
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  sessionBinding(key: string): SessionBinding | undefined {
    const row = this.db.prepare('SELECT key, thread_id, runtime, context_version, delivered_digests FROM v9_sessions WHERE key=?').get(key) as { key: string; thread_id: string; runtime: Agent['runtime'] | null; context_version: number; delivered_digests: string } | undefined
    if (!row) return undefined
    let deliveredDigests: Record<string, string> = {}
    try { const parsed: unknown = JSON.parse(row.delivered_digests); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) deliveredDigests = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string').slice(-40)) } catch { /* bindings antigos recebem replay de contexto */ }
    return { key: row.key, threadId: row.thread_id, runtime: row.runtime, contextVersion: row.context_version, deliveredDigests }
  }
  putSessionBinding(value: SessionBinding): void {
    const digests = Object.fromEntries(Object.entries(value.deliveredDigests).slice(-40))
    this.db.prepare('INSERT OR REPLACE INTO v9_sessions(key,thread_id,runtime,context_version,delivered_digests) VALUES(?,?,?,?,?)').run(value.key, value.threadId, value.runtime, value.contextVersion, JSON.stringify(digests))
  }
  deleteSessionBinding(key: string): void { this.db.prepare('DELETE FROM v9_sessions WHERE key=?').run(key) }
  binding(key: string): string | undefined { return this.sessionBinding(key)?.threadId }
  bind(key: string, threadId: string): void { this.putSessionBinding({ key, threadId, runtime: null, contextVersion: 0, deliveredDigests: {} }) }
  missions(limit = 200): Mission[] { return (this.db.prepare('SELECT data FROM v9_missions ORDER BY rowid DESC LIMIT ?').all(limit) as { data: string }[]).map(row => JSON.parse(row.data) as Mission).reverse() }
  mission(id: string): Mission | undefined { return this.get('v9_missions', id) }
  /** Missão mais recente ainda em andamento (ativa, em espera ou pausada) desta conversa. */
  openMission(conversationId: string): Mission | undefined {
    return (this.db.prepare('SELECT data FROM v9_missions WHERE conversation_id=? ORDER BY rowid DESC LIMIT 20').all(conversationId) as { data: string }[])
      .map(row => JSON.parse(row.data) as Mission).find(item => ['active', 'waiting', 'paused'].includes(item.status))
  }
  putMission(value: Mission): void { this.db.prepare('INSERT INTO v9_missions(id,conversation_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, conversation_id=excluded.conversation_id').run(value.id, value.conversationId, JSON.stringify(value)) }
  boardTeams(): BoardTeam[] { return this.all<BoardTeam>('v9_board_teams') }
  boardTeam(id: string): BoardTeam | undefined { return this.get<BoardTeam>('v9_board_teams', id) }
  putBoardTeam(value: BoardTeam): BoardTeam {
    const name = requiredText(value.name, 'Nome da equipe', 100)
    const description = typeof value.description === 'string' ? value.description.slice(0, 2000) : ''
    if (!Array.isArray(value.agentIds) || value.agentIds.length > 100 || !value.agentIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)) throw new Error('A lista de agentes da equipe é inválida.')
    const normalized = { ...value, name, description, agentIds: [...new Set(value.agentIds)] }
    const nameKey = name.toLocaleLowerCase('pt-BR')
    const collision = this.db.prepare('SELECT id FROM v9_board_teams WHERE name_key=? AND id<>?').get(nameKey, value.id) as { id: string } | undefined
    if (collision) throw new Error('Já existe uma equipe do board com esse nome.')
    this.db.prepare('INSERT INTO v9_board_teams(id,name_key,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,data=excluded.data').run(value.id, nameKey, JSON.stringify(normalized))
    return normalized
  }
  deleteBoardTeam(id: string): void {
    if (this.db.prepare('SELECT 1 FROM v9_board_tasks WHERE team_id=? LIMIT 1').get(id)) throw new Error('A equipe tem tarefas vinculadas e não pode ser excluída.')
    this.db.prepare('DELETE FROM v9_board_teams WHERE id=?').run(id)
  }
  boardTask(id: string): BoardTask | undefined { const task = this.get<BoardTask>('v9_board_tasks', id); return task ? { ...task, originConversationId: task.originConversationId ?? null } : undefined }
  boardTasks(filters: { teamId?: string; status?: BoardTask['status']; kind?: BoardTask['kind']; search?: string; limit?: number } = {}): BoardTask[] {
    const clauses: string[] = [], args: (string | number)[] = []
    if (filters.teamId) { clauses.push('team_id=?'); args.push(filters.teamId) }
    if (filters.status) { clauses.push('status=?'); args.push(filters.status) }
    if (filters.kind) { clauses.push("json_extract(data,'$.kind')=?"); args.push(filters.kind) }
    if (filters.search?.trim()) { clauses.push("(lower(json_extract(data,'$.title')) LIKE ? OR lower(json_extract(data,'$.description')) LIKE ?)"); args.push(`%${filters.search.trim().toLocaleLowerCase('en-US')}%`, `%${filters.search.trim().toLocaleLowerCase('en-US')}%`) }
    const limit = Math.max(1, Math.min(1000, Math.round(filters.limit ?? 500)))
    return (this.db.prepare(`SELECT data FROM v9_board_tasks${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY updated_at DESC,id LIMIT ?`).all(...args, limit) as { data: string }[]).map(({ data }) => { const task = JSON.parse(data) as BoardTask; return { ...task, originConversationId: task.originConversationId ?? null } })
  }
  putBoardTask(value: BoardTask): BoardTask {
    requiredText(value.title, 'Título', 160)
    if (!this.boardTeam(value.teamId)) throw new Error('A equipe da tarefa não existe mais.')
    if (!['general', 'code'].includes(value.kind) || !['backlog', 'ready', 'queued', 'doing', 'review', 'rework', 'integration', 'blocked', 'done', 'cancelled'].includes(value.status) || !Number.isInteger(value.reviewRound) || value.reviewRound < 0) throw new Error('Os dados da tarefa do board são inválidos.')
    if (typeof value.description !== 'string' || value.description.length > 20000 || typeof value.acceptanceCriteria !== 'string' || value.acceptanceCriteria.length > 10000) throw new Error('A descrição ou os critérios da tarefa excedem o limite.')
    this.db.prepare('INSERT INTO v9_board_tasks(id,team_id,status,updated_at,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id,status=excluded.status,updated_at=excluded.updated_at,data=excluded.data').run(value.id, value.teamId, value.status, value.updatedAt, JSON.stringify(value))
    return value
  }
  appendBoardEvent(value: BoardEvent): BoardEvent {
    if (!this.boardTask(value.taskId)) throw new Error('A tarefa do evento não existe mais.')
    if (!Number.isInteger(value.round) || value.round < 0 || typeof value.note !== 'string' || value.note.length > 2000) throw new Error('A atividade do board excede o limite permitido.')
    if (value.idempotencyKey) {
      const row = this.db.prepare('SELECT data FROM v9_board_events WHERE idempotency_key=?').get(value.idempotencyKey) as { data: string } | undefined
      if (row) {
        const existing = JSON.parse(row.data) as BoardEvent
        if (existing.taskId !== value.taskId) throw new Error('A chave idempotente já pertence a outra tarefa.')
        return existing
      }
    }
    this.db.prepare('INSERT INTO v9_board_events(id,task_id,created_at,idempotency_key,data) VALUES(?,?,?,?,?)').run(value.id, value.taskId, value.createdAt, value.idempotencyKey ?? null, JSON.stringify(value))
    return value
  }
  boardEvents(taskId: string, requestedLimit = 100): BoardEvent[] {
    const limit = Math.max(1, Math.min(100, Math.round(requestedLimit)))
    return (this.db.prepare('SELECT data FROM v9_board_events WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?').all(taskId, limit) as { data: string }[]).map(row => JSON.parse(row.data) as BoardEvent).reverse()
  }
  putBoardTaskMission(value: BoardTaskMission): BoardTaskMission {
    if (!this.boardTask(value.taskId) || !['worker', 'reviewer'].includes(value.role) || !Number.isInteger(value.round) || value.round < 0) throw new Error('O vínculo de missão da tarefa é inválido.')
    this.db.prepare('INSERT OR IGNORE INTO v9_board_task_missions(task_id,role,round,mission_id,conversation_id,created_at) VALUES(?,?,?,?,?,?)').run(value.taskId, value.role, value.round, value.missionId, value.conversationId, value.createdAt)
    const row = this.db.prepare('SELECT task_id AS taskId,role,round,mission_id AS missionId,conversation_id AS conversationId,created_at AS createdAt FROM v9_board_task_missions WHERE task_id=? AND role=? AND round=?').get(value.taskId, value.role, value.round) as BoardTaskMission | undefined
    if (!row) throw new Error('Não foi possível registrar o vínculo de missão.')
    if (row.missionId !== value.missionId || row.conversationId !== value.conversationId) throw new Error('Esta tarefa já possui uma missão para essa função e rodada.')
    return row
  }
  boardTaskMissions(taskId: string): BoardTaskMission[] { return this.db.prepare('SELECT task_id AS taskId,role,round,mission_id AS missionId,conversation_id AS conversationId,created_at AS createdAt FROM v9_board_task_missions WHERE task_id=? ORDER BY round,role').all(taskId) as unknown as BoardTaskMission[] }
  putBoardEvidence(value: BoardEvidence): BoardEvidence {
    if (!this.boardTask(value.taskId) || !Number.isInteger(value.round) || value.round < 0 || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160 || typeof value.summary !== 'string' || value.summary.length > 20000 || (value.reference !== undefined && (typeof value.reference !== 'string' || value.reference.length > 1000))) throw new Error('A evidência do board excede o limite permitido ou não é válida.')
    if (Number((this.db.prepare('SELECT COUNT(*) AS count FROM v9_board_evidence WHERE task_id=?').get(value.taskId) as { count: number }).count) >= 200) throw new Error('Esta tarefa atingiu o limite de evidências.')
    this.db.prepare('INSERT INTO v9_board_evidence(id,task_id,round,created_at,data) VALUES(?,?,?,?,?)').run(value.id, value.taskId, value.round, value.createdAt, JSON.stringify(value))
    return value
  }
  boardEvidence(taskId: string): BoardEvidence[] { return (this.db.prepare('SELECT data FROM v9_board_evidence WHERE task_id=? ORDER BY round,created_at,id').all(taskId) as { data: string }[]).map(row => JSON.parse(row.data) as BoardEvidence) }
  routines(): Routine[] { return this.all<Routine>('v9_routines') }
  routine(id: string): Routine { const value = this.get<Routine>('v9_routines', id); if (!value) throw new Error('Rotina não encontrada.'); return value }
  putRoutine(value: Routine): void { this.put('v9_routines', value) }
  deleteRoutine(id: string): void { this.db.prepare('DELETE FROM v9_routines WHERE id=?').run(id) }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  /** Uma vez por banco: agentes em "perguntar" passam ao modo automático com guarda-corpos, e o Chief passa a existir. */
  applyAutonomyDefaults(): void {
    if (this.db.prepare("SELECT 1 FROM v9_meta WHERE key='autonomy_defaults_v1'").get()) return
    for (const agent of this.agents().filter(item => item.approvalMode === 'ask')) this.put('v9_agents', { ...agent, approvalMode: 'automatic' })
    if (!this.agents().some(agent => agent.role === 'chief')) {
      this.saveAgent({ name: 'Chief', alias: 'chief', role: 'chief', description: 'Coordena objetivos, equipes e rotinas.', color: '#f0a05b', pitsHeadAccessory: 'crown',
        instructions: 'Você é o Chief: o principal ponto de contato do usuário. Transforme pedidos em missões, monte e coordene equipes de Boos, delegue, acompanhe e valide até entregar resultados verificáveis. Só procure o usuário quando precisar de uma decisão real.',
        canWrite: true, computerUse: true, approvalMode: 'automatic' })
    }
    this.db.prepare("INSERT INTO v9_meta(key,value) VALUES('autonomy_defaults_v1','1')").run()
  }
  close(): void { this.db.close() }
}
