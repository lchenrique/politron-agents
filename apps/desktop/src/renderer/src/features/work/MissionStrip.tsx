import { useState } from 'react'
import { ChevronDown, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Approval, Mission, Run } from '../../../../shared/v9'
import { MissionControls, MissionReply, PhaseLabel, ProgressBar, StepList, missionPhase, missionProgress } from './mission-ui'

/** Estado da missão da conversa, acima das mensagens: progresso sempre visível, plano sob demanda. */
export function MissionStrip({ mission, runs, approvals, onNotice }: { mission: Mission; runs: Run[]; approvals: Approval[]; onNotice: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const phase = missionPhase(mission, runs, approvals)
  const { done, total, current } = missionProgress(mission)
  return <section aria-label={`Missão: ${mission.title}`} className={cn('border-b border-border bg-muted/40', phase === 'waiting' && 'bg-warning-soft/60')}>
    <div className="flex items-center gap-3 px-4 py-2">
      <Target aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Button type="button" variant="ghost" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded p-0 text-left font-normal text-inherit hover:bg-transparent hover:text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2"><span className="truncate text-xs font-medium">{mission.title}</span><PhaseLabel phase={phase} className="shrink-0" /></span>
          <span className="block truncate text-[11px] text-muted-foreground">{current ? current.title : mission.updates.at(-1)?.text}</span>
        </span>
        <span className="hidden w-28 shrink-0 items-center gap-2 sm:flex"><ProgressBar mission={mission} /><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{total ? `${done}/${total}` : ''}</span></span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </Button>
      <MissionControls mission={mission} onNotice={onNotice} compact />
    </div>
    {open && <div className="max-h-72 overflow-auto px-4 pb-3 pl-11"><StepList steps={mission.steps} /><p className="mt-2 text-[11px] text-muted-foreground">Turno {mission.turns} de {mission.maxTurns}. A missão continua sozinha entre turnos e retoma após reinício.</p></div>}
    {phase === 'waiting' && <div className="px-4 pb-3 pl-11"><MissionReply mission={mission} onNotice={onNotice} /></div>}
  </section>
}
