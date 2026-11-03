import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState, createBoo } from './store.js'
import { summon, teammatePrompt, briefing } from './team.js'

const withBoos = () => {
  let state = emptyState()
  state = createBoo(state, { name: 'Lyra', description: 'Design de interfaces', instructions: 'Seja breve' }).state
  state = createBoo(state, { name: 'Nova', description: 'Backend' }).state
  return state
}
const fakeTeams = (existing = [], failOn = []) => {
  const calls = []
  return {
    calls,
    listMembers: () => existing.map(name => ({ name })),
    spawnTeammate: async (_lead, request) => { calls.push(request); if (failOn.includes(request.name)) throw new Error('limite de membros'); return { member: { name: request.name } } },
  }
}

test('convoca cada Boo como teammate fresh pelo provider spawn, com nome = handle', async () => {
  const teams = fakeTeams()
  const result = await summon(teams, {}, withBoos(), new AbortController().signal)
  assert.deepEqual(result.spawned, ['lyra', 'nova'])
  assert.deepEqual(teams.calls.map(c => [c.name, c.context, c.provider]), [['lyra', 'fresh', 'spawn'], ['nova', 'fresh', 'spawn']])
  assert.match(teams.calls[0].prompt[0].text, /Design de interfaces/)
  assert.match(teams.calls[0].prompt[0].text, /Seja breve/)
})

test('é idempotente: quem já está no time é pulado; falhas não param os demais', async () => {
  const teams = fakeTeams(['lyra'], ['nova'])
  const result = await summon(teams, {}, withBoos(), new AbortController().signal)
  assert.deepEqual(result.present, ['lyra'])
  assert.deepEqual(result.failed, [{ handle: 'nova', error: 'limite de membros' }])
  assert.deepEqual(teams.calls.map(c => c.name), ['nova'])
})

test('Boo arquivado não é convocado; briefing lista o time e inclui as instruções do Chief', async () => {
  const state = withBoos()
  const lyra = state.agents.find(a => a.handle === 'lyra')
  const archived = { ...state, agents: state.agents.map(a => (a.id === lyra.id ? { ...a, archived: true } : a)) }
  const teams = fakeTeams()
  await summon(teams, {}, archived, new AbortController().signal)
  assert.deepEqual(teams.calls.map(c => c.name), ['nova'])
  const chief = { ...state.agents[0], instructions: 'Sempre revise antes de entregar.' }
  const text = briefing(archived, chief)
  assert.match(text, /nova: Nova, Backend/)
  assert.doesNotMatch(text, /lyra:/)
  assert.match(text, /Sempre revise/)
  assert.match(briefing(emptyState(), undefined), /Não há Boos/)
  assert.match(teammatePrompt({ name: 'X', handle: 'x', description: 'y', instructions: '' }), /"x"/)
})

test('com time do projeto, só os Boos do time são convocados e o briefing nomeia o time', async () => {
  const state = withBoos()
  const nova = state.agents.find(a => a.handle === 'nova')
  const squad = { id: 't', name: 'API', description: 'backend', agentIds: [nova.id] }
  const teams = fakeTeams()
  const result = await summon(teams, {}, state, new AbortController().signal, squad)
  assert.deepEqual(result.spawned, ['nova'])
  const text = briefing(state, undefined, squad)
  assert.match(text, /Time deste projeto: API, backend/)
  assert.match(text, /nova:/)
  assert.doesNotMatch(text, /lyra:/)
})
