import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, portableState } from './dsh-transfer.mjs'

test('separa plugins do npm dos locais (link:)', () => {
  const { npm, local } = classify({
    'dsh-cdp': '^0.2.0',
    '@feiyang666/dsh-mobile-remote': '1.9.1',
    '@boobot/boos': 'link:C:/Users/x/Politron Agents/plugins/boobot-boos',
  })
  assert.deepEqual(npm.map(plugin => plugin.install), ['dsh-cdp@^0.2.0', '@feiyang666/dsh-mobile-remote@1.9.1'])
  assert.deepEqual(local, [{ name: '@boobot/boos', dir: 'C:/Users/x/Politron Agents/plugins/boobot-boos' }])
  assert.deepEqual(classify(undefined), { npm: [], local: [] })
})

test('estado portátil zera o que só vale na máquina de origem e mantém Boos e times', () => {
  const state = portableState({
    version: 1,
    agents: [{ id: 'a', name: 'Lyra' }],
    teams: [{ id: 't', name: 'Web', agentIds: ['a'] }],
    projects: { 'workspace-1': 't' },
    homes: { a: 'session-1' },
    routines: [{ id: 'r', scheduleId: 's', sessionId: 'session-1' }],
    delegations: [{ id: 'd', sessionId: 'session-2', originSessionId: 'session-3' }],
  })
  assert.deepEqual([state.homes, state.routines, state.projects, state.delegations], [{}, [], {}, []])
  assert.equal(state.agents.length, 1)
  assert.equal(state.teams[0].name, 'Web')
})
