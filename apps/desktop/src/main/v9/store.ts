import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Agent, Conversation, Delegation, Message, Run, Snapshot } from '../../shared/v9'

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
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES v9_conversations(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_message_context ON v9_messages(conversation_id);
      CREATE TABLE IF NOT EXISTS v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS v9_delegation_source ON v9_delegations(source_conversation_id);
      CREATE INDEX IF NOT EXISTS v9_delegation_target ON v9_delegations(target_conversation_id);
      INSERT INTO v9_meta VALUES ('schema','2') ON CONFLICT(key) DO UPDATE SET value='2';`)
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
  }
  private all<T>(table: string): T[] { return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(row => JSON.parse(row.data) as T) }
  private get<T>(table: string, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as T : undefined }
  private put(table: string, value: { id: string }): void { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id, JSON.stringify(value)) }
  agents(): Agent[] { return this.all('v9_agents') }
  conversations(): Conversation[] { return this.all('v9_conversations') }
  runs(): Run[] { return this.all('v9_runs') }
  delegations(): Delegation[] { return (this.db.prepare('SELECT data FROM v9_delegations ORDER BY rowid').all() as { data: string }[]).map(row => JSON.parse(row.data)) }
  delegation(id: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  delegationByKey(key: string): Delegation | undefined { const row = this.db.prepare('SELECT data FROM v9_delegations WHERE idempotency_key=?').get(key) as { data: string } | undefined; return row ? JSON.parse(row.data) as Delegation : undefined }
  agent(id: string): Agent { const value = this.get<Agent>('v9_agents', id); if (!value) throw new Error('Agente não encontrado.'); return value }
  conversation(id: string): Conversation { const value = this.get<Conversation>('v9_conversations', id); if (!value) throw new Error('Conversa não encontrada.'); return value }
  message(id: string): Message | undefined { return this.get('v9_messages', id) }
  history(id: string): Message[] {
    return (this.db.prepare('SELECT data FROM (SELECT rowid,data FROM v9_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 500) ORDER BY rowid').all(id) as { data: string }[]).map(row => JSON.parse(row.data))
  }
  snapshot(): Snapshot { return { agents: this.agents(), conversations: this.conversations(), messages: [], runs: this.runs().slice(-100) } }
  saveAgent(input: Partial<Agent>): Agent {
    const previous = input.id ? this.agent(input.id) : undefined
    const name = requiredText(input.name, 'Nome', 80)
    const alias = requiredText(input.alias || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), 'Menção', 80)
    if (!/^[\p{L}\p{N}_-]+$/u.test(alias)) throw new Error('Use letras, números, hífen ou sublinhado na menção.')
    if (this.agents().some(agent => agent.id !== input.id && agent.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Essa menção já pertence a outro agente.')
    if (input.runtime && input.runtime !== 'codex') throw new Error('Este fluxo ainda suporta somente o motor Codex.')
    const value: Agent = { id: previous?.id || randomUUID(), name, alias, description: String(input.description || '').slice(0, 500), instructions: requiredText(input.instructions, 'Instruções', 20000), runtime: 'codex', model: String(input.model || '').slice(0, 150), color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color! : '#6366f1', avatar: typeof input.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(input.avatar) && input.avatar.length < 2_000_000 ? input.avatar : '', canWrite: input.canWrite === true, computerUse: input.computerUse === true, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_agents', value); return value
  }
  saveConversation(input: Partial<Conversation>): Conversation {
    const previous = input.id ? this.conversation(input.id) : undefined
    const kind = input.kind || previous?.kind || 'group'
    if (kind !== 'direct' && kind !== 'group') throw new Error('Tipo de conversa inválido.')
    const agentIds = [...new Set(input.agentIds || previous?.agentIds || [])]
    if (!agentIds.length || agentIds.length > 10 || (kind === 'direct' && agentIds.length !== 1)) throw new Error('Selecione de um a dez agentes; conversas individuais têm um agente.')
    agentIds.forEach(id => this.agent(id))
    const directory = canonicalDirectory(input.directory === undefined ? previous?.directory : input.directory)
    const value: Conversation = { id: previous?.id || randomUUID(), kind, name: requiredText(input.name, 'Nome', 100), agentIds, directory, revision: (previous?.revision || 0) + 1, archived: input.archived === true, createdAt: previous?.createdAt || new Date().toISOString() }
    this.put('v9_conversations', value); return value
  }
  putMessage(value: Message): void { this.db.prepare('INSERT INTO v9_messages(id,conversation_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id, value.conversationId, JSON.stringify(value)) }
  putRun(value: Run): void { this.put('v9_runs', value) }
  putDelegation(value: Delegation): void { this.db.prepare('INSERT INTO v9_delegations(id,idempotency_key,source_conversation_id,target_conversation_id,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, source_conversation_id=excluded.source_conversation_id, target_conversation_id=excluded.target_conversation_id').run(value.id, value.idempotencyKey, value.sourceConversationId, value.targetConversationId, JSON.stringify(value)) }
  binding(key: string): string | undefined { return (this.db.prepare('SELECT thread_id FROM v9_sessions WHERE key=?').get(key) as { thread_id: string } | undefined)?.thread_id }
  bind(key: string, threadId: string): void { this.db.prepare('INSERT OR REPLACE INTO v9_sessions VALUES(?,?)').run(key, threadId) }
  close(): void { this.db.close() }
}
