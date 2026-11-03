// Lógica pura do Board (sem DSH, sem disco): equipes, tarefas e transições.
// As regras espelham apps/desktop/src/main/v9/board.ts do Boobot.
import { randomUUID } from 'node:crypto'

export const STATUSES = ['backlog', 'ready', 'queued', 'doing', 'review', 'rework', 'integration', 'blocked', 'done', 'cancelled']
export const KINDS = ['general', 'code']

// Transições manuais permitidas (o Boobot completo também move por missões; aqui o piloto é manual/por tool).
const NEXT = {
  backlog: ['ready', 'doing', 'cancelled'],
  ready: ['backlog', 'doing', 'cancelled'],
  queued: ['doing', 'blocked', 'cancelled'],
  doing: ['review', 'blocked', 'cancelled'],
  review: ['done', 'rework', 'blocked', 'cancelled'],
  rework: ['doing', 'review', 'blocked', 'cancelled'],
  integration: ['done', 'rework', 'blocked', 'cancelled'],
  blocked: ['ready', 'doing', 'cancelled'],
  done: [],
  cancelled: [],
}

export const emptyState = () => ({ version: 1, teams: [], tasks: [], events: [] })

const clean = (value, label, max) => {
  if (typeof value !== 'string') throw new Error(`${label} inválido.`)
  const text = value.trim()
  if (!text) throw new Error(`Informe ${label.toLowerCase()}.`)
  if (text.length > max) throw new Error(`${label} passa de ${max} caracteres.`)
  return text
}
const optional = (value, label, max) => (value === undefined || value === null || value === '' ? '' : clean(value, label, max))

/** @param agentIds ids de Boos existentes e ativos (vem do host). */
export function createTeam(state, input, agentIds, now = new Date().toISOString()) {
  const name = clean(input.name, 'Nome da equipe', 80)
  if (state.teams.some(team => team.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe uma equipe com esse nome.')
  const members = [...new Set(input.agents ?? [])]
  if (!members.length) throw new Error('A equipe precisa de ao menos um Boo.')
  for (const id of members) if (!agentIds.includes(id)) throw new Error(`Boo desconhecido ou inativo: ${id}`)
  const team = { id: randomUUID(), name, description: optional(input.description, 'Descrição', 500), agentIds: members, createdAt: now, updatedAt: now }
  return { state: { ...state, teams: [...state.teams, team] }, team }
}

export function validateTask(state, input, worker, reviewer) {
  const kind = clean(input.kind, 'Tipo da tarefa', 20)
  if (!KINDS.includes(kind)) throw new Error('Tipo de tarefa inválido.')
  const team = state.teams.find(item => item.id === input.teamId)
  if (!team) throw new Error('Equipe não encontrada.')
  const task = { title: clean(input.title, 'Título', 160), description: clean(input.description, 'Descrição', 20000), acceptanceCriteria: clean(input.acceptanceCriteria, 'Critérios de aceite', 4000), kind, teamId: team.id, workspaceId: input.workspaceId || null }
  if (kind === 'code' && !task.workspaceId) throw new Error('Tarefas de código precisam de um workspace de origem.')
  if (worker === undefined && reviewer === undefined) return { team, task }
  if (!worker || !reviewer) throw new Error('Defina um responsável e um revisor distinto antes de iniciar.')
  if (worker === reviewer) throw new Error('Responsável e revisor precisam ser agentes diferentes.')
  if (!team.agentIds.includes(worker) || !team.agentIds.includes(reviewer)) throw new Error('Responsável e revisor precisam pertencer à equipe da tarefa.')
  return { team, task, worker, reviewer }
}

function event(state, taskId, kind, note, actor, from, to, now) {
  return { ...state, events: [...state.events, { id: randomUUID(), taskId, actorType: actor.type, actorId: actor.id ?? null, kind, ...(from ? { fromStatus: from } : {}), ...(to ? { toStatus: to } : {}), note, createdAt: now }] }
}

/** Cria o cartão; com responsável e revisor já entra em `ready` atribuído. */
export function createTask(state, input, { worker, reviewer, source = 'chief', actor = { type: 'chief', id: null }, originConversationId = null } = {}, now = new Date().toISOString()) {
  const { task } = validateTask(state, input, worker, reviewer)
  const assigned = !!worker
  const card = {
    id: randomUUID(), ...task, assigneeAgentId: worker ?? null, reviewerAgentId: reviewer ?? null, source, originConversationId,
    status: assigned ? 'ready' : 'backlog', reviewRound: 0, reviewDecision: null, reviewFeedback: null, blockedReason: null, result: null,
    createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
  }
  let next = { ...state, tasks: [...state.tasks, card] }
  next = event(next, card.id, 'created', `Criada por ${source}.`, actor, undefined, card.status, now)
  if (assigned) next = event(next, card.id, 'assigned', 'Responsável e revisor definidos.', actor, 'backlog', 'ready', now)
  return { state: next, task: card }
}

export function moveTask(state, taskId, to, { note = '', actor = { type: 'user', id: null } } = {}, now = new Date().toISOString()) {
  if (!STATUSES.includes(to)) throw new Error('Status inválido.')
  const task = state.tasks.find(item => item.id === taskId)
  if (!task) throw new Error('Tarefa não encontrada.')
  if (!NEXT[task.status].includes(to)) throw new Error(`Não dá para ir de ${task.status} para ${to}.`)
  if (to === 'doing' && (!task.assigneeAgentId || !task.reviewerAgentId)) throw new Error('Atribua responsável e revisor antes de iniciar.')
  if (to === 'blocked' && !note.trim()) throw new Error('Informe o motivo do bloqueio.')
  const updated = {
    ...task, status: to, updatedAt: now,
    blockedReason: to === 'blocked' ? note.trim() : null,
    startedAt: to === 'doing' && !task.startedAt ? now : task.startedAt,
    completedAt: to === 'done' || to === 'cancelled' ? now : null,
    result: to === 'done' && note.trim() ? note.trim() : task.result,
  }
  const kind = to === 'done' ? 'completed' : to === 'cancelled' ? 'cancelled' : to === 'blocked' ? 'blocked' : to === 'doing' ? 'started' : to === 'review' ? 'submitted_for_review' : 'updated'
  const next = event({ ...state, tasks: state.tasks.map(item => (item.id === taskId ? updated : item)) }, taskId, kind, note, actor, task.status, to, now)
  return { state: next, task: updated }
}

export function assignTask(state, taskId, worker, reviewer, agentIds, actor = { type: 'user', id: null }, now = new Date().toISOString()) {
  const task = state.tasks.find(item => item.id === taskId)
  if (!task) throw new Error('Tarefa não encontrada.')
  if (!['backlog', 'ready', 'blocked'].includes(task.status)) throw new Error('Só é possível atribuir uma tarefa parada ou bloqueada.')
  for (const id of [worker, reviewer]) if (!agentIds.includes(id)) throw new Error(`Boo desconhecido ou inativo: ${id}`)
  validateTask(state, { ...task, acceptanceCriteria: task.acceptanceCriteria }, worker, reviewer)
  const updated = { ...task, assigneeAgentId: worker, reviewerAgentId: reviewer, status: task.status === 'backlog' ? 'ready' : task.status, updatedAt: now }
  const next = event({ ...state, tasks: state.tasks.map(item => (item.id === taskId ? updated : item)) }, taskId, task.assigneeAgentId ? 'reassigned' : 'assigned', 'Responsável e revisor definidos.', actor, task.status, updated.status, now)
  return { state: next, task: updated }
}
