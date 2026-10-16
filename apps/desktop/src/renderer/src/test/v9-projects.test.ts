import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {} }))

import { WorkspaceService } from '../../../main/v9/workspace'
import { WorkspaceStore } from '../../../main/v9/store'
import { ASSISTANT_ID, type Agent } from '../../../shared/v9'

type Thread = { id: string; agent: Agent; directory: string; projectInstructions?: string; resumedFrom?: string }

class FakeRuntime extends EventEmitter {
  threads: Thread[] = []
  turns: Array<{ threadId: string; text: string }> = []
  private current = { threadId: '', turnId: '' }
  private turnCounter = 0
  async thread(agent: Agent, directory: string, _tools: unknown, threadId?: string, projectInstructions?: string) {
    const id = threadId || `thread-${this.threads.length + 1}`
    this.threads.push({ id, agent, directory, projectInstructions, resumedFrom: threadId })
    this.current.threadId = id
    return id
  }
  async request(_method: string, params: { threadId: string; input: Array<{ text: string }> }) {
    const threadId = params.threadId
    const turnId = `turn-${++this.turnCounter}`
    const text = params.input[0].text
    this.turns.push({ threadId, text })
    setTimeout(() => {
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resposta de ${threadId} para: ${text}` } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
    })
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  respond() {}
  async interrupt() {}
  async models() { return [] }
  close() {}
}

const dirs: string[] = []
const services: WorkspaceService[] = []
const tempDirectory = () => { const path = mkdtempSync(join(tmpdir(), 'politron-v9-projects-')); dirs.push(path); return path }
const open = (directory: string, runtime = new FakeRuntime()) => { const service = new WorkspaceService(directory, runtime as any); services.push(service); return { service, runtime } }
const close = (service: WorkspaceService) => { service.dispose(); services.splice(services.indexOf(service), 1) }
afterEach(() => {
  for (const service of services.splice(0)) { try { service.dispose() } catch { /* already closed */ } }
  for (const path of dirs.splice(0)) { try { rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) } catch { /* Windows may hold the file briefly */ } }
})

describe('Assistente padrão e conversas por projeto V9', () => {
  it('inicia e continua uma conversa do Assistente em um projeto sem bot nem grupo cadastrados', async () => {
    const { service, runtime } = open(tempDirectory())
    expect(service.snapshot().agents).toEqual([])
    const project = service.saveProject({ name: 'Site' })
    expect(project).toMatchObject({ name: 'Site', directory: null, defaultAgentIds: [] })
    const conversation = service.saveConversation({ projectId: project.id })
    expect(conversation).toMatchObject({ projectId: project.id, agentIds: [], kind: 'direct', name: 'Nova conversa', titleAuto: true })

    await service.send(conversation.id, 'Primeira pergunta')
    await service.send(conversation.id, 'Segunda pergunta')

    const history = service.history(conversation.id)
    expect(history.map(message => [message.role, message.status])).toEqual([['user', 'completed'], ['assistant', 'completed'], ['user', 'completed'], ['assistant', 'completed']])
    expect(history[1]).toMatchObject({ agentId: ASSISTANT_ID, author: 'Assistente' })
    expect(history[1].text).toContain('Primeira pergunta')
    expect(history[3].text).toContain('Segunda pergunta')
    expect(new Set(runtime.threads.map(thread => thread.agent.id))).toEqual(new Set([ASSISTANT_ID]))
    expect(runtime.threads[1].resumedFrom).toBe(runtime.threads[0].id)
    expect(service.snapshot().conversations[0].name).toBe('Primeira pergunta')
    expect(service.snapshot().agents).toEqual([])
    expect(service.store.runs().every(run => run.agentId === ASSISTANT_ID && run.status === 'completed')).toBe(true)
  })

  it('funciona também fora de projetos, sem pasta, bot ou grupo', async () => {
    const { service } = open(tempDirectory())
    const conversation = service.saveConversation({})
    expect(conversation).toMatchObject({ projectId: null, agentIds: [], directory: null })
    await service.send(conversation.id, 'Olá')
    expect(service.history(conversation.id)[1]).toMatchObject({ role: 'assistant', status: 'completed', agentId: ASSISTANT_ID })
  })

  it('mantém duas conversas do mesmo projeto com sessões e históricos independentes e as retoma', async () => {
    const { service, runtime } = open(tempDirectory())
    const project = service.saveProject({ name: 'App', instructions: 'Use sempre TypeScript.' })
    const first = service.saveConversation({ projectId: project.id, name: 'Planejamento' })
    const second = service.saveConversation({ projectId: project.id, name: 'Login' })

    await service.send(first.id, 'assunto-A-1')
    await service.send(second.id, 'assunto-B-1')
    await service.send(first.id, 'assunto-A-2')
    await service.send(second.id, 'assunto-B-2')

    const textsOf = (id: string) => service.history(id).filter(message => message.role === 'user').map(message => message.text)
    expect(textsOf(first.id)).toEqual(['assunto-A-1', 'assunto-A-2'])
    expect(textsOf(second.id)).toEqual(['assunto-B-1', 'assunto-B-2'])
    expect(service.history(first.id).some(message => message.text.includes('assunto-B'))).toBe(false)
    expect(service.history(second.id).some(message => message.text.includes('assunto-A'))).toBe(false)

    const sessionsOf = (needle: string) => new Set(runtime.turns.filter(turn => turn.text.includes(needle)).map(turn => turn.threadId))
    const [sessionA] = [...sessionsOf('assunto-A')]
    const [sessionB] = [...sessionsOf('assunto-B')]
    expect(sessionsOf('assunto-A').size).toBe(1)
    expect(sessionsOf('assunto-B').size).toBe(1)
    expect(sessionA).not.toBe(sessionB)
    expect(runtime.threads.every(thread => thread.projectInstructions === 'Use sempre TypeScript.')).toBe(true)
    expect(service.snapshot().conversations.filter(item => item.projectId === project.id).map(item => item.name).sort()).toEqual(['Login', 'Planejamento'])
  })

  it('persiste projetos, conversas, histórico e sessões ao reiniciar e retoma a mesma sessão', async () => {
    const directory = tempDirectory()
    const first = open(directory)
    const project = first.service.saveProject({ name: 'Persistente' })
    const a = first.service.saveConversation({ projectId: project.id, name: 'A' })
    const b = first.service.saveConversation({ projectId: project.id, name: 'B' })
    await first.service.send(a.id, 'antes-A')
    await first.service.send(b.id, 'antes-B')
    const sessionA = first.runtime.turns.find(turn => turn.text === 'antes-A')!.threadId
    const sessionB = first.runtime.turns.find(turn => turn.text === 'antes-B')!.threadId
    close(first.service)

    const second = open(directory)
    const snapshot = second.service.snapshot()
    expect(snapshot.projects.map(item => item.name)).toEqual(['Persistente'])
    expect(snapshot.conversations.map(item => [item.name, item.projectId])).toEqual([['A', project.id], ['B', project.id]])
    expect(second.service.history(a.id).map(message => message.text.includes('antes-A') || message.role === 'user')).toEqual([true, true])
    await second.service.send(a.id, 'depois-A')
    await second.service.send(b.id, 'depois-B')
    expect(second.runtime.turns.find(turn => turn.text === 'depois-A')!.threadId).toBe(sessionA)
    expect(second.runtime.turns.find(turn => turn.text === 'depois-B')!.threadId).toBe(sessionB)
    expect(second.service.history(a.id).filter(message => message.role === 'user').map(message => message.text)).toEqual(['antes-A', 'depois-A'])
  })

  it('herda pasta e equipe padrão do projeto sem alterar conversas existentes quando o projeto muda', () => {
    const { service } = open(tempDirectory())
    const folder = tempDirectory()
    const agent = service.saveAgent({ name: 'Revisora', alias: 'revisora', instructions: 'Revise.' })
    const project = service.saveProject({ name: 'Equipe', directory: folder, defaultAgentIds: [agent.id] })
    const inherited = service.saveConversation({ projectId: project.id })
    expect(inherited).toMatchObject({ agentIds: [agent.id], directory: project.directory, kind: 'direct' })
    const assistantOnly = service.saveConversation({ projectId: project.id, agentIds: [] })
    expect(assistantOnly.agentIds).toEqual([])
    service.saveProject({ id: project.id, defaultAgentIds: [] })
    expect(service.store.conversation(inherited.id).agentIds).toEqual([agent.id])
    expect(service.saveConversation({ projectId: project.id }).agentIds).toEqual([])
  })

  it('valida projeto, Assistente reservado e imutabilidade do projeto da conversa', () => {
    const { service } = open(tempDirectory())
    expect(() => service.saveProject({ name: '  ' })).toThrow()
    expect(() => service.saveConversation({ projectId: 'inexistente' })).toThrow('Projeto não encontrado')
    expect(() => service.saveAgent({ name: 'Outro', alias: 'assistente', instructions: 'x' })).toThrow('menção')
    expect(() => service.saveConversation({ agentIds: [ASSISTANT_ID] })).toThrow()
    const one = service.saveProject({ name: 'Um' })
    const two = service.saveProject({ name: 'Dois' })
    const conversation = service.saveConversation({ projectId: one.id })
    expect(() => service.saveConversation({ id: conversation.id, projectId: two.id })).toThrow('não muda de projeto')
    service.saveProject({ id: one.id, archived: true })
    expect(() => service.saveConversation({ projectId: one.id })).toThrow('arquivado')
  })

  it('renomear a conversa não troca a sessão; trocar a pasta cria nova sessão', async () => {
    const { service, runtime } = open(tempDirectory())
    const conversation = service.saveConversation({ name: 'Original' })
    await service.send(conversation.id, 'um')
    service.saveConversation({ id: conversation.id, name: 'Renomeada' })
    await service.send(conversation.id, 'dois')
    const [one, two] = runtime.turns.map(turn => turn.threadId)
    expect(two).toBe(one)
    service.saveConversation({ id: conversation.id, directory: tempDirectory() })
    await service.send(conversation.id, 'três')
    expect(runtime.turns[2].threadId).not.toBe(one)
  })

  it('isola a sessão quando as instruções do projeto mudam e as conversas entre si', async () => {
    const { service, runtime } = open(tempDirectory())
    const project = service.saveProject({ name: 'Contexto', instructions: 'Contexto v1' })
    const first = service.saveConversation({ projectId: project.id })
    const second = service.saveConversation({ projectId: project.id })
    await service.send(first.id, 'conversa-1 antes')
    await service.send(second.id, 'conversa-2')
    service.saveProject({ id: project.id, instructions: 'Contexto v2' })
    await service.send(first.id, 'conversa-1 depois')

    const firstThreads = runtime.threads.filter(thread => thread.agent.id === ASSISTANT_ID)
    expect(firstThreads.map(thread => thread.projectInstructions)).toEqual(['Contexto v1', 'Contexto v1', 'Contexto v2'])
    expect(firstThreads[0].id).not.toBe(firstThreads[1].id)
    expect(firstThreads[2].id).not.toBe(firstThreads[0].id)
    expect(runtime.turns[0].threadId).toBe(firstThreads[0].id)
    expect(runtime.turns[1].threadId).toBe(firstThreads[1].id)
    expect(runtime.turns[2].threadId).toBe(firstThreads[2].id)
    expect(service.history(first.id).some(message => message.text.includes('conversa-2'))).toBe(false)
  })
})

describe('migração do SQLite V9', () => {
  it('cria backup antes de subir do esquema 2 e preserva conversas e mensagens antigas', () => {
    const directory = tempDirectory()
    const legacy = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    legacy.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','2');`)
    const agent = { id: 'agent-1', name: 'Antigo', alias: 'antigo', description: '', instructions: 'x', runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, revision: 1, createdAt: '2026-10-01T00:00:00.000Z' }
    const conversation = { id: 'conv-1', kind: 'group', name: 'Grupo antigo', agentIds: ['agent-1'], directory: null, revision: 3, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }
    const message = { id: 'msg-1', conversationId: 'conv-1', agentId: null, author: 'Você', role: 'user', text: 'mensagem antiga', status: 'completed', runId: null, createdAt: '2026-10-01T00:00:00.000Z' }
    legacy.prepare('INSERT INTO v9_agents VALUES (?,?)').run(agent.id, JSON.stringify(agent))
    legacy.prepare('INSERT INTO v9_conversations VALUES (?,?)').run(conversation.id, JSON.stringify(conversation))
    legacy.prepare('INSERT INTO v9_messages VALUES (?,?,?)').run(message.id, message.conversationId, JSON.stringify(message))
    legacy.prepare('INSERT INTO v9_sessions VALUES (?,?)').run('conv-1:agent-1:r1:m:c3', 'thread-legado')
    legacy.close()

    const store = new WorkspaceStore(directory)
    const backups = readdirSync(directory).filter(name => name.startsWith('politron-v9.backup-schema2-'))
    expect(backups).toHaveLength(1)
    const backup = new DatabaseSync(join(directory, backups[0]), { readOnly: true })
    expect((backup.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe('2')
    expect(backup.prepare("SELECT name FROM sqlite_master WHERE name='v9_projects'").get()).toBeUndefined()
    expect((backup.prepare('SELECT COUNT(*) AS total FROM v9_messages').get() as { total: number }).total).toBe(1)
    backup.close()

    expect((store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe('3')
    expect(store.agents()).toHaveLength(1)
    expect(store.conversation('conv-1')).toMatchObject({ name: 'Grupo antigo', kind: 'group', agentIds: ['agent-1'], revision: 3, projectId: null, titleAuto: false })
    expect(store.history('conv-1')[0].text).toBe('mensagem antiga')
    expect(store.binding('conv-1:agent-1:r1:m:c3')).toBe('thread-legado')
    store.close()

    new WorkspaceStore(directory).close()
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(1)
    expect(existsSync(join(directory, 'politron-v9.sqlite'))).toBe(true)
  })

  it('não cria backup em instalação nova', () => {
    const directory = tempDirectory()
    new WorkspaceStore(directory).close()
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(0)
  })

  it('recusa esquema mais novo sem rebaixar nem alterar o banco', () => {
    const directory = tempDirectory()
    const future = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    future.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','99');`)
    future.close()

    expect(() => new WorkspaceStore(directory)).toThrow('mais novo que o suportado')
    const reopened = new DatabaseSync(join(directory, 'politron-v9.sqlite'), { readOnly: true })
    expect((reopened.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe('99')
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(0)
    reopened.close()
  })
})
