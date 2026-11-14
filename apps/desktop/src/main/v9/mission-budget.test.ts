// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Mission } from '../../shared/v9'
import { describeTrigger, nextRoutineRun, validateTrigger } from '../../shared/missions'
import { addUsage, budgetCheck, buildMissionReport, claudeUsage, openCodeUsage, parseTasks, piUsage, raiseBudget, sanitizeBudget, usageFromRuntimeEvent } from './mission-budget'

const base = (patch: Partial<Mission> = {}): Mission => ({ id: 'm1', title: 'Noite', goal: 'g', workspaceId: 'w', conversationId: 'c', ownerAgentId: 'a', routineId: 'r', model: null, status: 'completed',
  steps: [], updates: [], question: null, options: [], result: null, turns: 3, maxTurns: 8, idleTurns: 0, failures: 0, lastProgressAt: null,
  createdAt: '2026-11-13T02:00:00.000Z', updatedAt: '2026-11-13T02:00:00.000Z', completedAt: null, ...patch })

describe('agendamento de execução única', () => {
  it('valida a data, dispara no horário e descreve em português', () => {
    const trigger = validateTrigger({ kind: 'once', at: '2026-11-13T23:00:00-03:00' })
    expect(trigger).toEqual({ kind: 'once', at: '2026-11-14T02:00:00.000Z' })
    expect(nextRoutineRun(trigger, new Date('2026-11-13T12:00:00Z'))).toBe('2026-11-14T02:00:00.000Z')
    expect(describeTrigger(trigger)).toMatch(/^Uma vez, /)
    expect(() => validateTrigger({ kind: 'once', at: 'amanhã' })).toThrow(/data/)
  })
  it('lê a lista de tarefas, uma por linha', () => {
    expect(parseTasks('1. Atualizar deps\n\n- Rodar testes\r\n  * Changelog  ')).toEqual(['Atualizar deps', 'Rodar testes', 'Changelog'])
    expect(parseTasks(undefined)).toEqual([])
  })
})

describe('consumo dos motores', () => {
  it('normaliza Codex, Claude e OpenCode', () => {
    expect(usageFromRuntimeEvent({ method: 'thread/tokenUsage/updated', params: { threadId: 't', turnId: 'u', tokenUsage: { total: { inputTokens: 999, outputTokens: 999 }, last: { inputTokens: 100, outputTokens: 20 } } } }))
      .toEqual({ threadId: 't', turnId: 'u', usage: { inputTokens: 100, outputTokens: 20, costUsd: 0 } })
    expect(claudeUsage({ total_cost_usd: 0.05, usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 7 } })).toEqual({ inputTokens: 15, outputTokens: 7, costUsd: 0.05 })
    expect(openCodeUsage({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0.01 } })).toEqual({ inputTokens: 5, outputTokens: 5, costUsd: 0.01 })
    expect(openCodeUsage({ usage: { prompt_tokens: 5, completion_tokens: 1 } }).costUsd).toBe(0)
    expect(usageFromRuntimeEvent({ method: 'turn/usage', params: { threadId: 't', usage: { inputTokens: 1, outputTokens: 2, costUsd: 0.5 } } })?.usage.costUsd).toBe(0.5)
    expect(usageFromRuntimeEvent({ method: 'item/agentMessage/delta', params: { threadId: 't' } })).toBeNull()
    expect(piUsage({ role: 'assistant', usage: { input: 10, output: 4, cacheRead: 6, cacheWrite: 2, totalTokens: 22, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } } }))
      .toEqual({ inputTokens: 18, outputTokens: 4, costUsd: 0.003 })
    expect(piUsage({ role: 'assistant' })).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 })
  })
})

describe('orçamento', () => {
  it('ignora limites vazios ou inválidos', () => {
    expect(sanitizeBudget({ maxCostUsd: 0, maxTokens: -1, maxMinutes: Number.NaN })).toBeUndefined()
    expect(sanitizeBudget({ maxCostUsd: 2, maxTokens: '5', maxMinutes: 30 })).toEqual({ maxCostUsd: 2, maxMinutes: 30 })
  })
  it('avisa a 80% e corta a 100% pelo limite mais consumido', () => {
    const now = new Date('2026-11-13T02:10:00.000Z')
    const usage = (tokens: number, costUsd = 0) => addUsage(undefined, { inputTokens: tokens, outputTokens: 0, costUsd })
    expect(budgetCheck(base({ budget: { maxTokens: 1000 }, usage: usage(500) }), now).level).toBe('ok')
    expect(budgetCheck(base({ budget: { maxTokens: 1000 }, usage: usage(800) }), now).level).toBe('warn')
    const cut = budgetCheck(base({ budget: { maxTokens: 1000, maxCostUsd: 1 }, usage: usage(100, 1.2) }), now)
    expect(cut.level).toBe('exceeded'); expect(cut.reason).toMatch(/custo/)
    expect(budgetCheck(base({ budget: { maxMinutes: 10 } }), now).level).toBe('exceeded')
    expect(budgetCheck(base(), now).level).toBe('ok')
  })
})

describe('aumentar orçamento', () => {
  it('sem pedido sobe metade acima do usado; pedido abaixo do usado é recusado', () => {
    const now = new Date('2026-11-13T02:30:00.000Z')
    const mission = base({ budget: { maxTokens: 1000, maxMinutes: 20, maxCostUsd: 1 }, usage: addUsage(undefined, { inputTokens: 1200, outputTokens: 0, costUsd: 0.4 }) })
    expect(raiseBudget(mission, undefined, now)).toEqual({ maxTokens: 1700, maxMinutes: 40, maxCostUsd: 1.5 })
    expect(raiseBudget(mission, { maxTokens: 3000 }, now)).toEqual({ maxTokens: 3000, maxMinutes: 40, maxCostUsd: 1.5 })
    expect(() => raiseBudget(mission, { maxTokens: 1100 }, now)).toThrow(/maior que o já usado/)
    expect(budgetCheck({ ...mission, budget: raiseBudget(mission, undefined, now) }, now).level).toBe('ok')
  })
})

describe('relatório', () => {
  it('lista tarefas, falhas com motivo, arquivos e consumo', () => {
    const report = buildMissionReport(base({ status: 'failed', budget: { maxTokens: 1000 }, usage: addUsage(undefined, { inputTokens: 900, outputTokens: 200, costUsd: 0 }),
      steps: [{ id: '1', title: 'Rodar testes', status: 'done', note: '42 passaram' }, { id: '2', title: 'Publicar', status: 'blocked', note: 'sem credencial' }, { id: '3', title: 'Changelog', status: 'pending' }],
      updates: [{ at: '', agentId: null, kind: 'error', text: 'Orçamento esgotado: 1.100 de 1.000 tokens.' }] }), ['src/a.ts', 'README.md'], new Date('2026-11-13T03:05:00.000Z'))
    expect(report).toContain('Interrompida pelo orçamento')
    expect(report).toContain('[feito] Rodar testes: 42 passaram')
    expect(report).toContain('[falhou] Publicar: sem credencial')
    expect(report).toContain('[não iniciada] Changelog')
    expect(report).toContain('Publicar: sem credencial')
    expect(report).toContain('Arquivos alterados (2)')
    expect(report).toContain('- src/a.ts')
    expect(report).toMatch(/1\.100 tokens/)
    expect(report).toContain('custo não informado')
    expect(report).toContain('Duração: 1 h 5 min')
  })
  it('diz quando o motor não informou consumo', () => {
    expect(buildMissionReport(base(), [])).toContain('os motores usados não informaram')
  })
})
