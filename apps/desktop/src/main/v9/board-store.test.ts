import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { BoardEvidence, BoardEvent, BoardTask, BoardTaskMission, BoardTeam } from '../../shared/v9'
import { SCHEMA_VERSION, WorkspaceStore } from './store'

const directories: string[] = []
const openStores = new Set<WorkspaceStore>()
function openStore(directory: string) { const store = new WorkspaceStore(directory); openStores.add(store); return store }
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'politron-board-store-'))
  directories.push(directory)
  return { directory, store: openStore(directory) }
}
afterEach(() => {
  for (const store of openStores) store.close()
  openStores.clear()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

const now = '2026-10-29T12:00:00.000Z'
const team: BoardTeam = { id: 'team-dev', name: 'Desenvolvimento', description: 'Produto e engenharia.', agentIds: ['worker', 'reviewer'], createdAt: now, updatedAt: now }
const task: BoardTask = { id: 'task-1', title: 'Corrigir login', description: 'Corrigir o login.', acceptanceCriteria: 'Login funciona.', kind: 'code', teamId: team.id, assigneeAgentId: 'worker', reviewerAgentId: 'reviewer', source: 'user', originConversationId: null, status: 'ready', workspaceId: 'workspace-1', executionWorkspaceId: null, branch: null, currentMissionId: null, currentReviewMissionId: null, reviewRound: 0, reviewDecision: null, reviewFeedback: null, blockedReason: null, result: null, integrationEvidence: null, createdAt: now, updatedAt: now, startedAt: null, completedAt: null }
const event = (id: string, idempotencyKey?: string): BoardEvent => ({ id, taskId: task.id, actorType: 'user', actorId: null, kind: 'assigned', note: 'Responsável e revisor definidos.', round: 0, ...(idempotencyKey ? { idempotencyKey } : {}), createdAt: now })

describe('WorkspaceStore para o board da empresa', () => {
  it('persiste equipe, tarefa, vínculo de missão, evidência e atividade após reabrir o banco', () => {
    const { directory, store } = fixture()
    store.putBoardTeam(team)
    store.putBoardTask(task)
    const link: BoardTaskMission = { taskId: task.id, role: 'worker', round: 0, missionId: 'mission-1', conversationId: 'conversation-1', createdAt: now }
    const evidence: BoardEvidence = { id: 'evidence-1', taskId: task.id, round: 0, kind: 'test', label: 'Suíte focada', summary: '12 testes aprovados.', reference: 'run-1', createdAt: now }
    store.putBoardTaskMission(link)
    store.putBoardEvidence(evidence)
    store.appendBoardEvent(event('event-1'))

    const reopened = openStore(directory)
    expect(reopened.boardTeams()).toEqual([team])
    expect(reopened.boardTask(task.id)).toEqual(task)
    expect(reopened.boardTaskMissions(task.id)).toEqual([link])
    expect(reopened.boardEvidence(task.id)).toEqual([evidence])
    expect(reopened.boardEvents(task.id)).toEqual([event('event-1')])
  })

  it('deduplica eventos pelo idempotency key e recusa dois vínculos de mesma função na mesma rodada', () => {
    const { store } = fixture()
    store.putBoardTeam(team)
    store.putBoardTask(task)
    expect(store.appendBoardEvent(event('event-1', 'assign:task-1:0'))).toEqual(event('event-1', 'assign:task-1:0'))
    expect(store.appendBoardEvent({ ...event('event-2', 'assign:task-1:0'), note: 'Duplicado.' })).toEqual(event('event-1', 'assign:task-1:0'))
    expect(store.boardEvents(task.id)).toHaveLength(1)

    store.putBoardTaskMission({ taskId: task.id, role: 'reviewer', round: 0, missionId: 'review-1', conversationId: 'review-chat-1', createdAt: now })
    expect(() => store.putBoardTaskMission({ taskId: task.id, role: 'reviewer', round: 0, missionId: 'review-2', conversationId: 'review-chat-2', createdAt: now })).toThrow()
  })

  it('limita o histórico de atividade e rejeita conteúdo de evidência acima do limite', () => {
    const { store } = fixture()
    store.putBoardTeam(team)
    store.putBoardTask(task)
    for (let index = 0; index < 105; index++) store.appendBoardEvent({ ...event(`event-${index}`), createdAt: new Date(Date.parse(now) + index).toISOString() })
    expect(store.boardEvents(task.id)).toHaveLength(100)
    expect(store.boardEvents(task.id)[0].id).toBe('event-5')
    expect(() => store.putBoardEvidence({ id: 'too-large', taskId: task.id, round: 0, kind: 'note', label: 'Nota', summary: 'x'.repeat(20_001), createdAt: now })).toThrow(/limite/i)
  })

  it('migra schema 10 para 11 e cria um backup antes de abrir as tabelas do board', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-board-schema-10-'))
    directories.push(directory)
    const database = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    database.exec("CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO v9_meta VALUES ('schema','10');")
    database.close()
    expect(SCHEMA_VERSION).toBe(11)
    const store = openStore(directory)
    expect(store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get()).toEqual({ value: '11' })
    expect(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v9_board_teams'").get()).toEqual({ name: 'v9_board_teams' })
    expect(readdirSync(directory).some(file => file.startsWith('politron-v9.backup-schema10-'))).toBe(true)
  })
})
