import { useMemo } from 'react'
import AILoadingState, { type AgentStep } from '@/components/kokonutui/ai-loading'
import AITextLoading from '@/components/kokonutui/ai-text-loading'
import type { Message } from '../../../../shared/v9'

export function RunProgress({ status, agentName, hasText }: {
  status: Message['status']
  agentName: string
  hasText: boolean
}) {
  const steps = useMemo<AgentStep[]>(() => status === 'running'
    ? [{ id: 'runtime', label: agentName + ' está executando a tarefa', status: 'running' }]
    : status === 'failed'
      ? [{ id: 'runtime', label: 'Execução falhou', status: 'error' }]
      : [], [status, agentName])

  if (!steps.length) return null

  return <section aria-label="Estado de execução do agente" className="my-2 min-w-0 max-w-sm rounded-lg border border-border/60 bg-card/35 px-3 py-2">
    <AILoadingState steps={steps} collapseWhenDone={false} className="!justify-start" />
    {status === 'running' && !hasText && <AITextLoading
      texts={['Aguardando resposta do agente']}
      label="Aguardando resposta do agente"
      className="!justify-start !text-xs !font-normal !text-muted-foreground"
    />}
  </section>
}
