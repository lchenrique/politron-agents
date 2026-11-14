import type { CommandEvidence, FileChange, Run, RunStatus } from './v9'

/** Períodos do painel "O que os Boos fizeram". */
export type ReportRange = 'today' | 'yesterday' | 'week'

export interface RunReportFile { path: string; additions: number; deletions: number; failed: boolean }
export interface RunReportItem {
  runId: string; conversationId: string; agentId: string; status: RunStatus
  startedAt: string; finishedAt: string | null; durationMs: number | null
  /** Duração calculada pela última evidência, em execuções antigas sem `finishedAt`. */
  estimated: boolean
  files: RunReportFile[]; commands: number; failedCommands: string[]; failed: boolean
}
export interface RunReportGroup { agentId: string; runs: RunReportItem[]; failures: number; files: number }

const FINISHED: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'interrupted', 'cancelled'])
export const isFinishedRun = (status: RunStatus): boolean => FINISHED.has(status)

/** Início e fim (exclusivo) do período, em horário local. */
export function rangeBounds(range: ReportRange, now = new Date()): { start: Date; end: Date } {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = (offset: number) => new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + offset)
  if (range === 'yesterday') return { start: day(-1), end: midnight }
  return { start: range === 'week' ? day(-6) : midnight, end: day(1) }
}

const time = (value: string | null | undefined): number => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : NaN }

/** Agrupa por Boo as execuções iniciadas no período, com arquivos, comandos e falhas de cada uma. */
export function buildRunReport(
  input: { runs: Run[]; files: FileChange[]; commands: CommandEvidence[] },
  range: ReportRange, now = new Date(),
): RunReportGroup[] {
  const { start, end } = rangeBounds(range, now)
  const filesByRun = new Map<string, FileChange[]>()
  for (const file of input.files) filesByRun.set(file.runId, [...(filesByRun.get(file.runId) || []), file])
  const commandsByRun = new Map<string, CommandEvidence[]>()
  for (const command of input.commands) commandsByRun.set(command.runId, [...(commandsByRun.get(command.runId) || []), command])

  const groups = new Map<string, RunReportGroup>()
  const runs = input.runs
    .filter(run => { const at = time(run.createdAt); return at >= start.getTime() && at < end.getTime() })
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
  for (const run of runs) {
    const changes = filesByRun.get(run.id) || []
    const commands = commandsByRun.get(run.id) || []
    // O mesmo arquivo editado várias vezes aparece uma vez, com as linhas somadas.
    const files = new Map<string, RunReportFile>()
    for (const change of changes) {
      if (change.status === 'unchanged') continue
      const current = files.get(change.path) || { path: change.path, additions: 0, deletions: 0, failed: false }
      files.set(change.path, { path: change.path, additions: current.additions + change.additions, deletions: current.deletions + change.deletions, failed: current.failed || change.status === 'failed' })
    }
    const failedCommands = commands.filter(command => command.status !== 'completed' || (command.exitCode ?? 0) !== 0).map(command => command.command)
    const startedAt = time(run.createdAt)
    const lastEvidence = Math.max(-Infinity, ...changes.map(change => time(change.createdAt)).filter(Number.isFinite), ...commands.map(command => time(command.finishedAt)).filter(Number.isFinite))
    const finished = isFinishedRun(run.status)
    const stamped = time(run.finishedAt)
    const endAt = Number.isFinite(stamped) ? stamped : !finished ? now.getTime() : Number.isFinite(lastEvidence) ? lastEvidence : NaN
    const item: RunReportItem = {
      runId: run.id, conversationId: run.conversationId, agentId: run.agentId, status: run.status,
      startedAt: run.createdAt, finishedAt: Number.isFinite(stamped) ? run.finishedAt! : null,
      durationMs: Number.isFinite(endAt) && endAt >= startedAt ? endAt - startedAt : null,
      estimated: finished && !Number.isFinite(stamped) && Number.isFinite(endAt),
      files: [...files.values()], commands: commands.length, failedCommands,
      failed: run.status === 'failed' || run.status === 'interrupted' || failedCommands.length > 0 || [...files.values()].some(file => file.failed),
    }
    const group = groups.get(run.agentId) || { agentId: run.agentId, runs: [], failures: 0, files: 0 }
    group.runs.push(item)
    if (item.failed) group.failures++
    group.files += item.files.length
    groups.set(run.agentId, group)
  }
  return [...groups.values()].sort((a, b) => b.runs.length - a.runs.length)
}

/** "45 s", "3 min 12 s", "1 h 05 min". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}
