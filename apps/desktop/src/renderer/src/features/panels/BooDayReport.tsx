import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, RotateCcw } from 'lucide-react'
import type { Agent, CommandEvidence, Conversation, FileChange, Run, RunStatus } from '../../../../shared/v9'
import { buildRunReport, formatDuration, isFinishedRun, type ReportRange } from '../../../../shared/run-report'
import { Avatar } from '../app/Avatar'

const RANGES: Array<{ id: ReportRange; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'week', label: '7 dias' },
]
const STATUS: Record<RunStatus, string> = {
  queued: 'Na fila', running: 'Trabalhando', waiting: 'Aguardando', completed: 'Concluída',
  failed: 'Falhou', interrupted: 'Interrompida', cancelled: 'Cancelada',
}
const tone = (status: RunStatus) => status === 'completed' ? 'text-emerald-500' : status === 'failed' || status === 'interrupted' ? 'text-rose-500' : 'text-amber-500'
// Limite do activityLog no processo principal.
const LIMIT = 500
type Activity = { commands: CommandEvidence[]; files: FileChange[]; runs: Run[] }

/** Painel "O que os Boos fizeram": execuções por Boo, com arquivos, falhas e desfazer. */
export function BooDayReport({ assistant, agents, conversations, onOpenConversation }: {
  assistant?: Agent; agents: Agent[]; conversations: Conversation[]; onOpenConversation?: (conversationId: string) => void
}) {
  const [range, setRange] = useState<ReportRange>('today')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [undoable, setUndoable] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { setActivity(await window.appAPI.activityLog(LIMIT)) } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }, [])
  useEffect(() => {
    void load()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = window.appAPI.onEvent(event => {
      if (event.type !== 'changed' && event.type !== 'fileChange') return
      clearTimeout(timer); timer = setTimeout(() => void load(), 800)
    })
    return () => { clearTimeout(timer); off() }
  }, [load])

  const groups = useMemo(() => activity ? buildRunReport(activity, range) : [], [activity, range])
  // Só as execuções finalizadas com arquivos podem ter backup para desfazer.
  const candidates = useMemo(() => groups.flatMap(group => group.runs).filter(run => run.files.length && isFinishedRun(run.status)).map(run => run.runId), [groups])
  useEffect(() => {
    let active = true
    void Promise.all(candidates.map(async id => [id, (await window.appAPI.runSnapshot(id).catch(() => ({ available: false, files: 0 }))).files] as const))
      .then(entries => { if (active) setUndoable(Object.fromEntries(entries.filter(([, files]) => files > 0))) })
    return () => { active = false }
  }, [candidates])

  const agentsById = useMemo(() => new Map([...(assistant ? [assistant] : []), ...agents].map(agent => [agent.id, agent])), [assistant, agents])
  const conversationName = (id: string) => conversations.find(item => item.id === id)?.name || 'Conversa removida'
  const time = (value: string) => new Date(value).toLocaleString('pt-BR', range === 'week' ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' })

  const undo = async (runId: string) => {
    if (!window.confirm('Desfazer esta execução? Os arquivos voltam ao estado anterior a ela, inclusive se foram editados depois.')) return
    setBusy(runId); setNotice('')
    try {
      const result = await window.appAPI.undoRun(runId)
      setNotice(result.restored || result.removed
        ? `Execução desfeita: ${result.restored} arquivo(s) restaurado(s) e ${result.removed} removido(s).`
        : 'Esta execução não tem arquivos para desfazer.')
      await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } finally { setBusy(null) }
  }

  const total = groups.reduce((sum, group) => sum + group.runs.length, 0)
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">O que os Boos fizeram</h2>
        <p className="text-[11px] text-[var(--text-muted)]">{activity ? `${total} execução(ões) · ${groups.reduce((sum, group) => sum + group.failures, 0)} com falha` : 'Carregando…'}</p>
      </div>
      <div role="group" aria-label="Período" className="flex gap-1">
        {RANGES.map(item => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)}
          className="rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] aria-pressed:bg-[var(--bg-active)] aria-pressed:text-[var(--text-primary)]">{item.label}</button>)}
      </div>
    </div>
    {notice && <p role="status" className="border-b border-[var(--border-subtle)] px-4 py-2 text-[11.5px] text-[var(--text-secondary)]">{notice}</p>}
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {activity && !groups.length && <p className="text-[12px] text-[var(--text-muted)]">Nenhuma execução neste período.</p>}
      {groups.map(group => {
        const agent = agentsById.get(group.agentId)
        return <section key={group.agentId} aria-label={agent?.name || 'Boo removido'}>
          <header className="mb-1.5 flex items-center gap-2">
            {agent ? <Avatar agent={agent} size="xs" /> : <span aria-hidden="true" className="size-6 rounded-full bg-muted" />}
            <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{agent?.name || 'Boo removido'}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{group.runs.length} execução(ões) · {group.files} arquivo(s){group.failures ? ` · ${group.failures} com falha` : ''}</span>
          </header>
          <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-pane)]">
            {group.runs.map(run => <li key={run.runId} className="space-y-1 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <button type="button" disabled={!onOpenConversation} onClick={() => onOpenConversation?.(run.conversationId)} className="flex min-w-0 items-center gap-1 text-left text-[12px] text-[var(--text-primary)] hover:underline disabled:no-underline">
                  <span className="truncate">{conversationName(run.conversationId)}</span>{onOpenConversation && <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />}
                </button>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--text-muted)]">{time(run.startedAt)} · {run.estimated ? '≈ ' : ''}{formatDuration(run.durationMs)}</span>
                <span className={'shrink-0 text-[11px] font-medium ' + tone(run.status)}>{STATUS[run.status]}</span>
              </div>
              {!!run.files.length && <ul className="space-y-0.5">
                {run.files.map(file => <li key={file.path} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className={'truncate ' + (file.failed ? 'text-rose-500' : 'text-[var(--text-secondary)]')}>{file.path}</span>
                  <span className="shrink-0 text-emerald-500">+{file.additions}</span><span className="shrink-0 text-rose-500">−{file.deletions}</span>
                </li>)}
              </ul>}
              {!!run.failedCommands.length && <p className="truncate font-mono text-[11px] text-rose-500" title={run.failedCommands.join('\n')}>Falhou: {run.failedCommands[0]}{run.failedCommands.length > 1 ? ` (+${run.failedCommands.length - 1})` : ''}</p>}
              <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
                <span>{run.commands} comando(s)</span>
                {/* Tokens e custo ainda não são registrados pelos motores; o campo aparece quando existir. */}
                {undoable[run.runId] ? <button type="button" disabled={busy === run.runId} onClick={() => void undo(run.runId)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-2.5 py-0.5 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60">
                  <RotateCcw className="size-3" aria-hidden="true" />{busy === run.runId ? 'Desfazendo…' : 'Desfazer'}
                </button> : null}
              </div>
            </li>)}
          </ul>
        </section>
      })}
      {activity && activity.runs.length >= LIMIT && <p className="text-[11px] text-[var(--text-muted)]">Mostrando as últimas {LIMIT} execuções registradas.</p>}
    </div>
  </div>
}
