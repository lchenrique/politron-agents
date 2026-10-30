import type { Message } from '../../../../shared/v9'
import { activityNow, activitySummary } from '../../../../shared/activity'
import { ThinkingShimmer } from '@/components/ai/thinking-shimmer'
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceTitle } from '@/components/ui/trace'

/** Uma linha só por bloco de trabalho: o passo atual enquanto roda; depois, o resumo recolhido com a lista ao expandir. */
export function ActivitySummary({ activities, running, durationMs }: { activities: Message[]; running: boolean; durationMs?: number }) {
  const texts = activities.map(activity => activity.text)
  if (running) return <ThinkingShimmer role="status" className="my-1.5" label={activityNow(texts)} />
  return <Trace className="my-1.5 max-w-3xl">
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="w-fit max-w-full rounded-full py-1 text-left text-xs text-muted-foreground"><TraceTitle className="min-w-0 whitespace-normal break-words font-normal text-muted-foreground">{activitySummary(texts, durationMs)}</TraceTitle></TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <ul aria-label="Ações do agente" className="max-h-60 space-y-0.5 overflow-y-auto pr-2">
          {activities.map(activity => <li key={activity.id} className="truncate" title={activity.text.slice(0, 500)}>{activity.text.split('\n')[0]}</li>)}
        </ul>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  </Trace>
}
