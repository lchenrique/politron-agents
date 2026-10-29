import { useState } from 'react'
import { Check, CircleDashed, CircleSlash, Loader2, Pause, Play, Send, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/dsh'
import { cn } from '@/lib/utils'
import type { Approval, Mission, MissionAction, MissionStep, Run } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'

export type MissionPhase = Mission['status'] | 'running' | 'approval'

/** Estado visível: combina o estado persistido com execuções e aprovações vivas da conversa. */
export function missionPhase(mission: Mission, runs: Run[], approvals: Approval[]): MissionPhase {
  if (mission.status !== 'active') return mission.status
  if (approvals.some(item => item.conversationId === mission.conversationId && item.status === 'pending')) return 'approval'
  return runs.some(run => run.conversationId === mission.conversationId && ['queued', 'running', 'waiting'].includes(run.status)) ? 'running' : 'active'
}

const PHASE: Record<MissionPhase, { label: string; tone: string }> = {
  running: { label: 'Trabalhando', tone: 'text-info' },
  active: { label: 'Em andamento', tone: 'text-info' },
  approval: { label: 'Aguardando aprovação', tone: 'text-warning' },
  waiting: { label: 'Precisa de você', tone: 'text-warning' },
  paused: { label: 'Pausada', tone: 'text-muted-foreground' },
  completed: { label: 'Concluída', tone: 'text-success' },
  failed: { label: 'Falhou', tone: 'text-destructive' },
  cancelled: { label: 'Cancelada', tone: 'text-muted-foreground' },
}

export function PhaseLabel({ phase, className }: { phase: MissionPhase; className?: string }) {
  const meta = PHASE[phase]
  return <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', meta.tone, className)}>
    <span aria-hidden className={cn('size-1.5 rounded-full bg-current', phase === 'running' && 'animate-pulse motion-reduce:animate-none')} />{meta.label}
  </span>
}

export function missionProgress(mission: Mission) {
  const steps = mission.steps.filter(step => step.status !== 'skipped')
  const done = steps.filter(step => step.status === 'done').length
  const current = mission.steps.find(step => step.status === 'doing') || mission.steps.find(step => step.status === 'pending' || step.status === 'blocked')
  return { done, total: steps.length, current }
}

export function ProgressBar({ mission }: { mission: Mission }) {
  const { done, total } = missionProgress(mission)
  const value = total ? done / total : mission.status === 'completed' ? 1 : 0
  return <div role="progressbar" aria-label="Progresso do plano" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={total ? done : value} className="h-1 w-full overflow-hidden rounded-full bg-muted">
    <div className={cn('h-full rounded-full transition-[width] duration-300 ease-out', mission.status === 'failed' ? 'bg-destructive' : mission.status === 'completed' ? 'bg-success' : 'bg-primary')} style={{ width: `${Math.round(value * 100)}%` }} />
  </div>
}

const STEP_ICON: Record<MissionStep['status'], { icon: typeof Check; className: string; label: string }> = {
  done: { icon: Check, className: 'text-success', label: 'Feito' },
  doing: { icon: Loader2, className: 'animate-spin text-info motion-reduce:animate-none', label: 'Em execução' },
  pending: { icon: CircleDashed, className: 'text-muted-foreground', label: 'Pendente' },
  blocked: { icon: TriangleAlert, className: 'text-warning', label: 'Bloqueado' },
  skipped: { icon: CircleSlash, className: 'text-muted-foreground', label: 'Ignorado' },
}

export function StepList({ steps }: { steps: MissionStep[] }) {
  if (!steps.length) return <p className="text-xs text-muted-foreground">O plano aparece aqui assim que o responsável registrar os passos.</p>
  return <ol className="space-y-1.5">
    {steps.map(step => {
      const meta = STEP_ICON[step.status]
      const Icon = meta.icon
      return <li key={step.id} className="flex gap-2 text-xs leading-5">
        <Icon aria-label={meta.label} className={cn('mt-0.5 size-3.5 shrink-0', meta.className)} />
        <span className={cn('min-w-0', step.status === 'done' && 'text-muted-foreground', step.status === 'skipped' && 'text-muted-foreground line-through')}>
          {step.title}{step.assignee && <span className="text-muted-foreground"> · {step.assignee}</span>}
          {step.note && <span className="block text-[11px] text-muted-foreground">{step.note}</span>}
        </span>
      </li>
    })}
  </ol>
}

export function useMissionAction(onNotice: (text: string) => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (mission: Mission, action: MissionAction, text?: string) => {
    setBusy(mission.id + action)
    try { await window.appAPI.missionAction(mission.id, action, text); return true }
    catch (error) { onNotice(errorText(error)); return false }
    finally { setBusy(null) }
  }
  return { busy, run }
}

export function MissionControls({ mission, onNotice, compact = false }: { mission: Mission; onNotice: (text: string) => void; compact?: boolean }) {
  const { busy, run } = useMissionAction(onNotice)
  const [cancelOpen, setCancelOpen] = useState(false)
  const open = ['active', 'waiting', 'paused'].includes(mission.status)
  const size = compact ? 'xs' : 'sm'
  return <>
    <div className="flex flex-wrap items-center gap-1">
      {mission.status === 'active' && <Button size={size} variant="ghost" disabled={!!busy} onClick={() => void run(mission, 'pause')}><Pause className="size-3.5" />Pausar</Button>}
      {(mission.status === 'paused' || mission.status === 'failed') && <Button size={size} variant="ghost" disabled={!!busy} onClick={() => void run(mission, 'resume')}><Play className="size-3.5" />Retomar</Button>}
      {open && <Button size={size} variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={!!busy} onClick={() => setCancelOpen(true)}><Square className="size-3.5" />Cancelar</Button>}
    </div>
    <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar missão?" description={`Cancelar a missão “${mission.title}”? O trabalho já feito é preservado.`} closeLabel="Fechar"
      footer={<div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
          <Button variant="destructive" disabled={!!busy} onClick={() => { setCancelOpen(false); void run(mission, 'cancel') }}>Cancelar missão</Button>
      </div>} />
  </>
}

/** Resposta à decisão pendente: opções sugeridas ou texto livre, sem modal. */
export function MissionReply({ mission, onNotice, autoFocus = false }: { mission: Mission; onNotice: (text: string) => void; autoFocus?: boolean }) {
  const { busy, run } = useMissionAction(onNotice)
  const [value, setValue] = useState('')
  const budget = mission.turns >= mission.maxTurns
  const submit = async (text: string) => { if (await run(mission, 'reply', text)) setValue('') }
  return <div className="space-y-2">
    {mission.question && <p className="text-sm leading-6">{mission.question}</p>}
    {!!mission.options.length && <div className="flex flex-wrap gap-1.5">
      {mission.options.map(option => <Button key={option} size="sm" variant="outline" disabled={!!busy} onClick={() => option === 'Continuar' ? void run(mission, budget ? 'extend' : 'resume') : void submit(option)}>{option}</Button>)}
    </div>}
    <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); if (value.trim()) void submit(value.trim()) }}>
      <Textarea aria-label={`Responder ao responsável por ${mission.title}`} autoFocus={autoFocus} rows={1} value={value} onChange={event => setValue(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (value.trim()) void submit(value.trim()) } }}
        placeholder="Responder com uma decisão ou orientação…" className="field-sizing-content max-h-40 min-h-9 w-auto flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 md:text-sm dark:bg-background" />
      <Button type="submit" size="icon" aria-label="Enviar resposta" disabled={!value.trim() || !!busy}><Send className="size-4" /></Button>
    </form>
  </div>
}

export function relativeTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - now
  const minutes = Math.round(diff / 60_000)
  const format = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, 'hour')
  return format.format(Math.round(hours / 24), 'day')
}
