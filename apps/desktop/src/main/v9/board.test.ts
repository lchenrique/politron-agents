import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mission, StartMissionInput, Workspace } from '../../shared/v9'
import { WorkspaceStore } from './store'
import { BoardService } from './board'

const directories: string[] = []
const services: BoardService[] = []
const stores: WorkspaceStore[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'politron-board-service-'))
  directories.push(root)
  const store = new WorkspaceStore(root); stores.push(store)
  const worker = store.saveAgent({ name: 'Desenvolvedor', alias: `worker-${Date.now()}`, instructions: 'Implemente.' })
  const reviewer = store.saveAgent({ name: 'Revisor', alias: `reviewer-${Date.now()}`, instructions: 'Revise.' })
  const outsider = store.saveAgent({ name: 'Externo', alias: `outsider-${Date.now()}`, instructions: 'Fora.' })
  const source = store.saveWorkspace({ name: 'Produto', path: root })
  const team = { id: 'engineering', name: 'Engenharia', description: '', agentIds: [worker.id, reviewer.id], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  store.putBoardTeam(team)
  let worktreeCalls = 0
  let readonlyConversations: string[] = []
  const stoppedConversations: string[] = []
  const host = {
    store,
    async createWorktree(sourceWorkspaceId: string, branch: string): Promise<Workspace> {
      worktreeCalls++
      const parent = store.workspace(sourceWorkspaceId)
      const path = join(root, `worktree-${worktreeCalls}`); mkdirSync(path, { recursive: true })
      return store.saveWorkspace({ name: branch, path, kind: 'worktree', parentWorkspaceId: parent.id, branch, baseBranch: parent.branch })
    },
    setReviewerConversation(conversationId: string, enabled: boolean) {
      readonlyConversations = enabled ? [...readonlyConversations, conversationId] : readonlyConversations.filter(id => id !== conversationId)
    },
    async stopMission(conversationId: string) {
      stoppedConversations.push(conversationId)
      const mission = store.openMission(conversationId)
      if (mission) store.putMission({ ...mission, status: 'cancelled', result: 'Cancelada pelo board.' })
    },
    startMission(input: StartMissionInput, missionId: string): Mission {
      const conversation = store.conversation(input.conversationId!)
      const now = new Date().toISOString()
      const mission: Mission = { id: missionId, title: input.title || input.goal.slice(0, 80), goal: input.goal, workspaceId: conversation.workspaceId, conversationId: conversation.id, ownerAgentId: input.agentId!, routineId: null, model: null, status: 'active', steps: [], updates: [], question: null, options: [], result: null, turns: 0, maxTurns: 8, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: now, updatedAt: now, completedAt: null }
      store.putMission(mission)
      return mission
    },
    emitChanged() {},
  }
  const service = new BoardService(host)
  services.push(service)
  return { service, store, worker, reviewer, outsider, source, team, stoppedConversations, get worktreeCalls() { return worktreeCalls }, get readonlyConversations() { return readonlyConversations } }
}
async function finishMission(f: ReturnType<typeof fixture>, mission: Mission, result: string) {
  const completed = { ...mission, status: 'completed' as const, result, completedAt: new Date().toISOString() }
  f.store.putMission(completed)
  await f.service.onMissionUpdated(completed)
}

