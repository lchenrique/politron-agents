import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProject, resolveTeam } from './lookup.js'

const workspaces = [
  { id: 'w1', title: 'bubbledesk', path: 'C:\\p\\usabit\\bubbledesk' },
  { id: 'w2', title: 'mag-portal', path: 'C:\\p\\usabit\\mag-portal' },
  { id: 'w3', title: 'Politron Agents', path: 'C:\\Boobot\\Politron Agents' },
  { id: 'w4', title: 'Boos', path: 'C:\\Users\\x\\.dsh\\boobot-boos-chat' },
]

test('projeto por título exato, sem diferenciar maiúsculas, por id e por parte única', () => {
  assert.equal(resolveProject(workspaces, 'bubbledesk').id, 'w1')
  assert.equal(resolveProject(workspaces, ' BubbleDesk ').id, 'w1')
  assert.equal(resolveProject(workspaces, 'w2').id, 'w2')
  assert.equal(resolveProject(workspaces, 'politron').id, 'w3')
})

test('título exato vence parte de outro (Boos x boobot-boos-chat)', () => {
  assert.equal(resolveProject(workspaces, 'boos').id, 'w4')
})

test('ambíguo e inexistente dão erro que lista as opções', () => {
  assert.throws(() => resolveProject(workspaces, 'portal agents bub'), /não encontrado/)
  assert.throws(() => resolveProject([{ id: 'a', title: 'app-web', path: 'x' }, { id: 'b', title: 'app-api', path: 'y' }], 'app'), /ambíguo entre: app-web, app-api/)
  assert.throws(() => resolveProject(workspaces, 'nada'), /Disponíveis: bubbledesk, mag-portal, Politron Agents, Boos/)
  assert.throws(() => resolveProject(workspaces, '  '), /Informe o projeto/)
})

test('time por id ou nome', () => {
  const teams = [{ id: 't1', name: 'BubbleDesk Team' }, { id: 't2', name: 'Marketing' }]
  assert.equal(resolveTeam(teams, 'marketing').id, 't2')
  assert.equal(resolveTeam(teams, 't1').name, 'BubbleDesk Team')
  assert.equal(resolveTeam(teams, 'bubble').id, 't1')
  assert.throws(() => resolveTeam(teams, 'xyz'), /Time não encontrado/i)
})
