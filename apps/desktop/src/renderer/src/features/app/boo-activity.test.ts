import { describe, expect, it } from 'vitest'
import type { Message, Run } from '../../../../shared/v9'
import { booActivity } from './boo-activity'

const run = { id: 'r1', agentId: 'a1', conversationId: 'c1', status: 'running' } as Run
// O registro de atividade é completed; quem informa a execução é tool.status (contrato do workspace).
const edit = { id: 'm1', agentId: 'a1', conversationId: 'c1', runId: 'r1', role: 'activity', status: 'completed', text: 'Edição · src/index.ts', createdAt: '2026-10-30T00:00:00Z', tool: { name: 'workspace_write', status: 'running', startedAt: '' } } as Message
const activity = (runs: Run[], messages: Message[]) => booActivity('a1', 'c1', runs, messages)

describe('atividade real do Boo', () => {
  it('só digita enquanto uma edição do turno atual está em execução', () => {
    expect(activity([run], [edit])).toMatchObject({ state: 'working', expression: 'coding' })
    expect(activity([run], [{ ...edit, tool: { ...edit.tool!, status: 'completed' } }])).toMatchObject({ state: 'working', expression: 'thinking' })
    expect(activity([run], [{ ...edit, text: 'Leitura · src/index.ts', tool: { ...edit.tool!, name: 'workspace_read' } }])).toMatchObject({ expression: 'thinking', detail: 'Leitura · src/index.ts' })
  })

  it.each(['completed', 'failed', 'interrupted', 'cancelled'] as const)('encerra o gesto quando o turno fica %s, mesmo com ferramenta antiga ainda marcada como running', status => {
    const result = activity([{ ...run, status }], [edit])
    expect(result.state).toBe('idle')
    expect(result.expression).not.toBe('coding')
    expect(result.expression).not.toBe('done')
  })

  it('não mistura agente, conversa ou turno', () => {
    for (const stale of [{ ...edit, agentId: 'a2' }, { ...edit, conversationId: 'c2' }, { ...edit, runId: 'r0' }]) {
      expect(activity([run], [stale])).toMatchObject({ expression: 'thinking' })
    }
    expect(activity([{ ...run, conversationId: 'c2' }], [edit])).toEqual({ state: 'idle' })
    expect(booActivity('a1', undefined, [run], [edit])).toEqual({ state: 'idle' })
  })

  it('aprovação e fila não fingem execução de código', () => {
    expect(activity([{ ...run, status: 'waiting' }], [edit])).toMatchObject({ state: 'waiting', expression: 'thinking' })
    expect(activity([{ ...run, status: 'queued' }], [edit])).toMatchObject({ state: 'working', expression: 'thinking' })
    expect(activity([run, { ...run, id: 'r2', status: 'waiting' }], [edit])).toMatchObject({ state: 'waiting' })
  })
})
