import { useRef, useState } from 'react'
import AIToolApproval, { type ToolCall, type ToolCallState } from '@/components/kokonutui/ai-tool-approval'
import type { Approval } from '../../../../shared/v9'
import { DiffCard } from '../diff/DiffCard'
import { errorText } from '../app/appShellShared'

const approvalKind = {
  write: { title: 'Alteração de arquivo', tool: 'workspace_write' },
  browser: { title: 'Ação no navegador', tool: 'browser_action' },
  delegation: { title: 'Delegação do Chief', tool: 'chief_delegate' },
  'agent-change': { title: 'Proposta do Chief', tool: 'chief_change' },
} as const

const approvalState: Record<Approval['status'], ToolCallState> = {
  pending: 'approval-requested',
  approved: 'approval-approved',
  denied: 'output-denied',
  interrupted: 'approval-interrupted',
}

export function PolitronToolApproval({ approval, onNotice }: { approval: Approval; onNotice: (text: string) => void }) {
  // A trava síncrona impede duplo envio mesmo antes do próximo render do React.
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const definition = approvalKind[approval.kind]
  const details = approval.details
  const sensitive = approval.kind === 'agent-change' || (approval.kind === 'write' && Boolean(details.before))
  const input: ToolCall['input'] = approval.kind === 'write'
    ? { Arquivo: details.path || '(caminho não fornecido)' }
    : approval.kind === 'browser'
      ? details.action || 'Operação no navegador'
      : approval.kind === 'delegation'
        ? { Destinatário: details.recipientName || 'Agente', Tarefa: (details.task || '(sem resumo)').slice(0, 160) }
        : 'Alteração de configuração solicitada'

  const call: ToolCall = {
    id: approval.id,
    tool: definition.tool,
    title: definition.title,
    input,
    destructive: sensitive,
    state: approval.status === 'pending' && submitting ? 'approval-responded' : approvalState[approval.status],
  }

  async function respond(id: string, approved: boolean) {
    if (id !== approval.id || approval.status !== 'pending' || lock.current) return
    lock.current = true
    setSubmitting(true)
    try {
      await window.appAPI.respondApproval(approval.id, approved)
      // Não assumir sucesso na interface: o evento do backend confirmará o estado.
    } catch (error) {
      lock.current = false
      setSubmitting(false)
      onNotice(errorText(error))
    }
  }

  return <section aria-label="Aprovação de ferramenta" className="min-w-0 space-y-2">
    <p className="px-2 text-xs text-muted-foreground" role="status">{approval.status === "pending" ? submitting ? "Enviando sua decisão…" : "Aguardando sua decisão" : approval.status === "approved" ? "Aprovada" : approval.status === "denied" ? "Negada" : "Interrompida"}</p>
    <AIToolApproval calls={[call]} onRespond={(id, approved) => void respond(id, approved)} />
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
  </section>
}
