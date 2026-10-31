import { describe, expect, it } from 'vitest'
import type { Agent, Message, Run } from '../../../../shared/v9'
import { deskOrder, officeDesks } from './office-state'

const agent = (id: string, role?: Agent['role']) => ({ id, name: id, role }) as Agent
const run = (id: string, agentId: string, status: Run['status'], extra: Partial<Run> = {}) => ({ id, agentId, conversationId: `c-${id}`, status, parentId: null, createdAt: '2026-10-31T00:00:00Z', ...extra }) as Run
const tool = (runId: string, text: string, status: 'running' | 'completed', createdAt = '2026-10-31T00:00:01Z') => ({ id: `m-${runId}-${createdAt}`, runId, role: 'activity', text, status, createdAt, tool: { name: 'workspace_write', status, startedAt: createdAt } }) as Message

describe('estado do escritório', () => {
  it('mostra o passo da ferramenta em andamento, pensando sem ferramenta, fila, aprovação e livre', () => {
    const agents = [agent('chief', 'chief'), agent('freya'), agent('tyr'), agent('hermes'), agent('luna'), agent('mimir')]
    const runs = [run('r-chief', 'chief', 'running'), run('r-freya', 'freya', 'running', { parentId: 'r-chief' }), run('r-tyr', 'tyr', 'running'), run('r-hermes', 'hermes', 'waiting'), run('r-luna', 'luna', 'queued'), run('old', 'mimir', 'completed')]
    const messages = [tool('r-freya', 'Edição · src/app.ts', 'completed', '2026-10-31T00:00:01Z'), tool('r-freya', 'Terminal · npm test', 'running', '2026-10-31T00:00:02Z')]
    const desks = Object.fromEntries(officeDesks({ agents, runs, messages }).map(desk => [desk.agent.id, desk]))
    expect(desks.freya).toMatchObject({ state: 'working', detail: 'Terminal · npm test', fromChief: true, conversationId: 'c-r-freya' })
    expect(desks.tyr).toMatchObject({ state: 'thinking', fromChief: false })
    expect(desks.hermes!.state).toBe('waiting')
    expect(desks.luna!.state).toBe('queued')
    expect(desks.mimir).toMatchObject({ state: 'idle', detail: 'Livre' })
  })

  it('aprovação pendente vence outra execução do mesmo agente, e o Chief vem primeiro na ordem', () => {
    const agents = [agent('ana'), agent('zed'), agent('chief', 'chief')]
    const runs = [run('a1', 'ana', 'running'), run('a2', 'ana', 'waiting'), run('z1', 'zed', 'running')]
    const desks = officeDesks({ agents, runs, messages: [] })
    expect(desks.find(desk => desk.agent.id === 'ana')!.state).toBe('waiting')
    expect(deskOrder(desks).map(desk => desk.agent.id)).toEqual(['chief', 'ana', 'zed'])
  })
})
