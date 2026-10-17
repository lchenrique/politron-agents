import { useEffect, useRef, useState } from 'react'
import { FileEdit, Globe, Send, Settings2, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Approval } from '../../../../shared/v9'
import { DiffCard } from '../diff/DiffCard'
import { errorText } from '../app/appShellShared'

const approvalKind = {
  write: { title: 'Alteração de arquivo', icon: FileEdit },
  browser: { title: 'Ação no navegador', icon: Globe },
  command: { title: 'Comando no terminal', icon: Terminal },
  delegation: { title: 'Delegação do Chief', icon: Send },
  'agent-change': { title: 'Proposta do Chief', icon: Settings2 },
} as const

const statusLabel: Record<Approval['status'], string> = {
  pending: 'Aguardando sua decisão', approved: 'Aprovada', denied: 'Negada', interrupted: 'Interrompida',
}

/** Confirmação extra fica armada por esse tempo antes de voltar ao normal, pra não aprovar sem querer num clique tardio. */
const ARM_TIMEOUT_MS = 4000

export function PolitronToolApproval({ approval, onNotice }: { approval: Approval; onNotice: (text: string) => void }) {
  // A trava síncrona impede duplo envio mesmo antes do próximo render do React.
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(armTimer.current), [])

  const definition = approvalKind[approval.kind]
  const Icon = definition.icon
  const details = approval.details
  const sensitive = approval.kind === 'agent-change' || approval.kind === 'command' || (approval.kind === 'write' && Boolean(details.before))
  const pending = approval.status === 'pending'

  async function respond(approved: boolean) {
    if (!pending || lock.current) return
    lock.current = true
    setSubmitting(true)
    try {
      await window.appAPI.respondApproval(approval.id, approved)
      // Não assumir sucesso na interface: o evento do backend confirmará o estado.
    } catch (error) {
      lock.current = false
      setSubmitting(false)
      setArmed(false)
      onNotice(errorText(error))
    }
  }

  function onApprove() {
    if (!sensitive || armed) { void respond(true); return }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
  }

  const statusText = pending ? (submitting ? 'Enviando sua decisão…' : 'Aguardando sua decisão') : statusLabel[approval.status]

  return <section aria-label="Aprovação de ferramenta" className="min-w-0 space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{definition.title}</p>
          <p role="status" className="text-xs text-muted-foreground">{statusText}</p>
        </div>
        {approval.kind === 'write' && <p className="truncate font-mono text-xs text-muted-foreground">{details.path || '(caminho não fornecido)'}</p>}
        {approval.kind === 'browser' && <p className="text-xs text-muted-foreground">{details.action || 'Operação no navegador'}</p>}
        {approval.kind === 'command' && <p className="truncate font-mono text-xs text-muted-foreground">{details.command || ''}{details.cwd ? ` · ${details.cwd}` : ''}</p>}
        {approval.kind === 'delegation' && <p className="text-xs text-muted-foreground">Para {details.recipientName || 'agente'}: {(details.task || '(sem resumo)').slice(0, 160)}</p>}
        {approval.kind === 'agent-change' && <p className="text-xs text-muted-foreground">Alteração de configuração solicitada</p>}
      </div>
    </div>
    {details.task && <details className="rounded-md border border-border/60 p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">Ver tarefa e instruções propostas</summary>
      <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{details.task}</p>
    </details>}
    {details.proposal && <details className="rounded-md border border-border/60 p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">Ver configuração completa</summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
        {(() => { try { return JSON.stringify(JSON.parse(details.proposal), null, 2) } catch { return details.proposal } })()}
      </pre>
    </details>}
    {approval.kind === 'write' && details.path && details.after !== undefined && <DiffCard block={{
      filePath: details.path, originalContent: details.before || '', modifiedContent: details.after,
    }} />}
    {details.truncated && <p className="text-xs text-muted-foreground">Prévia limitada a 200 KB; examine o arquivo antes de aprovar.</p>}
    {pending && <div className="flex items-center justify-end gap-2 pt-1">
      {armed && <span className="mr-auto text-xs text-amber-600">Confirmação adicional obrigatória</span>}
      <Button variant="outline" size="sm" disabled={submitting} onClick={() => void respond(false)}>Negar</Button>
      <Button size="sm" variant={armed ? 'destructive' : 'default'} disabled={submitting} onClick={onApprove}>
        {armed ? 'Aprovar mesmo assim' : sensitive ? 'Confirmar e aprovar' : 'Aprovar'}
      </Button>
    </div>}
  </section>
}
