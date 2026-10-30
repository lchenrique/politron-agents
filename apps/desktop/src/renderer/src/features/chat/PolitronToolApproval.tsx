import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileEdit, Globe, Send, Settings2, Terminal } from 'lucide-react'
import type { Approval } from '../../../../shared/v9'
import { DiffCard } from '../diff/DiffCard'
import { errorText } from '../app/appShellShared'
import { ApprovalCard } from '@/components/ai/approval-card'
import { AgentInteractionCard } from './AgentInteractionCard'
import styles from '../composer/ComposerTakeover.module.css'

const approvalKind = {
  write: { title: 'Alteração de arquivo', icon: FileEdit },
  browser: { title: 'Ação no navegador', icon: Globe },
  command: { title: 'Comando no terminal', icon: Terminal },
  delegation: { title: 'Delegação do Chief', icon: Send },
  'agent-change': { title: 'Confirmação do Chief', icon: Settings2 },
} as const

/** Confirmação extra fica armada por esse tempo antes de voltar ao normal, pra não aprovar sem querer num clique tardio. */
const ARM_TIMEOUT_MS = 4000

export function PolitronToolApproval({ approval, onNotice, canApprove = true, takeover = false }: { approval: Approval; onNotice: (text: string) => void; canApprove?: boolean; takeover?: boolean }) {
  // A trava síncrona impede duplo envio mesmo antes do próximo render do React.
  const lock = useRef(false)
  const keyboardScope = useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(armTimer.current), [])

  const details = approval.details
  const sensitive = approval.kind === 'agent-change' || approval.kind === 'command' || (approval.kind === 'write' && Boolean(details.before))
  const pending = approval.status === 'pending'

  const respond = useCallback(async (approved: boolean, alwaysAllow = false) => {
    if (!pending || lock.current) return
    lock.current = true
    setSubmitting(true)
    try {
      if (alwaysAllow) await window.appAPI.respondApproval(approval.id, approved, true)
      else await window.appAPI.respondApproval(approval.id, approved)
      // Não assumir sucesso na interface: o evento do backend confirmará o estado.
    } catch (error) {
      lock.current = false
      setSubmitting(false)
      setArmed(false)
      onNotice(errorText(error))
    }
  }, [approval.id, onNotice, pending])

  const onApprove = useCallback(() => {
    if (lock.current) return
    if (!sensitive || armed) { void respond(true); return }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
  }, [armed, respond, sensitive])
  const canAlwaysAllow = ['write', 'browser', 'command'].includes(approval.kind) && !details.desktopOnly
  const onAlwaysAllow = useCallback(() => {
    if (lock.current || !canAlwaysAllow) return
    if (!sensitive || armed) { void respond(true, true); return }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
  }, [armed, canAlwaysAllow, respond, sensitive])

  useEffect(() => {
    if (!takeover || !pending || !canApprove) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return
      const scope = keyboardScope.current
      const active = document.activeElement
      if (!scope || (active !== document.body && active !== document.documentElement && !scope.contains(active))) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Enter') onApprove()
      else void respond(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canApprove, onApprove, pending, respond, takeover])

  if (approval.status === 'pending' && !canApprove) return <section role="status" className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">Ação aguardando aprovação. Libere aprovações para este dispositivo no Boobot do host.</section>
  if (approval.kind === 'question' || approval.kind === 'plan') return <AgentInteractionCard approval={approval} onNotice={onNotice} />
  const definition = approvalKind[approval.kind]

  const statusText = pending ? (submitting ? 'Enviando sua decisão…' : 'Aguardando sua decisão') : approval.status === 'approved' ? 'Aprovada' : approval.status === 'denied' ? 'Negada' : 'Interrompida'

  const description = approval.kind === 'write' ? details.path || '(caminho não fornecido)'
    : approval.kind === 'browser' ? details.action || 'Operação no navegador'
    : approval.kind === 'command' ? `${details.command || ''}${details.cwd ? ` · ${details.cwd}` : ''}`
    : approval.kind === 'delegation' ? `Para ${details.recipientName || 'agente'}: ${(details.task || '(sem resumo)').slice(0, 160)}`
    : details.action || 'Alteração de configuração solicitada'
  const options = pending ? [
    { label: armed ? 'Aprovar mesmo assim' : sensitive ? takeover ? 'Confirmar e permitir' : 'Confirmar e aprovar' : takeover ? 'Permitir uma vez' : 'Aprovar', value: 'approve', description: armed ? 'Confirmação adicional obrigatória' : undefined },
    ...(canAlwaysAllow ? [{ label: armed ? 'Confirmar e sempre permitir' : 'Sempre permitir', value: 'always', description: approval.kind === 'write' ? `Alterações em ${details.path}` : approval.kind === 'command' ? 'Este comando exato' : 'Esta ação idêntica' }] : []),
    { label: takeover ? 'Rejeitar' : 'Negar', value: 'deny' },
  ] : []

  if (!pending) return <section aria-label="Aprovação de ferramenta"
    className="flex min-w-0 items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2.5 py-1.5 text-xs text-muted-foreground">
    <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
    <span className="shrink-0 font-medium text-foreground">{definition.title}</span>
    <span className="min-w-0 flex-1 truncate" title={description}>{description}</span>
    <span role="status" className="shrink-0">{approval.details.alwaysAllowed ? 'Sempre permitida' : statusText}</span>
  </section>

  return <div ref={takeover ? keyboardScope : undefined} className={takeover ? 'contents' : undefined}>
  <ApprovalCard aria-label="Aprovação de ferramenta" className={takeover ? styles.approvalCard : 'min-w-0 border border-border/60 !rounded-lg !p-3 shadow-none'} title={definition.title} description={description}
    status={pending ? 'pending' : approval.status === 'approved' ? 'approved' : approval.status === 'denied' ? 'denied' : 'interrupted'}
    disabled={submitting}
    options={options} onDecision={value => value === 'approve' ? onApprove() : value === 'always' ? onAlwaysAllow() : void respond(false)}>
    <div aria-live="polite" role="status" className="mt-2 text-xs text-muted-foreground">{statusText}</div>
    {approval.kind === 'command' && <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Permissões deste comando</summary>
      <p className="mt-1">O terminal não é isolado do sistema operacional. Comandos podem acessar arquivos fora do workspace.</p>
    </details>}
    {canAlwaysAllow && pending && <p className="text-xs text-muted-foreground">“Sempre permitir” memoriza esta regra para o agente e workspace atuais. Revogue nas permissões do agente.</p>}
    {details.task && <details className="rounded-md border border-border/60 p-2.5 text-xs">
      <summary className="cursor-pointer font-medium">{approval.kind === 'agent-change' ? 'Ver detalhes' : 'Ver tarefa e instruções propostas'}</summary>
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
    {submitting && <p className="mt-3 text-xs text-muted-foreground">Enviando sua decisão…</p>}
  </ApprovalCard>
  </div>
}
