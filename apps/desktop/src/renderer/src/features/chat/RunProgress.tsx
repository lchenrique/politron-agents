import type { Message } from '../../../../shared/v9'

/** Linha de status compacta, sem lib externa: um ponto pulsando enquanto o agente trabalha, nada quando termina ou está só na fila. */
export function RunProgress({ status, agentName }: {
  status: Message['status']
  agentName: string
}) {
  if (status === 'running') return <p role="status" className="my-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
    <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
    {agentName} está respondendo…
  </p>
  if (status === 'failed') return <p role="status" className="my-1.5 text-xs text-destructive">Execução falhou</p>
  return null
}
