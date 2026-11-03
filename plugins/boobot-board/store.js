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

export const ROLES = ['chief', 'boo']

/** O Chief nasce com o plugin: é o Boo coordenador e existe sempre (não pode ser arquivado nem duplicado). */
const seedChief = (now = new Date().toISOString()) => ({ id: randomUUID(), name: 'Chief', role: 'chief', description: 'Coordena equipes e cartões do Board.', instructions: '', model: null, archived: false, createdAt: now, updatedAt: now })

export const emptyState = () => ({ version: 2, agents: [seedChief()], teams: [], tasks: [], events: [] })

/** Estado lido do disco: garante `agents` (versão 1 não tinha) e o Chief. */
export function normalizeState(raw) {
  const state = { ...emptyState(), ...raw }
  if (!Array.isArray(raw?.agents) || !raw.agents.some(agent => agent.role === 'chief')) state.agents = [seedChief(), ...(Array.isArray(raw?.agents) ? raw.agents : [])]
  return { ...state, version: 2 }
}

export const activeAgents = state => state.agents.filter(agent => !agent.archived)

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

/** Cadastro de Boos do plugin. O Chief é único; nomes são únicos entre os ativos. */
export function createAgent(state, input, now = new Date().toISOString()) {
  const name = clean(input.name, 'Nome do Boo', 60)
  if (activeAgents(state).some(agent => agent.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um Boo com esse nome.')
  const agent = { id: randomUUID(), name, role: 'boo', description: optional(input.description, 'Descrição', 500), instructions: optional(input.instructions, 'Instruções', 20000), model: optional(input.model, 'Modelo', 120) || null, archived: false, createdAt: now, updatedAt: now }
  return { state: { ...state, agents: [...state.agents, agent] }, agent }
}

export function updateAgent(state, agentId, input, now = new Date().toISOString()) {
  const agent = state.agents.find(item => item.id === agentId)
  if (!agent || agent.archived) throw new Error('Boo não encontrado.')
  const name = input.name === undefined ? agent.name : clean(input.name, 'Nome do Boo', 60)
  if (activeAgents(state).some(other => other.id !== agentId && other.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um Boo com esse nome.')
  const pick = (key, label, max) => (input[key] === undefined ? agent[key] : optional(input[key], label, max))
  const updated = { ...agent, name, description: pick('description', 'Descrição', 500), instructions: pick('instructions', 'Instruções', 20000), model: input.model === undefined ? agent.model : optional(input.model, 'Modelo', 120) || null, updatedAt: now }
  return { state: { ...state, agents: state.agents.map(item => (item.id === agentId ? updated : item)) }, agent: updated }
}

/** Arquivar tira o Boo das equipes e bloqueia cartões em aberto dele; nada é apagado. */
export function archiveAgent(state, agentId, now = new Date().toISOString()) {
  const agent = state.agents.find(item => item.id === agentId)
  if (!agent || agent.archived) throw new Error('Boo não encontrado.')
  if (agent.role === 'chief') throw new Error('O Chief não pode ser arquivado.')
  const open = state.tasks.filter(task => (task.assigneeAgentId === agentId || task.reviewerAgentId === agentId) && !['done', 'cancelled'].includes(task.status))
  if (open.length) throw new Error(`O Boo ainda tem ${open.length} cartão(ões) em aberto; reatribua ou conclua antes.`)
  const updated = { ...agent, archived: true, updatedAt: now }
  const teams = state.teams.map(team => ({ ...team, agentIds: team.agentIds.filter(id => id !== agentId) }))
  return { state: { ...state, teams, agents: state.agents.map(item => (item.id === agentId ? updated : item)) }, agent: updated }
}
