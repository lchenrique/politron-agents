// Cadastro puro dos Boos (sem DSH, sem disco). Um Boo é um agente especialista; o Chief é o Lead do Agent Team: coordena e delega, único e permanente.
import { randomUUID } from 'node:crypto'

export const CHIEF_HANDLE = 'chief'

const clean = (value, label, max, required = true) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`Informe ${label.toLowerCase()}.`)
    return ''
  }
  if (typeof value !== 'string') throw new Error(`${label} inválido.`)
  const text = value.trim()
  if (!text && required) throw new Error(`Informe ${label.toLowerCase()}.`)
  if (text.length > max) throw new Error(`${label} passa de ${max} caracteres.`)
  return text
}

/** Cor do corpo do avatar. Paleta suave para os Boos novos saírem distintos entre si; o Chief usa azul. */
export const BOO_COLORS = ['#ffd6a5', '#bde0fe', '#caffbf', '#ffc6ff', '#fdffb6', '#ffadad', '#a0c4ff', '#9bf6ff']
const CHIEF_COLOR = '#7aaaff'
const color = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.trim())) throw new Error('Cor inválida: use o formato #rrggbb.')
  return value.trim().toLowerCase()
}

export const slugify = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'boo'

const seedChief = (now = new Date().toISOString()) => ({
  id: randomUUID(), handle: CHIEF_HANDLE, name: 'Chief', role: 'chief', color: CHIEF_COLOR,
  description: 'Coordena os Boos: entende o pedido, escolhe o especialista certo e delega.', instructions: '', archived: false, createdAt: now, updatedAt: now,
})

export const emptyState = () => ({ version: 1, agents: [seedChief()], teams: [], projects: {}, homes: {}, routines: [], delegations: [] })

export function normalizeState(raw) {
  // Versões anteriores guardavam `presetId` (`boo-<slug>`, `boobot-chief`): o handle é o mesmo nome sem o prefixo de preset.
  const agents = (Array.isArray(raw?.agents) ? raw.agents : []).map(({ presetId, ...agent }, index) => ({ ...agent, color: agent.color ?? (agent.role === 'chief' ? CHIEF_COLOR : BOO_COLORS[index % BOO_COLORS.length]), handle: agent.handle ?? (agent.role === 'chief' ? CHIEF_HANDLE : String(presetId ?? slugify(agent.name)).replace(/^boo-/, '')) }))
  const teams = Array.isArray(raw?.teams) ? raw.teams : []
  const plainObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  const projects = raw?.projects && typeof raw.projects === 'object' && !Array.isArray(raw.projects) ? raw.projects : {}
  return { version: 1, agents: agents.some(agent => agent.role === 'chief') ? agents : [seedChief(), ...agents], teams, projects, homes: plainObject(raw?.homes), routines: Array.isArray(raw?.routines) ? raw.routines : [], delegations: Array.isArray(raw?.delegations) ? raw.delegations : [] }
}

export const activeAgents = state => state.agents.filter(agent => !agent.archived)
export const boos = state => activeAgents(state).filter(agent => agent.role !== 'chief')

/** Nome do teammate no Agent Team do DSH: slug do nome, único (inclusive entre arquivados) e permanente — o DSH nunca reusa nem renomeia. */
function handleFor(state, name) {
  const base = slugify(name)
  const taken = new Set(['lead', ...state.agents.map(agent => agent.handle)])
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  return id
}

