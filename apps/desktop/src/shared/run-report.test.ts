import { describe, expect, it } from 'vitest'
import type { CommandEvidence, FileChange, Run } from './v9'
import { buildRunReport, formatDuration, rangeBounds } from './run-report'

const now = new Date(2026, 10, 13, 15, 0, 0)
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString()
const run = (id: string, agentId: string, createdAt: string, patch: Partial<Run> = {}): Run =>
  ({ id, agentId, conversationId: 'c-' + id, createdAt, status: 'completed', ...patch } as unknown as Run)
const file = (runId: string, path: string, createdAt: string, patch: Partial<FileChange> = {}): FileChange =>
  ({ id: runId + path + createdAt, runId, path, createdAt, status: 'applied', additions: 2, deletions: 1, ...patch } as unknown as FileChange)
const command = (runId: string, text: string, finishedAt: string, patch: Partial<CommandEvidence> = {}): CommandEvidence =>
  ({ id: runId + text, runId, command: text, finishedAt, createdAt: finishedAt, status: 'completed', exitCode: 0, ...patch } as unknown as CommandEvidence)

describe('relatório de execuções por dia', () => {
  it('calcula os limites de hoje, ontem e 7 dias em horário local', () => {
    expect(rangeBounds('today', now)).toEqual({ start: new Date(2026, 10, 13), end: new Date(2026, 10, 14) })
    expect(rangeBounds('yesterday', now)).toEqual({ start: new Date(2026, 10, 12), end: new Date(2026, 10, 13) })
    expect(rangeBounds('week', now).start).toEqual(new Date(2026, 10, 7))
  })

  it('agrupa por Boo só as execuções do período, com arquivos somados e falhas', () => {
    const input = {
      runs: [
        run('r1', 'ana', at(13, 9), { finishedAt: at(13, 9, 5) }),
        run('r2', 'ana', at(13, 10)),
        run('r3', 'bia', at(13, 11), { status: 'failed' }),
        run('old', 'ana', at(12, 23)),
      ],
      files: [
        file('r1', 'a.ts', at(13, 9, 1)), file('r1', 'a.ts', at(13, 9, 2)), file('r1', 'b.ts', at(13, 9, 3), { status: 'unchanged' }),
        file('r2', 'c.ts', at(13, 10, 7)),
      ],
      commands: [command('r2', 'npm test', at(13, 10, 9), { status: 'failed', exitCode: 1 })],
    }
    const groups = buildRunReport(input, 'today', now)
    expect(groups.map(group => [group.agentId, group.runs.map(item => item.runId)])).toEqual([['ana', ['r2', 'r1']], ['bia', ['r3']]])
    const [r2, r1] = groups[0].runs
    expect(r1.files).toEqual([{ path: 'a.ts', additions: 4, deletions: 2, failed: false }])
    expect(r1).toMatchObject({ durationMs: 5 * 60_000, estimated: false, failed: false })
    // Sem finishedAt: estima pela última evidência (comando às 10:09).
    expect(r2).toMatchObject({ durationMs: 9 * 60_000, estimated: true, failed: true, failedCommands: ['npm test'] })
    expect(groups[0]).toMatchObject({ failures: 1, files: 2 })
    expect(groups[1].runs[0]).toMatchObject({ failed: true, durationMs: null })
    expect(buildRunReport(input, 'yesterday', now).flatMap(group => group.runs.map(item => item.runId))).toEqual(['old'])
  })

  it('mede execuções em andamento até agora', () => {
    const [group] = buildRunReport({ runs: [run('r', 'ana', at(13, 14, 30), { status: 'running' })], files: [], commands: [] }, 'today', now)
    expect(group.runs[0]).toMatchObject({ durationMs: 30 * 60_000, estimated: false })
  })

  it('formata durações', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(192_000)).toBe('3 min 12 s')
    expect(formatDuration(3_900_000)).toBe('1 h 05 min')
  })
})
