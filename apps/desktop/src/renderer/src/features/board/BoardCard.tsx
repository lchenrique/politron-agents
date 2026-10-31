import { Clock, GitBranch, Lock, Paperclip, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, BoardTask } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { shortTaskId } from './boardTaskId'

export type BoardCardProps = {
  task: BoardTask
  worker?: Agent
  reviewer?: Agent
  waitingPosition?: number | null
  evidenceCount: number
  reviewReady: boolean
  selected: boolean
  onOpen: (taskId: string) => void
}

/** Cartão compacto: ID, título (2 linhas), um badge de contexto e avatares. O resto vive no painel de detalhes. */
export function BoardCard({ task, worker, reviewer, waitingPosition, evidenceCount, reviewReady, selected, onOpen }: BoardCardProps) {
  const waiting = typeof waitingPosition === 'number'
  const blocked = task.status === 'blocked' || !!task.blockedReason
  return <article
    tabIndex={0}
    aria-label={`Tarefa ${task.title}`}
    aria-haspopup="dialog"
    data-task-id={task.id}
    data-selected={selected || undefined}
    onClick={() => onOpen(task.id)}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(task.id) }
    }}
    className={cn(
      'ds-card block w-full shrink-0 min-w-0 max-w-full cursor-pointer rounded-lg p-2.5 text-left outline-none transition-[box-shadow,background-color]',
      'hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[selected]:ring-2 data-[selected]:ring-ring/60',
    )}
  >
    <h3 className="line-clamp-2 break-words text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere]" title={task.title}>{task.title}</h3>
    <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="inline-flex shrink-0 items-center gap-1 tabular-nums" title={`ID ${task.id}`}>
        {task.kind === 'code' ? <GitBranch className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}{shortTaskId(task.id)}
      </span>
      {waiting && <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5" title="Aguardando vaga de execução"><Clock className="size-3 shrink-0" aria-hidden /><span className="truncate">Aguardando vaga · posição {waitingPosition}</span></span>}
      {!waiting && blocked && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-warning"><Lock className="size-3" aria-hidden />Bloqueada</span>}
      {!waiting && !blocked && reviewReady && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5"><ShieldCheck className="size-3" aria-hidden />Parecer pronto</span>}
      {evidenceCount > 0 && <span className="inline-flex shrink-0 items-center gap-0.5" title={`${evidenceCount} evidência(s)`}><Paperclip className="size-3" aria-hidden />{evidenceCount}</span>}
      <span className="ml-auto flex shrink-0 -space-x-1.5">
        {worker && <span title={`Responsável: ${worker.name}`}><Avatar agent={worker} size="xxs" /></span>}
        {reviewer && <span title={`Revisor: ${reviewer.name}`}><Avatar agent={reviewer} size="xxs" /></span>}
      </span>
    </div>
  </article>
}
