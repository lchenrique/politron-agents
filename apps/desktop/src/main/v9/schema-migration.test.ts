import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSISTANT, WorkspaceStore } from './store'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })

function seedSchema5WorkspaceWithChiefLocked(): string {
  const directory = mkdtempSync(join(tmpdir(), 'politron-schema-migration-'))
  directories.push(directory)
  const db = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
  db.exec(`
    CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE v9_workspaces (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    INSERT INTO v9_meta VALUES ('schema', '5');
  `)
  const workspace = {
    id: 'ws-livre', name: 'Livre', kind: 'free', path: join(directory, 'workspaces', 'ws-livre'),
    branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0,
    permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit', computerUse: 'deny' },
    archived: false, createdAt: '2026-10-01T00:00:00.000Z',
  }
  db.prepare('INSERT INTO v9_workspaces(id, data) VALUES(?, ?)').run(workspace.id, JSON.stringify(workspace))
  db.close()
  return directory
}

describe('migração de esquema 5 para 6', () => {
  it('libera as quatro permissões do Chief em workspaces que já existiam, sem mexer em filesWrite/computerUse', () => {
    const directory = seedSchema5WorkspaceWithChiefLocked()
    const store = new WorkspaceStore(directory)
    try {
      const workspace = store.workspace('ws-livre')
      expect(workspace.permissions).toEqual({ chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true, filesWrite: 'inherit', computerUse: 'deny' })
    } finally { store.close() }
  })

  it('workspaces criados depois da migração já nascem com o Chief liberado', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-schema-migration-fresh-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    try {
      const workspace = store.saveWorkspace({ name: 'Novo' })
      expect(workspace.permissions).toMatchObject({ chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true })
    } finally { store.close() }
  })
})

describe('migração direta do esquema 7 para 11', () => {
  it('aplica ligações de sessão e evidências de comando na mesma abertura', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-schema-7-9-'))
    directories.push(directory)
    const db = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    db.exec("CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL); INSERT INTO v9_meta VALUES ('schema','7');")
    db.close()
    const store = new WorkspaceStore(directory)
    try {
      expect(store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get()).toEqual({ value: '11' })
      expect((store.db.prepare('PRAGMA table_info(v9_sessions)').all() as { name: string }[]).map(column => column.name)).toEqual(expect.arrayContaining(['runtime', 'context_version', 'delivered_digests']))
      expect(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v9_command_evidence'").get()).toEqual({ name: 'v9_command_evidence' })
    } finally { store.close() }
  })
})


describe('modelo padrão econômico do Assistente', () => {
  it('seleciona GPT-6 Luna sem impor o modelo a outros Boos', () => {
    expect(ASSISTANT.runtime).toBe('codex')
    expect(ASSISTANT.model).toBe('gpt-6-luna')
  })
})
