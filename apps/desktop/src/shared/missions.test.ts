import { describe, expect, it } from 'vitest'
import { decideAfterTurn, describeTrigger, missionBrief, nextRoutineRun, normalizeSteps, validateTrigger } from './missions'
import type { Mission } from './v9'

const mission = (patch: Partial<Mission> = {}): Mission => ({ id: 'm1', title: 'Lançar produto', goal: 'Lançar o produto X', workspaceId: 'w', conversationId: 'c', ownerAgentId: 'a', routineId: null, model: null, status: 'active', steps: [], updates: [], question: null, options: [], result: null, turns: 0, maxTurns: 20, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: '', updatedAt: '', completedAt: null, ...patch })

describe('motor de missões', () => {
  it('continua enquanto há progresso e orçamento', () => {
    expect(decideAfterTurn(mission(), { status: 'completed', progressed: true }).action).toBe('continue')
  })
  it('para em espera quando o orçamento de turnos acaba', () => {
    const decision = decideAfterTurn(mission({ turns: 19 }), { status: 'completed', progressed: true })
    expect(decision).toMatchObject({ action: 'set', status: 'waiting' })
  })
  it('evita laço sem progresso pedindo orientação', () => {
    expect(decideAfterTurn(mission({ idleTurns: 0 }), { status: 'completed', progressed: false }).action).toBe('continue')
    expect(decideAfterTurn(mission({ idleTurns: 1 }), { status: 'completed', progressed: false })).toMatchObject({ action: 'set', status: 'waiting' })
  })
  it('tenta novamente após falha e desiste na terceira', () => {
    expect(decideAfterTurn(mission(), { status: 'failed', error: 'timeout', progressed: false })).toMatchObject({ action: 'continue' })
    expect(decideAfterTurn(mission({ failures: 2 }), { status: 'failed', progressed: false })).toMatchObject({ action: 'set', status: 'failed' })
  })
  it('pausa quando o usuário interrompe e ignora missões inativas', () => {
    expect(decideAfterTurn(mission(), { status: 'interrupted', progressed: false })).toMatchObject({ action: 'set', status: 'paused' })
    expect(decideAfterTurn(mission({ status: 'completed' }), { status: 'completed', progressed: true }).action).toBe('wait')
  })
  it('monta o briefing com plano e protocolo', () => {
    const text = missionBrief(mission({ steps: [{ id: '1', title: 'Pesquisar mercado', status: 'done' }, { id: '2', title: 'Montar LP', status: 'doing', assignee: 'Freya' }] }), 'Resposta do usuário: sim')
    expect(text).toContain('[x] Pesquisar mercado')
    expect(text).toContain('[>] Montar LP (Freya)')
    expect(text).toContain('mission_complete')
    expect(text).toContain('Resposta do usuário: sim')
  })
  it('preserva ids de passos existentes ao atualizar o plano', () => {
    const first = normalizeSteps(['A', { title: 'B', status: 'doing' }])
    const next = normalizeSteps([{ title: 'A', status: 'done' }, 'B', 'C'], first)
    expect(next[0].id).toBe(first[0].id)
    expect(next[0].status).toBe('done')
    expect(next).toHaveLength(3)
    expect(() => normalizeSteps([{ title: '' }])).toThrow()
  })
})

describe('agenda de rotinas', () => {
  it('calcula a próxima execução diária respeitando os dias', () => {
    const friday = new Date(2026, 9, 23, 10, 0) // sexta
    const next = new Date(nextRoutineRun({ kind: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, friday)!)
    expect(next.getDay()).toBe(1)
    expect(next.getHours()).toBe(9)
    const sameDay = new Date(nextRoutineRun({ kind: 'daily', time: '18:30', weekdays: [] }, friday)!)
    expect(sameDay.getDate()).toBe(23)
  })
  it('calcula intervalos e ignora eventos', () => {
    const from = new Date('2026-10-24T10:00:00Z')
    expect(nextRoutineRun({ kind: 'interval', minutes: 60 }, from)).toBe('2026-10-24T11:00:00.000Z')
    expect(nextRoutineRun({ kind: 'event', event: 'app-start' }, from)).toBeNull()
  })
  it('valida gatilhos e descreve em português', () => {
    expect(() => validateTrigger({ kind: 'interval', minutes: 5 })).toThrow()
    expect(() => validateTrigger({ kind: 'daily', time: '25:00' })).toThrow()
    expect(describeTrigger(validateTrigger({ kind: 'daily', time: '08:00', weekdays: [5, 1, 2, 3, 4] }))).toBe('Dias úteis às 08:00')
    expect(describeTrigger({ kind: 'interval', minutes: 120 })).toBe('A cada 2 h')
  })
})
