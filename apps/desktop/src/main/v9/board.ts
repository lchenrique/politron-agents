import { randomUUID } from 'node:crypto'
import { ASSISTANT_ID, type Agent, type BoardEvidence, type BoardEvent, type BoardSnapshot, type BoardTask, type BoardTaskInput, type BoardTaskMission, type BoardTeam, type Mission, type StartMissionInput, type Workspace } from '../../shared/v9'
import type { WorkspaceStore } from './store'

const MAX_TEXT = 20_000
const clean = (value: unknown, label: string, max: number, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: informe um texto de até ${max} caracteres.`)
  return value.trim()
}
const activeAgent = (store: WorkspaceStore, id: string): Agent => {
  const agent = store.agent(id)
  if (agent.temporaryStatus === 'retired') throw new Error(`${agent.name} não está ativo.`)
  return agent
}
const required = <T>(value: T | undefined, label: string): T => {
  if (!value) throw new Error(`${label} não encontrada.`)
  return value
}

export interface BoardServiceHost {
  store: WorkspaceStore
  createWorktree(sourceWorkspaceId: string, branch: string, reuseExisting?: boolean): Promise<Workspace>
  startMission(input: StartMissionInput, missionId: string): Mission
  setReviewerConversation(conversationId: string, enabled: boolean): void
  stopMission?(conversationId: string): Promise<void>
  reportChief?(conversationId: string, text: string): void
  emitChanged(): void
}

/** Organiza tarefas opcionais e mantém a conversa normal fora do ciclo do board. */
export class BoardService {
  private readonly starts = new Map<string, Promise<BoardTask>>()
  private disposed = false
  constructor(private readonly host: BoardServiceHost) {}
  private get store() { return this.host.store }
  private task(id: string) { return required(this.store.boardTask(id), 'Tarefa') }
  private team(id: string) { return required(this.store.boardTeam(id), 'Equipe') }
  private reportChief(task: BoardTask, text: string) {
    if (task.source !== 'chief' || !task.originConversationId) return
    try { this.host.reportChief?.(task.originConversationId, text) } catch { /* o cartão continua como registro principal */ }
  }

  snapshot(): BoardSnapshot {
    const tasks = this.store.boardTasks({ limit: 500 })
    const missions: BoardTaskMission[] = tasks.flatMap(task => this.store.boardTaskMissions(task.id))
    const events: BoardEvent[] = tasks.flatMap(task => this.store.boardEvents(task.id, 100))
    const evidence: BoardEvidence[] = tasks.flatMap(task => this.store.boardEvidence(task.id))
    return { teams: this.store.boardTeams(), tasks, events, missions, evidence }
  }

  restore(): void {
    for (const task of this.store.boardTasks({ limit: 500 })) {
      for (const link of this.store.boardTaskMissions(task.id).filter(item => item.role === 'reviewer')) this.host.setReviewerConversation(link.conversationId, true)
      if (task.status === 'queued' && task.assigneeAgentId && task.reviewerAgentId) {
        void this.startTask(task.id).catch(error => { if (!this.disposed) this.block(task.id, `Não foi possível retomar a tarefa: ${error instanceof Error ? error.message : String(error)}`, 'system') })
        continue
      }
      if (!['doing', 'review'].includes(task.status)) continue
      const missionId = task.status === 'review' ? task.currentReviewMissionId : task.currentMissionId
      const mission = missionId ? this.store.mission(missionId) : undefined
      if (mission?.status === 'completed' && task.status === 'doing') void this.onMissionUpdated(mission)
      else if (!mission || ['failed', 'cancelled', 'interrupted'].includes(mission.status)) this.block(task.id, 'A missão foi interrompida ou não existe após a reinicialização. Retome a tarefa pelo board.', 'system')
    }
  }

  saveTeam(input: Partial<BoardTeam> & { name: string }): BoardTeam {
    const previous = input.id ? this.store.boardTeam(input.id) : undefined
    const name = clean(input.name, 'Nome da equipe', 80)
    const description = clean(input.description ?? previous?.description ?? '', 'Descrição', 500, true)
    const ids = input.agentIds ?? previous?.agentIds ?? []
    if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string')) throw new Error('Lista de agentes inválida.')
    const agentIds = [...new Set(ids)]
    for (const id of agentIds) activeAgent(this.store, id)
    const now = new Date().toISOString()
    const team: BoardTeam = { id: previous?.id || randomUUID(), name, description, agentIds, createdAt: previous?.createdAt || now, updatedAt: now }
    this.store.putBoardTeam(team)
    this.host.emitChanged()
    return team
  }

  deleteTeam(teamId: string): void {
    this.team(clean(teamId, 'Equipe', 100))
    if (this.store.boardTasks({ limit: 500 }).some(task => task.teamId === teamId && !['done', 'cancelled'].includes(task.status))) throw new Error('Conclua ou cancele as tarefas da equipe antes de removê-la.')
    this.store.deleteBoardTeam(teamId)
    this.host.emitChanged()
  }

  createTask(input: BoardTaskInput, source: BoardTask['source'] = 'user', originConversationId: string | null = null): BoardTask {
    const { team, workspaceId } = this.validateTask(input)
    const title = clean(input.title, 'Título', 160)
    const description = clean(input.description, 'Descrição', MAX_TEXT)
    const acceptanceCriteria = clean(input.acceptanceCriteria, 'Critérios de aceite', 4000)
    if (input.kind !== 'general' && input.kind !== 'code') throw new Error('Tipo de tarefa inválido.')
    if (originConversationId) this.store.conversation(originConversationId)
    const now = new Date().toISOString()
    const task: BoardTask = { id: randomUUID(), title, description, acceptanceCriteria, kind: input.kind, teamId: team.id, assigneeAgentId: null, reviewerAgentId: null,
      source, originConversationId: source === 'chief' ? originConversationId : null, status: 'backlog', workspaceId, executionWorkspaceId: null, branch: null, currentMissionId: null, currentReviewMissionId: null, reviewRound: 0,
      reviewDecision: null, reviewFeedback: null, blockedReason: null, result: null, integrationEvidence: null, createdAt: now, updatedAt: now, startedAt: null, completedAt: null }
    this.store.transaction(() => { this.store.putBoardTask(task); this.event(task, 'created', `Tarefa criada por ${source === 'chief' ? 'Chief' : 'usuário'}.`, 'user', null, 'created') })
    this.host.emitChanged()
    return task
  }

  updateTask(taskId: string, input: BoardTaskInput): BoardTask {
    const task = this.task(clean(taskId, 'Tarefa', 100))
    if (task.status !== 'backlog' || task.currentMissionId || task.currentReviewMissionId) throw new Error('Só tarefas sem execução no backlog podem ser editadas.')
    const { team, workspaceId } = this.validateTask(input)
    const next: BoardTask = { ...task, title: clean(input.title, 'Título', 160), description: clean(input.description, 'Descrição', MAX_TEXT), acceptanceCriteria: clean(input.acceptanceCriteria, 'Critérios de aceite', 4000), kind: input.kind, teamId: team.id, workspaceId, updatedAt: new Date().toISOString() }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'updated', 'Tarefa editada no backlog.', 'user', null, `updated:${task.updatedAt}`, task.status) })
    this.host.emitChanged()
    return next
  }

  validateTask(input: BoardTaskInput, assigneeAgentId?: string, reviewerAgentId?: string): { team: BoardTeam; workspaceId: string | null; worker?: Agent; reviewer?: Agent } {
    const team = this.team(clean(input.teamId, 'Equipe', 100))
    clean(input.title, 'Título', 160); clean(input.description, 'Descrição', MAX_TEXT); clean(input.acceptanceCriteria, 'Critérios de aceite', 4000)
    if (input.kind !== 'general' && input.kind !== 'code') throw new Error('Tipo de tarefa inválido.')
    let workspaceId: string | null = null
    if (input.workspaceId) {
      const workspace = this.store.workspace(input.workspaceId)
      if (workspace.archived) throw new Error('Escolha um workspace ativo.')
      workspaceId = workspace.id
    }
    if (input.kind === 'code' && !workspaceId) throw new Error('Tarefas de código precisam de um workspace de origem.')
    if (assigneeAgentId === undefined && reviewerAgentId === undefined) return { team, workspaceId }
    if (!assigneeAgentId || !reviewerAgentId) throw new Error('Defina um responsável e um revisor distinto antes de iniciar.')
    const worker = activeAgent(this.store, clean(assigneeAgentId, 'Responsável', 100))
    const reviewer = activeAgent(this.store, clean(reviewerAgentId, 'Revisor', 100))
    if (worker.id === reviewer.id) throw new Error('Responsável e revisor precisam ser agentes diferentes.')
    if (!team.agentIds.includes(worker.id) || !team.agentIds.includes(reviewer.id)) throw new Error('Responsável e revisor precisam pertencer à equipe da tarefa.')
    return { team, workspaceId, worker, reviewer }
  }

  async assignTask(taskId: string, assigneeAgentId: string, reviewerAgentId: string): Promise<BoardTask> {
    const task = this.task(clean(taskId, 'Tarefa', 100))
    if (!['backlog', 'ready', 'blocked'].includes(task.status)) throw new Error('Só é possível atribuir uma tarefa parada ou bloqueada.')
    const { worker: assignedWorker, reviewer: assignedReviewer } = this.validateTask({ title: task.title, description: task.description, acceptanceCriteria: task.acceptanceCriteria, kind: task.kind, teamId: task.teamId, workspaceId: task.workspaceId }, assigneeAgentId, reviewerAgentId)
    const worker = required(assignedWorker, 'Responsável')
    const reviewer = required(assignedReviewer, 'Revisor')
    if (task.kind === 'code' && (!task.workspaceId || this.store.workspace(task.workspaceId).archived)) throw new Error('Tarefa de código precisa de um workspace de origem ativo.')
    const previous = task.status
    const assigned = { ...task, assigneeAgentId: worker.id, reviewerAgentId: reviewer.id, status: 'queued' as const, blockedReason: null, updatedAt: new Date().toISOString() }
    this.store.transaction(() => { this.store.putBoardTask(assigned); this.event(assigned, 'assigned', `${worker.name} executará; ${reviewer.name} fará a revisão.`, 'user', null, `assigned:${assigned.reviewRound}:${worker.id}:${reviewer.id}:${task.updatedAt}` , previous) })
    this.host.emitChanged()
    return this.startTask(taskId)
  }

  async reassignTask(taskId: string, assigneeAgentId: string, reviewerAgentId: string): Promise<BoardTask> {
    const task = this.task(clean(taskId, 'Tarefa', 100))
    if (task.status !== 'blocked') throw new Error('Só uma tarefa bloqueada pode ser reatribuída.')
    const { worker, reviewer } = this.validateTask({ title: task.title, description: task.description, acceptanceCriteria: task.acceptanceCriteria, kind: task.kind, teamId: task.teamId, workspaceId: task.workspaceId }, assigneeAgentId, reviewerAgentId)
    const assignedWorker = required(worker, 'Responsável')
    const assignedReviewer = required(reviewer, 'Revisor')
    for (const missionId of [task.currentMissionId, task.currentReviewMissionId]) {
      if (!missionId || this.store.mission(missionId)?.status !== 'active') continue
      const link = this.store.boardTaskMissions(task.id).find(item => item.missionId === missionId)
      if (link) await this.host.stopMission?.(link.conversationId)
    }
    const next = { ...task, assigneeAgentId: assignedWorker.id, reviewerAgentId: assignedReviewer.id, reviewRound: task.reviewRound + 1, status: 'rework' as const, reviewDecision: null, reviewFeedback: null, blockedReason: null, currentMissionId: null, currentReviewMissionId: null, result: null, updatedAt: new Date().toISOString() }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'reassigned', `${assignedWorker.name} executará; ${assignedReviewer.name} fará a revisão.`, 'user', null, `reassigned:${task.reviewRound}:${assignedWorker.id}:${assignedReviewer.id}`, task.status) })
    this.host.emitChanged()
    return this.startTask(task.id)
  }

  startTask(taskId: string): Promise<BoardTask> {
    const current = this.task(clean(taskId, 'Tarefa', 100))
    if (this.starts.has(taskId)) return this.starts.get(taskId)!
    if (current.currentMissionId && this.store.mission(current.currentMissionId)) return Promise.resolve(current)
    const run = this.startWorker(current)
    this.starts.set(taskId, run)
    void run.then(() => { if (this.starts.get(taskId) === run) this.starts.delete(taskId) }, () => { if (this.starts.get(taskId) === run) this.starts.delete(taskId) })
    return run
  }

  private async startWorker(task: BoardTask): Promise<BoardTask> {
    if (!['queued', 'ready', 'rework', 'blocked'].includes(task.status)) throw new Error('A tarefa não está pronta para execução.')
    if (!task.assigneeAgentId || !task.reviewerAgentId) throw new Error('Defina um responsável e um revisor antes de iniciar.')
    const worker = activeAgent(this.store, task.assigneeAgentId)
    activeAgent(this.store, task.reviewerAgentId)
    const team = this.team(task.teamId)
    if (!team.agentIds.includes(worker.id) || !team.agentIds.includes(task.reviewerAgentId)) throw new Error('A equipe não contém o responsável e o revisor atuais.')
    let executionWorkspaceId = task.executionWorkspaceId
    let branch = task.branch
    if (task.kind === 'code') {
      if (!task.workspaceId) throw new Error('Tarefa de código precisa de um workspace de origem.')
      const source = this.store.workspace(task.workspaceId)
      if (source.archived) throw new Error('Workspace de origem arquivado; reative-o antes de continuar.')
      if (!executionWorkspaceId) {
        branch = `board/${task.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32)}`
        let worktree: Workspace
        try { worktree = await this.host.createWorktree(source.id, branch, true) }
        catch (error) { return this.block(task.id, `Não foi possível criar o workspace isolado: ${error instanceof Error ? error.message : String(error)}`, 'system') }
        executionWorkspaceId = worktree.id
      } else if (this.store.workspace(executionWorkspaceId).archived) throw new Error('O workspace isolado desta tarefa está arquivado.')
    }
    const missionLink = this.store.boardTaskMissions(task.id).find(link => link.role === 'worker' && link.round === task.reviewRound)
    const conversationId = missionLink?.conversationId || this.store.saveConversation({ name: `Board · ${task.title} · execução ${task.reviewRound + 1}`, kind: 'direct', agentIds: [worker.id], ...(executionWorkspaceId ? { workspaceId: executionWorkspaceId } : task.workspaceId ? { workspaceId: task.workspaceId } : {}) }).id
    const missionId = missionLink?.missionId || randomUUID()
    const now = new Date().toISOString()
    const goal = this.workerPrompt(task)
    const next: BoardTask = { ...task, executionWorkspaceId: executionWorkspaceId || null, branch: branch || null, currentMissionId: missionId, currentReviewMissionId: null, status: 'doing', blockedReason: null, startedAt: task.startedAt || now, updatedAt: now }
    this.store.transaction(() => {
      this.store.putBoardTask(next)
      if (!missionLink) this.store.putBoardTaskMission({ taskId: task.id, role: 'worker', round: task.reviewRound, missionId, conversationId, createdAt: now })
      this.event(next, task.status === 'rework' ? 'resumed' : 'started', task.reviewFeedback ? `Retomada após revisão: ${task.reviewFeedback}` : 'Execução iniciada pelo board.', 'system', worker.id, `worker:${task.reviewRound}:started`, task.status)
    })
    this.host.emitChanged()
    try {
      this.host.startMission({ goal, title: `Board · ${task.title}`, workspaceId: executionWorkspaceId || task.workspaceId, conversationId, agentId: worker.id, maxTurns: 20 }, missionId)
      return this.task(task.id)
    } catch (error) {
      return this.block(task.id, `Não foi possível iniciar a missão: ${error instanceof Error ? error.message : String(error)}`, 'system')
    }
  }

  private workerPrompt(task: BoardTask): string {
    return [`Você está executando uma tarefa do board da empresa.`, `Tarefa: ${task.title}`, `Descrição: ${task.description}`, `Critérios de aceite: ${task.acceptanceCriteria}`,
      task.reviewFeedback ? `Feedback da revisão anterior: ${task.reviewFeedback}` : '', `Quando terminar, use mission_complete com o resultado e as evidências verificáveis. Se não puder prosseguir, use mission_block explicando o impedimento.`].filter(Boolean).join('\n\n')
  }

  async onMissionUpdated(mission: Mission): Promise<void> {
    if (this.disposed) return
    const task = this.store.boardTasks({ limit: 500 }).find(item => item.currentMissionId === mission.id || item.currentReviewMissionId === mission.id)
    if (!task) return
    if (['done', 'cancelled'].includes(task.status)) return
    if (mission.status === 'completed' && task.currentMissionId === mission.id) {
      try { await this.startReviewer(task, mission) }
      catch (error) { this.block(task.id, `Não foi possível iniciar a revisão: ${error instanceof Error ? error.message : String(error)}`, 'system') }
      return
    }
    if ((mission.status === 'failed' || mission.status === 'cancelled') && task.status !== 'blocked') this.block(task.id, mission.result || `A missão terminou com status ${mission.status}.`, 'system')
  }

  private async startReviewer(task: BoardTask, workerMission: Mission): Promise<BoardTask> {
    if (task.status === 'review' && task.currentReviewMissionId) return task
    if (!task.reviewerAgentId) return this.block(task.id, 'Nenhum revisor foi atribuído.', 'system')
    const reviewer = activeAgent(this.store, task.reviewerAgentId)
    const worker = this.store.agent(workerMission.ownerAgentId)
    if (reviewer.id === worker.id) return this.block(task.id, 'Responsável e revisor não podem ser o mesmo agente.', 'system')
    const workspaceId = task.executionWorkspaceId || task.workspaceId || workerMission.workspaceId
    const conversation = this.store.saveConversation({ name: `Board · ${task.title} · revisão ${task.reviewRound + 1}`, kind: 'direct', agentIds: [reviewer.id], workspaceId })
    const missionId = randomUUID()
    const now = new Date().toISOString()
    const next = { ...task, status: 'review' as const, currentReviewMissionId: missionId, result: workerMission.result || null, updatedAt: now }
    const link: BoardTaskMission = { taskId: task.id, role: 'reviewer', round: task.reviewRound, missionId, conversationId: conversation.id, createdAt: now }
    this.host.setReviewerConversation(conversation.id, true)
    this.store.transaction(() => { this.store.putBoardTask(next); this.store.putBoardTaskMission(link); this.event(next, 'submitted_for_review', 'A execução terminou; revisão independente iniciada no mesmo workspace.', 'system', worker.id, `review:${task.reviewRound}:started`) })
    this.host.emitChanged()
    const goal = [`Você é o revisor independente de uma tarefa do board. Não altere arquivos nem execute comandos; sua conversa não oferece ferramentas de escrita.`, `Tarefa: ${task.title}`, `Descrição: ${task.description}`, `Critérios de aceite: ${task.acceptanceCriteria}`, `Resultado informado pelo responsável: ${workerMission.result || 'Sem resumo.'}`, `Inspecione o diff e o estado real do workspace. Termine sua missão com um parecer objetivo: aprovado ou mudanças necessárias, citando evidências. A decisão formal será registrada no board pelo usuário.`].join('\n\n')
    try {
      this.host.startMission({ goal, title: `Revisão · ${task.title}`, workspaceId, conversationId: conversation.id, agentId: reviewer.id, maxTurns: 12 }, missionId)
      return next
    } catch (error) {
      return this.block(task.id, `Não foi possível iniciar a revisão: ${error instanceof Error ? error.message : String(error)}`, 'system')
    }
  }

  approveReview(taskId: string): BoardTask {
    const task = this.task(taskId)
    this.requireCompletedReview(task)
    const now = new Date().toISOString()
    const code = task.kind === 'code'
    const next: BoardTask = { ...task, status: code ? 'integration' : 'done', reviewDecision: 'approved', reviewFeedback: null, completedAt: code ? null : now, updatedAt: now }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'review_approved', code ? 'Revisão aprovada; aguardando integração registrada pelo usuário.' : 'Revisão aprovada; tarefa concluída.', 'user', null, `review:${task.reviewRound}:approved`, task.status) })
    if (!code) this.reportChief(task, `A tarefa do board “${task.title}” foi aprovada e concluída. Resultado: ${task.result || 'sem resumo adicional'}`)
    this.host.emitChanged()
    return next
  }

  requestChanges(taskId: string, feedback: string): Promise<BoardTask> {
    const task = this.task(taskId)
    this.requireCompletedReview(task)
    const note = clean(feedback, 'Feedback da revisão', 2000)
    const nextRound = task.reviewRound + 1
    const now = new Date().toISOString()
    const next = { ...task, status: 'rework' as const, reviewRound: nextRound, reviewDecision: 'changes' as const, reviewFeedback: note, currentMissionId: null, currentReviewMissionId: null, updatedAt: now }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'changes_requested', note, 'user', null, `review:${task.reviewRound}:changes`, task.status) })
    this.host.emitChanged()
    return this.startTask(task.id)
  }

  block(taskId: string, reason: string, actorType: BoardEvent['actorType'] = 'user'): BoardTask {
    const task = this.task(taskId)
    if (['done', 'cancelled'].includes(task.status)) throw new Error('Tarefa encerrada não pode ser bloqueada.')
    const note = clean(reason, 'Motivo do bloqueio', 2000)
    const next = { ...task, status: 'blocked' as const, blockedReason: note, updatedAt: new Date().toISOString() }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'blocked', note, actorType, null, `blocked:${task.updatedAt}`, task.status) })
    for (const missionId of [task.currentMissionId, task.currentReviewMissionId]) {
      if (!missionId || this.store.mission(missionId)?.status !== 'active') continue
      const link = this.store.boardTaskMissions(task.id).find(item => item.missionId === missionId)
      if (link) void this.host.stopMission?.(link.conversationId).catch(() => undefined)
    }
    if (task.status !== 'blocked') this.reportChief(task, `A tarefa do board “${task.title}” foi bloqueada: ${note}. Revise o cartão e decida se deseja retomar, reatribuir ou cancelar.`)
    this.host.emitChanged()
    return next
  }

  async resume(taskId: string): Promise<BoardTask> {
    const task = this.task(taskId)
    if (task.status !== 'blocked') throw new Error('Só uma tarefa bloqueada pode ser retomada.')
    if (!task.assigneeAgentId || !task.reviewerAgentId) throw new Error('Atribua um responsável e um revisor antes de retomar.')
    const workerMission = task.currentMissionId ? this.store.mission(task.currentMissionId) : undefined
    if (workerMission?.status === 'active') {
      const next = { ...task, status: 'doing' as const, blockedReason: null, updatedAt: new Date().toISOString() }
      this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'resumed', 'Execução retomada.', 'user', null, `resume:${task.updatedAt}`, task.status) })
      this.host.emitChanged(); return next
    }
    if (workerMission?.status === 'completed') { await this.startReviewer({ ...task, status: 'doing' }, workerMission); return this.task(task.id) }
    const reviewerMission = task.currentReviewMissionId ? this.store.mission(task.currentReviewMissionId) : undefined
    if (reviewerMission?.status === 'completed') {
      const next = { ...task, status: 'review' as const, blockedReason: null, updatedAt: new Date().toISOString() }
      this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'resumed', 'Revisão retomada.', 'user', null, `resume:${task.updatedAt}`, task.status) })
      this.host.emitChanged(); return next
    }
    const nextRound = task.reviewRound + 1
    this.store.putBoardTask({ ...task, status: 'rework', reviewRound: nextRound, currentMissionId: null, currentReviewMissionId: null, blockedReason: null, updatedAt: new Date().toISOString() })
    this.host.emitChanged()
    return this.startTask(task.id)
  }

  cancel(taskId: string, reason = 'Cancelada pelo usuário.'): BoardTask {
    const task = this.task(taskId)
    if (['done', 'cancelled'].includes(task.status)) throw new Error('A tarefa já foi encerrada.')
    const toStop: string[] = []
    for (const id of [task.currentMissionId, task.currentReviewMissionId]) {
      if (!id) continue
      const link = this.store.boardTaskMissions(task.id).find(item => item.missionId === id)
      if (link) toStop.push(link.conversationId)
    }
    const note = clean(reason, 'Motivo', 1000)
    const now = new Date().toISOString()
    const next = { ...task, status: 'cancelled' as const, blockedReason: note, completedAt: now, updatedAt: now }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'cancelled', note, 'user', null, `cancel:${task.id}`, task.status) })
    for (const conversationId of toStop) void this.host.stopMission?.(conversationId).catch(() => undefined)
    this.reportChief(task, `A tarefa do board “${task.title}” foi cancelada: ${note}`)
    this.host.emitChanged(); return next
  }

  integrate(taskId: string, evidence: string): BoardTask {
    const task = this.task(taskId)
    if (task.kind !== 'code' || task.status !== 'integration') throw new Error('A tarefa precisa estar aprovada e aguardando integração.')
    const note = clean(evidence, 'Evidência de integração', 2000)
    const now = new Date().toISOString()
    const next = { ...task, status: 'done' as const, integrationEvidence: note, completedAt: now, updatedAt: now }
    this.store.transaction(() => { this.store.putBoardTask(next); this.event(next, 'integrated', note, 'user', null, `integrated:${task.id}`, task.status) })
    this.reportChief(task, `A tarefa de código “${task.title}” foi revisada, integrada e concluída. Evidência: ${note}. Resultado: ${task.result || 'sem resumo adicional'}`)
    this.host.emitChanged(); return next
  }

  addEvidence(taskId: string, input: Omit<BoardEvidence, 'id' | 'taskId' | 'round' | 'createdAt'>): BoardEvidence {
    const task = this.task(taskId)
    if (!['diff', 'test', 'command', 'note', 'conversation'].includes(input.kind)) throw new Error('Tipo de evidência inválido.')
    const evidence: BoardEvidence = { id: randomUUID(), taskId, round: task.reviewRound, kind: input.kind, label: clean(input.label, 'Rótulo', 100), summary: clean(input.summary, 'Resumo', 20_000), ...(input.reference ? { reference: clean(input.reference, 'Referência', 500) } : {}), createdAt: new Date().toISOString() }
    this.store.putBoardEvidence(evidence); this.host.emitChanged(); return evidence
  }

  private requireCompletedReview(task: BoardTask) {
    if (task.status !== 'review' || !task.currentReviewMissionId) throw new Error('A tarefa ainda não está em revisão.')
    const review = this.store.mission(task.currentReviewMissionId)
    if (!review || review.status !== 'completed') throw new Error('A missão do revisor precisa terminar antes de registrar a decisão.')
    if (!review.result?.trim()) throw new Error('O revisor precisa registrar seu parecer antes da decisão.')
  }

  private event(task: BoardTask, kind: BoardEvent['kind'], note: string, actorType: BoardEvent['actorType'], actorId: string | null, idempotencyKey: string, fromStatus?: BoardTask['status']) {
    const event: BoardEvent = { id: randomUUID(), taskId: task.id, actorType, actorId, kind, ...(fromStatus && fromStatus !== task.status ? { fromStatus } : {}), toStatus: task.status, note: note.slice(0, 2000), round: task.reviewRound, idempotencyKey: `${task.id}:${idempotencyKey}`, createdAt: new Date().toISOString() }
    this.store.appendBoardEvent(event)
    return event
  }

  dispose() { this.disposed = true }
}
