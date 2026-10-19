import type { Message } from '../../../../shared/v9'
import { Trace, TraceLine, TraceTitle } from '@/components/ui/trace'

/** Linha de status compacta, sem lib externa: um ponto pulsando enquanto o agente trabalha, nada quando termina ou está só na fila. */
export function RunProgress({ status, agentName }: {
  status: Message['status']
  agentName: string
}) {
  if (status === 'running') return <Trace role="status" className="my-1.5"><TraceLine status="running"><TraceTitle>{agentName} está trabalhando…</TraceTitle></TraceLine></Trace>
  if (status === 'failed') return <Trace role="status" className="my-1.5"><TraceLine status="error"><TraceTitle>Execução falhou</TraceTitle></TraceLine></Trace>
  return null
}
