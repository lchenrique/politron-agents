import type { Message } from '../../../../shared/v9'
import { Trace, TraceLine, TraceTitle } from '@/components/ui/trace'
import { ThinkingShimmer } from '@/components/ai/thinking-shimmer'

/** Linha de status compacta, sem lib externa: um ponto pulsando enquanto o agente trabalha, nada quando termina ou está só na fila. */
export function RunProgress({ status, agentName }: {
  status: Message['status']
  agentName: string
}) {
  if (status === 'running') return <ThinkingShimmer role="status" className="my-1.5" label={`${agentName} está trabalhando…`} />
  if (status === 'failed') return <Trace role="status" className="my-1.5"><TraceLine status="error"><TraceTitle>Execução falhou</TraceTitle></TraceLine></Trace>
  return null
}