export function createBoo(state, input, now = new Date().toISOString()) {
  const name = clean(input.name, 'Nome do Boo', 60)
  if (activeAgents(state).some(agent => agent.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um Boo com esse nome.')
  const agent = {
    id: randomUUID(), handle: handleFor(state, name), name, role: 'boo', color: color(input.color, BOO_COLORS[state.agents.length % BOO_COLORS.length]),
    description: clean(input.description, 'Especialidade', 500), area: clean(input.area, 'Área', 40, false), instructions: clean(input.instructions, 'Instruções', 20000, false),
    archived: false, createdAt: now, updatedAt: now,
  }
  return { state: { ...state, agents: [...state.agents, agent] }, agent }
}

/** Edita campos informados; o `handle` nunca muda (é o nome do teammate no DSH). */
export function updateAgent(state, id, input, now = new Date().toISOString()) {
  const agent = state.agents.find(item => item.id === id && !item.archived)
  if (!agent) throw new Error('Boo não encontrado.')
  const name = input.name === undefined ? agent.name : clean(input.name, 'Nome do Boo', 60)
  if (activeAgents(state).some(other => other.id !== id && other.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um Boo com esse nome.')
  const updated = {
    ...agent, name, color: color(input.color, agent.color),
    description: input.description === undefined ? agent.description : clean(input.description, 'Especialidade', 500),
    area: input.area === undefined ? (agent.area ?? '') : clean(input.area, 'Área', 40, false),
    instructions: input.instructions === undefined ? agent.instructions : clean(input.instructions, 'Instruções', 20000, false),
    updatedAt: now,
  }
  return { state: { ...state, agents: state.agents.map(item => (item.id === id ? updated : item)) }, agent: updated }
}

export function archiveBoo(state, id, now = new Date().toISOString()) {
  const agent = state.agents.find(item => item.id === id && !item.archived)
  if (!agent) throw new Error('Boo não encontrado.')
  if (agent.role === 'chief') throw new Error('O Chief não pode ser arquivado.')
  const updated = { ...agent, archived: true, updatedAt: now }
  // Arquivar tira o Boo dos times (o time continua, com um membro a menos).
  const teams = state.teams.map(team => ({ ...team, agentIds: team.agentIds.filter(member => member !== id) }))
  return { state: { ...state, teams, agents: state.agents.map(item => (item.id === id ? updated : item)) }, agent: updated }
}

/** Times: grupos nomeados de Boos. Um projeto (workspace do DSH) tem no máximo um time, que `/boos` convoca no lugar de todos os Boos. */
/** O Agent Team do DSH aceita 8 membros por sessão; um deles é o Lead (Chief). */
export const MAX_TEAM_BOOS = 7
const memberIds = (state, ids) => {
  const list = [...new Set(ids ?? [])]
  if (!list.length) throw new Error('O time precisa de ao menos um Boo.')
  if (list.length > MAX_TEAM_BOOS) throw new Error(`Um time tem no máximo ${MAX_TEAM_BOOS} Boos (o DSH limita a sessão a 8 membros, contando o Chief).`)
  for (const id of list) if (!boos(state).some(boo => boo.id === id)) throw new Error(`Boo desconhecido ou arquivado: ${id}`)
  return list
}

/** Aplica a lista de projetos ao time: um projeto muda de time se estava em outro, e os que saíram da lista ficam sem time. */
export function setProjects(state, teamId, workspaceIds) {
  if (!state.teams.some(team => team.id === teamId)) throw new Error('Time não encontrado.')
  const wanted = new Set(workspaceIds ?? [])
  const projects = {}
  for (const [workspaceId, owner] of Object.entries(state.projects)) if (owner !== teamId && !wanted.has(workspaceId)) projects[workspaceId] = owner
  for (const workspaceId of wanted) projects[workspaceId] = teamId
  return { ...state, projects }
}

export function createTeam(state, input, now = new Date().toISOString()) {
  const name = clean(input.name, 'Nome do time', 60)
  if (state.teams.some(team => team.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um time com esse nome.')
  const team = { id: randomUUID(), name, description: clean(input.description, 'Descrição', 500, false), agentIds: memberIds(state, input.agentIds), createdAt: now, updatedAt: now }
  const next = { ...state, teams: [...state.teams, team] }
  return { state: input.workspaceIds ? setProjects(next, team.id, input.workspaceIds) : next, team }
}

export function updateTeam(state, id, input, now = new Date().toISOString()) {
  const team = state.teams.find(item => item.id === id)
  if (!team) throw new Error('Time não encontrado.')
  const name = input.name === undefined ? team.name : clean(input.name, 'Nome do time', 60)
  if (state.teams.some(other => other.id !== id && other.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe um time com esse nome.')
  const updated = {
    ...team, name,
    description: input.description === undefined ? team.description : clean(input.description, 'Descrição', 500, false),
    agentIds: input.agentIds === undefined ? team.agentIds : memberIds(state, input.agentIds),
    updatedAt: now,
  }
  const next = { ...state, teams: state.teams.map(item => (item.id === id ? updated : item)) }
  return { state: input.workspaceIds === undefined ? next : setProjects(next, id, input.workspaceIds), team: updated }
}

export function deleteTeam(state, id) {
  const team = state.teams.find(item => item.id === id)
  if (!team) throw new Error('Time não encontrado.')
  const projects = Object.fromEntries(Object.entries(state.projects).filter(([, owner]) => owner !== id))
  return { state: { ...state, teams: state.teams.filter(item => item.id !== id), projects }, team }
}

/** Time do projeto, ou undefined quando o projeto não tem time (aí valem todos os Boos). */
export const teamFor = (state, workspaceId) => state.teams.find(team => team.id === state.projects[workspaceId])
