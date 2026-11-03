import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState, createTeam, createTask, moveTask, assignTask } from './store.js'

const agents = ['lyra', 'atlas', 'nova']
const base = () => createTeam(emptyState(), { name: 'Produto', agents: ['lyra', 'atlas'] }, agents)
const input = (teamId, extra = {}) => ({ title: 'Landing', description: 'Criar landing', acceptanceCriteria: 'Responsiva', kind: 'general', teamId, ...extra })

test('equipe exige nome único, ao menos um Boo e Boos existentes', () => {
  const { state } = base()
  assert.throws(() => createTeam(state, { name: 'produto', agents: ['lyra'] }, agents), /Já existe/)
  assert.throws(() => createTeam(emptyState(), { name: 'X', agents: [] }, agents), /ao menos um/)
  assert.throws(() => createTeam(emptyState(), { name: 'X', agents: ['ghost'] }, agents), /desconhecido/)
})

test('tarefa sem responsável cai em backlog; com responsável e revisor entra em ready', () => {
  const { state, team } = base()
  assert.equal(createTask(state, input(team.id)).task.status, 'backlog')
  const ready = createTask(state, input(team.id), { worker: 'lyra', reviewer: 'atlas' })
  assert.equal(ready.task.status, 'ready')
  assert.deepEqual(ready.state.events.map(e => e.kind), ['created', 'assigned'])
})

test('responsável e revisor distintos e da equipe; código exige workspace', () => {
  const { state, team } = base()
  assert.throws(() => createTask(state, input(team.id), { worker: 'lyra', reviewer: 'lyra' }), /diferentes/)
  assert.throws(() => createTask(state, input(team.id), { worker: 'lyra', reviewer: 'nova' }), /pertencer à equipe/)
  assert.throws(() => createTask(state, input(team.id), { worker: 'lyra' }), /revisor distinto/)
  assert.throws(() => createTask(state, input(team.id, { kind: 'code' })), /workspace/)
})

test('transições: ciclo feliz, bloqueio exige motivo e estados finais não andam', () => {
  const { state, team } = base()
  let s = createTask(state, input(team.id), { worker: 'lyra', reviewer: 'atlas' })
  const id = s.task.id
  s = moveTask(s.state, id, 'doing')
  s = moveTask(s.state, id, 'review')
  assert.throws(() => moveTask(s.state, id, 'blocked'), /motivo/)
  s = moveTask(s.state, id, 'done', { note: 'Entregue' })
  assert.equal(s.task.result, 'Entregue')
  assert.ok(s.task.completedAt)
  assert.throws(() => moveTask(s.state, id, 'doing'), /Não dá para ir/)
})

test('não inicia sem responsável; atribuição posterior libera e registra evento', () => {
  const { state, team } = base()
  const s = createTask(state, input(team.id))
  assert.throws(() => moveTask(s.state, s.task.id, 'doing'), /Atribua/)
  const a = assignTask(s.state, s.task.id, 'lyra', 'atlas', agents)
  assert.equal(a.task.status, 'ready')
  assert.equal(a.state.events.at(-1).kind, 'assigned')
})