describe('BoardService', () => {
  it('requires team membership, active distinct worker and reviewer, and source workspace for code', async () => {
    const f = fixture()
    const code = f.service.createTask({ title: 'Ajustar login', description: 'Corrigir login', acceptanceCriteria: 'Login funciona', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    await expect(f.service.assignTask(code.id, f.outsider.id, f.reviewer.id)).rejects.toThrow(/equipe/i)
    await expect(f.service.assignTask(code.id, f.worker.id, f.worker.id)).rejects.toThrow(/diferentes/i)
    expect(() => f.service.createTask({ title: 'Sem projeto', description: 'x', acceptanceCriteria: 'y', kind: 'code', teamId: f.team.id })).toThrow(/workspace/i)
    const retired = f.store.saveAgent({ ...f.reviewer, temporary: true, temporaryStatus: 'retired' })
    await expect(f.service.assignTask(code.id, f.worker.id, retired.id)).rejects.toThrow(/ativo/i)
  })

  it('creates one isolated worktree and mission for an assigned code task, even on repeated start', async () => {
    const f = fixture()
    const task = f.service.createTask({ title: 'Ajustar login', description: 'Corrigir login', acceptanceCriteria: 'Login funciona', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    const assigned = await f.service.assignTask(task.id, f.worker.id, f.reviewer.id)
    const missionId = assigned.currentMissionId
    expect(assigned.status).toBe('doing')
    expect(assigned.executionWorkspaceId).not.toBeNull()
    expect(assigned.branch).toContain('board/')
    expect(f.worktreeCalls).toBe(1)
    await f.service.startTask(task.id)
    expect(f.worktreeCalls).toBe(1)
    expect(f.store.boardTaskMissions(task.id)).toHaveLength(1)
    expect(f.store.mission(missionId!)).toBeDefined()
  })

  it('starts a distinct reviewer read-only on the same worktree, then reuses the worker workspace for rework', async () => {
    const f = fixture()
    const task = f.service.createTask({ title: 'Ajustar login', description: 'Corrigir login', acceptanceCriteria: 'Login funciona', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    const working = await f.service.assignTask(task.id, f.worker.id, f.reviewer.id)
    const originalWorkspace = working.executionWorkspaceId
    const workerMission = f.store.mission(working.currentMissionId!)!
    await finishMission(f, workerMission, 'Implementado')
    const reviewing = f.store.boardTask(task.id)!
    expect(reviewing.status).toBe('review')
    expect(reviewing.currentReviewMissionId).not.toBe(working.currentMissionId)
    expect(f.store.mission(reviewing.currentReviewMissionId!)?.workspaceId).toBe(originalWorkspace)
    const reviewerLink = f.store.boardTaskMissions(task.id).find(link => link.role === 'reviewer')!
    expect(f.readonlyConversations).toContain(reviewerLink.conversationId)

    const reviewerMission = f.store.mission(reviewing.currentReviewMissionId!)!
    await finishMission(f, reviewerMission, 'Ajustar tratamento de erro.')
    await f.service.requestChanges(task.id, 'Validar o erro de credenciais expiradas.')
    const rework = f.store.boardTask(task.id)!
    expect(rework.status).toBe('doing')
    expect(rework.reviewRound).toBe(1)
    expect(rework.executionWorkspaceId).toBe(originalWorkspace)
    expect(f.worktreeCalls).toBe(1)
    expect(f.store.boardTaskMissions(task.id).map(link => `${link.role}:${link.round}`)).toEqual(['reviewer:0', 'worker:0', 'worker:1'])
  })

  it('requires completed independent review, completes general work on approval, and requires integration evidence for code', async () => {
    const f = fixture()
    const general = f.service.createTask({ title: 'Escrever comunicado', description: 'Comunicado interno', acceptanceCriteria: 'Texto aprovado', kind: 'general', teamId: f.team.id })
    const started = await f.service.assignTask(general.id, f.worker.id, f.reviewer.id)
    const workerMission = f.store.mission(started.currentMissionId!)!
    await finishMission(f, workerMission, 'Texto pronto.')
    expect(() => f.service.approveReview(general.id)).toThrow(/revisor/i)
    const reviewerMission = f.store.mission(f.store.boardTask(general.id)!.currentReviewMissionId!)!
    await finishMission(f, reviewerMission, 'Aprovado.')
    expect(f.service.approveReview(general.id).status).toBe('done')

    const code = f.service.createTask({ title: 'Ajuste', description: 'Ajuste de código', acceptanceCriteria: 'Compila', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    const codeStarted = await f.service.assignTask(code.id, f.worker.id, f.reviewer.id)
    await finishMission(f, f.store.mission(codeStarted.currentMissionId!)!, 'Implementado.')
    const codeReview = f.store.boardTask(code.id)!
    await finishMission(f, f.store.mission(codeReview.currentReviewMissionId!)!, 'Aprovado.')
    expect(f.service.approveReview(code.id).status).toBe('integration')
    expect(() => f.service.integrate(code.id, '')).toThrow(/evidência/i)
    expect(f.service.integrate(code.id, 'PR #123 integrado na branch principal.').status).toBe('done')
  })

  it('recovers assigned queued tasks after restart and does not reopen cancelled tasks', async () => {
    const f = fixture()
    const queued = f.service.createTask({ title: 'Recuperar tarefa', description: 'Retomar após reinício.', acceptanceCriteria: 'Uma execução ativa.', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    f.store.putBoardTask({ ...queued, assigneeAgentId: f.worker.id, reviewerAgentId: f.reviewer.id, status: 'queued' })
    f.service.restore()
    await vi.waitFor(() => expect(f.store.boardTask(queued.id)?.status).toBe('doing'))
    expect(f.store.boardTaskMissions(queued.id).filter(link => link.role === 'worker')).toHaveLength(1)
    expect(f.worktreeCalls).toBe(1)

    const cancelled = f.service.createTask({ title: 'Cancelar tarefa', description: 'Parar execução.', acceptanceCriteria: 'Permanece cancelada.', kind: 'general', teamId: f.team.id })
    const running = await f.service.assignTask(cancelled.id, f.worker.id, f.reviewer.id)
    f.service.cancel(cancelled.id)
    const mission = f.store.mission(running.currentMissionId!)!
    await finishMission(f, mission, 'Concluiu depois do cancelamento.')
    expect(f.store.boardTask(cancelled.id)?.status).toBe('cancelled')
  })

  it('stops a blocked worker before reassigning and preserves old mission/worktree links', async () => {
    const f = fixture()
    const task = f.service.createTask({ title: 'Refatorar token', description: 'Atualizar validação.', acceptanceCriteria: 'Cobertura de expiração.', kind: 'code', teamId: f.team.id, workspaceId: f.source.id })
    const first = await f.service.assignTask(task.id, f.worker.id, f.reviewer.id)
    const originalWorkspaceId = first.executionWorkspaceId
    const oldMissionId = first.currentMissionId!
    f.service.block(task.id, 'Aguardar credenciais.')
    f.store.putBoardTeam({ ...f.team, agentIds: [...f.team.agentIds, f.outsider.id] })

    const second = await f.service.reassignTask(task.id, f.reviewer.id, f.outsider.id)
    expect(second.status).toBe('doing')
    expect(second.reviewRound).toBe(1)
    expect(second.executionWorkspaceId).toBe(originalWorkspaceId)
    expect(second.currentMissionId).not.toBe(oldMissionId)
    expect(f.store.mission(oldMissionId)?.status).toBe('cancelled')
    expect(f.store.boardTaskMissions(task.id).map(link => `${link.role}:${link.round}`)).toEqual(['worker:0', 'worker:1'])
    expect(f.stoppedConversations).toHaveLength(1)
    expect(f.worktreeCalls).toBe(1)
  })

  it('rejects invalid transitions and oversized review feedback before mutating the card', async () => {
    const f = fixture()
    const task = f.service.createTask({ title: 'Revisar política', description: 'Validar fluxo.', acceptanceCriteria: 'Evidência anexada.', kind: 'general', teamId: f.team.id })
    expect(() => f.service.approveReview(task.id)).toThrow(/revisão/i)
    const started = await f.service.assignTask(task.id, f.worker.id, f.reviewer.id)
    await finishMission(f, f.store.mission(started.currentMissionId!)!, 'Pronto.')
    const reviewerMission = f.store.mission(f.store.boardTask(task.id)!.currentReviewMissionId!)!
    await finishMission(f, reviewerMission, 'Aprovado.')
    const eventCount = f.store.boardEvents(task.id).length
    expect(() => f.service.requestChanges(task.id, 'x'.repeat(2001))).toThrow(/2000/)
    expect(f.store.boardTask(task.id)).toMatchObject({ status: 'review', reviewRound: 0, currentReviewMissionId: reviewerMission.id })
    expect(f.store.boardEvents(task.id)).toHaveLength(eventCount)
    expect(() => f.service.integrate(task.id, 'evidência')).toThrow(/aprovada/i)
  })
})
