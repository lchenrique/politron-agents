import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeam, updateTeam, deleteTeam, setProjects, teamFor, emptyState, normalizeState, createBoo, updateAgent, archiveBoo, boos, slugify, CHIEF_HANDLE } from './store.js'

test('estado novo traz só o Chief; estado sem Chief ganha um', () => {
  assert.deepEqual(emptyState().agents.map(a => [a.role, a.handle]), [['chief', CHIEF_HANDLE]])
  assert.equal(normalizeState({ agents: [] }).agents[0].role, 'chief')
  assert.equal(normalizeState(emptyState()).agents.length, 1)
})

test('Boo exige nome e especialidade; nome é único entre ativos', () => {
  const s = emptyState()
  assert.throws(() => createBoo(s, { name: ' ', description: 'x' }), /Informe/)
  assert.throws(() => createBoo(s, { name: 'Lyra' }), /especialidade/)
  const { state } = createBoo(s, { name: 'Lyra', description: 'Design' })
  assert.throws(() => createBoo(state, { name: 'lyra', description: 'x' }), /Já existe/)
})

test('handle vem do nome sem acento e não colide, nem com arquivados', () => {
  assert.equal(slugify('Brígida UX'), 'brigida-ux')
  let { state, agent } = createBoo(emptyState(), { name: 'Lyra', description: 'a' })
  assert.equal(agent.handle, 'lyra')
  state = archiveBoo(state, agent.id).state
  assert.equal(createBoo(state, { name: 'Lyra', description: 'b' }).agent.handle, 'lyra-2')
})

test('editar preserva handle; Chief pode ser editado mas não arquivado', () => {
  const { state, agent } = createBoo(emptyState(), { name: 'Lyra', description: 'a' })
  const edited = updateAgent(state, agent.id, { name: 'Lyra Prime', instructions: 'Seja breve' }).agent
  assert.equal(edited.handle, 'lyra')
  assert.equal(edited.instructions, 'Seja breve')
  const chief = state.agents.find(a => a.role === 'chief')
  assert.equal(updateAgent(state, chief.id, { instructions: 'Delegue' }).agent.instructions, 'Delegue')
  assert.throws(() => archiveBoo(state, chief.id), /Chief/)
  assert.equal(boos(archiveBoo(state, agent.id).state).length, 0)
})

test('estado antigo com presetId migra para handle', () => {
  const old = { agents: [{ id: 'c', role: 'chief', name: 'Chief', presetId: 'boobot-chief' }, { id: 'b', role: 'boo', name: 'Lyra', presetId: 'boo-lyra-2' }] }
  assert.deepEqual(normalizeState(old).agents.map(a => [a.handle, 'presetId' in a]), [['chief', false], ['lyra-2', false]])
})

test('cor do avatar: padrão da paleta, validação hex e edição', () => {
  const a = createBoo(emptyState(), { name: 'Lyra', description: 'a' })
  assert.match(a.agent.color, /^#[0-9a-f]{6}$/)
  assert.throws(() => createBoo(emptyState(), { name: 'X', description: 'a', color: 'vermelho' }), /Cor inválida/)
  assert.equal(createBoo(emptyState(), { name: 'X', description: 'a', color: '#FF0000' }).agent.color, '#ff0000')
  assert.equal(updateAgent(a.state, a.agent.id, { color: '#00ff00' }).agent.color, '#00ff00')
  assert.equal(updateAgent(a.state, a.agent.id, { name: 'Lyra B' }).agent.color, a.agent.color)
  assert.ok(emptyState().agents[0].color)
  assert.ok(normalizeState({ agents: [{ id: 'b', role: 'boo', name: 'Z' }] }).agents.every(x => x.color))
})

const twoBoos = () => {
  let state = emptyState()
  const a = createBoo(state, { name: 'Lyra', description: 'UX' }); state = a.state
  const b = createBoo(state, { name: 'Nova', description: 'API' }); state = b.state
  return { state, a: a.agent, b: b.agent }
}

test('time: nome único, ao menos um Boo ativo, e Chief não entra como membro', () => {
  const { state, a } = twoBoos()
  const chief = state.agents.find(x => x.role === 'chief')
  assert.throws(() => createTeam(state, { name: 'Web', agentIds: [] }), /ao menos um/)
  assert.throws(() => createTeam(state, { name: 'Web', agentIds: [chief.id] }), /desconhecido/)
  const { state: next } = createTeam(state, { name: 'Web', agentIds: [a.id] })
  assert.throws(() => createTeam(next, { name: 'web', agentIds: [a.id] }), /Já existe/)
})

test('projeto tem um time: atribuir move de time, remover da lista libera, apagar limpa', () => {
  const { state, a, b } = twoBoos()
  let s = createTeam(state, { name: 'Web', agentIds: [a.id], workspaceIds: ['w1', 'w2'] })
  const web = s.team
  s = createTeam(s.state, { name: 'API', agentIds: [b.id], workspaceIds: ['w2'] })
  assert.equal(teamFor(s.state, 'w1').name, 'Web')
  assert.equal(teamFor(s.state, 'w2').name, 'API')
  const freed = updateTeam(s.state, s.team.id, { workspaceIds: [] }).state
  assert.equal(teamFor(freed, 'w2'), undefined)
  assert.equal(teamFor(setProjects(freed, web.id, ['w1', 'w3']), 'w3').name, 'Web')
  assert.deepEqual(deleteTeam(s.state, web.id).state.projects, { w2: s.team.id })
  assert.equal(teamFor(emptyState(), 'x'), undefined)
})

test('arquivar Boo o tira dos times; estado antigo sem times migra', () => {
  const { state, a, b } = twoBoos()
  const s = createTeam(state, { name: 'Web', agentIds: [a.id, b.id] })
  assert.deepEqual(archiveBoo(s.state, a.id).state.teams[0].agentIds, [b.id])
  const old = normalizeState({ agents: [] })
  assert.deepEqual([old.teams, old.projects], [[], {}])
})

test('área: opcional, editável e limitada; time aceita no máximo 7 Boos', () => {
  const a = createBoo(emptyState(), { name: 'Lyra', description: 'UX', area: 'design' })
  assert.equal(a.agent.area, 'design')
  assert.equal(createBoo(emptyState(), { name: 'X', description: 'y' }).agent.area, '')
  assert.throws(() => createBoo(emptyState(), { name: 'X', description: 'y', area: 'a'.repeat(41) }), /passa de 40/)
  assert.equal(updateAgent(a.state, a.agent.id, { area: 'backend' }).agent.area, 'backend')
  assert.equal(updateAgent(a.state, a.agent.id, { name: 'Lyra B' }).agent.area, 'design')
  let state = emptyState()
  const ids = []
  for (let i = 0; i < 8; i += 1) { const r = createBoo(state, { name: `Boo ${i}`, description: 'x' }); state = r.state; ids.push(r.agent.id) }
  assert.throws(() => createTeam(state, { name: 'Grande', agentIds: ids }), /no máximo 7/)
  assert.equal(createTeam(state, { name: 'Ok', agentIds: ids.slice(0, 7) }).team.agentIds.length, 7)
})
