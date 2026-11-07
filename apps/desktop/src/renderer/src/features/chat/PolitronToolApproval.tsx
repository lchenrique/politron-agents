import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import type { Agent, Approval } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { DiffCard } from '../diff/DiffCard'
import { errorText } from '../app/appShellShared'
import { Avatar } from '../app/Avatar'
import { AgentInteractionCard } from './AgentInteractionCard'

/** Verbo do título ("Hermes quer …") e nome curto da ferramenta. */
const approvalKind = {
  write: { verb: 'alterar um arquivo', tool: 'Arquivo' },
  browser: { verb: 'usar o navegador', tool: 'Navegador' },
  command: { verb: 'executar um comando', tool: 'Terminal' },
  delegation: { verb: 'delegar uma tarefa', tool: 'Delegação' },
  'agent-change': { verb: 'mudar uma configuração', tool: 'Configuração' },
} as const

/** Confirmação extra fica armada por esse tempo antes de voltar ao normal, pra não aprovar sem querer num clique tardio. */
const ARM_TIMEOUT_MS = 4000

export function PolitronToolApproval({ approval, agent, onNotice, takeover = false }: { approval: Approval; agent?: Agent; onNotice: (text: string) => void; takeover?: boolean }) {
  // A trava síncrona impede duplo envio mesmo antes do próximo render do React.
  const lock = useRef(false)
  const keyboardScope = useRef<HTMLElement>(null)
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
    if (!takeover || !pending) return
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
  }, [onApprove, pending, respond, takeover])

  if (approval.kind === 'question' || approval.kind === 'plan') return <AgentInteractionCard approval={approval} onNotice={onNotice} />
  const definition = approvalKind[approval.kind]
  const booName = agent?.name || 'Boo'

  const statusText = pending ? (submitting ? 'Enviando sua decisão…' : 'Aguardando sua decisão') : approval.status === 'approved' ? 'Aprovada' : approval.status === 'denied' ? 'Negada' : 'Interrompida'

  // Resumo de uma linha do alvo; o conteúdo vem do agente e é exibido só como dado (texto), nunca interpretado.
  const summary = approval.kind === 'write' ? details.path || '(caminho não fornecido)'
    : approval.kind === 'browser' ? details.action || 'Operação no navegador'
    : approval.kind === 'command' ? details.command || '(comando vazio)'
    : approval.kind === 'delegation' ? `Para ${details.recipientName || 'agente'}: ${(details.task || '(sem resumo)').slice(0, 160)}`
    : details.action || 'Alteração de configuração solicitada'

  if (!pending) return <section aria-label="Aprovação de ferramenta"
    className="flex min-w-0 items-center gap-2 px-1 py-0.5 text-xs text-muted-foreground">
    <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
    <span role="status" className="shrink-0">{approval.details.alwaysAllowed ? 'Sempre permitida' : statusText}</span>
    <span aria-hidden>·</span>
    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={summary}>{summary}</span>
  </section>

  const hasMore = approval.kind === 'command' || canAlwaysAllow || Boolean(details.task || details.proposal || details.cwd || details.truncated)
  const approveLabel = armed ? 'Aprovar mesmo assim' : 'Aprovar'

  return <section ref={keyboardScope} aria-label="Aprovação de ferramenta" aria-busy={submitting || undefined} data-slot="approval-card"
    className={`min-w-0 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-[13px] leading-5 text-foreground${takeover ? ' shadow-sm' : ''}`}>
    <div className="flex min-w-0 items-center gap-2">
      <Avatar agent={agent} size="xxs" state="waiting" />
      <p className="min-w-0 flex-1 truncate"><span className="font-medium">{booName}</span> <span className="text-muted-foreground">quer {definition.verb}</span></p>
      <span className="shrink-0 text-xs text-muted-foreground">{definition.tool}</span>
    </div>
    <code className="mt-2 block min-w-0 truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[12px] font-normal leading-5 text-foreground" title={summary}>{summary}</code>
    {approval.kind === 'write' && details.path && details.after !== undefined && <div className="mt-2"><DiffCard block={{
      filePath: details.path, originalContent: details.before || '', modifiedContent: details.after,
    }} /></div>}
    {hasMore && <details className="group mt-1.5 text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3 transition-transform group-open:rotate-90" />Detalhes
      </summary>
      <div className="mt-1.5 space-y-1.5 border-l border-border/70 pl-3">
        {approval.kind === 'command' && <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] text-foreground">{details.command}</pre>}
        {details.cwd && <p>Pasta: <span className="break-all font-mono text-[11.5px]">{details.cwd}</span></p>}
        {approval.kind === 'command' && <p>O terminal não é isolado do sistema operacional. Comandos podem acessar arquivos fora do workspace.</p>}
        {details.task && <p className="whitespace-pre-wrap break-words">{details.task}</p>}
        {details.proposal && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
          {(() => { try { return JSON.stringify(JSON.parse(details.proposal), null, 2) } catch { return details.proposal } })()}
        </pre>}
        {details.truncated && <p>Prévia limitada a 200 KB; examine o arquivo antes de aprovar.</p>}
        {canAlwaysAllow && <p>“Sempre permitir” memoriza esta regra ({approval.kind === 'write' ? `alterações em ${details.path}` : approval.kind === 'command' ? 'este comando exato' : 'esta ação idêntica'}) para o agente e workspace atuais. Revogue nas permissões do agente.</p>}
      </div>
    </details>}
    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
      <span aria-live="polite" role="status" className={`mr-auto min-w-0 truncate text-xs ${armed ? 'text-warning' : 'text-muted-foreground'}`}>
        {armed ? 'Confirmação adicional obrigatória' : takeover && !submitting ? 'Enter aprova · Esc nega' : statusText}
      </span>
      {canAlwaysAllow && <Button size="sm" variant="ghost" disabled={submitting} onClick={onAlwaysAllow} className="h-7 rounded-md px-2.5 text-xs text-muted-foreground">
        {armed ? 'Confirmar e sempre permitir' : 'Sempre permitir'}
      </Button>}
      <Button size="sm" variant="ghost" disabled={submitting} onClick={() => void respond(false)} className="h-7 rounded-md px-2.5 text-xs">Negar</Button>
      <Button size="sm" disabled={submitting} onClick={onApprove} className="h-7 rounded-md px-3 text-xs">{approveLabel}</Button>
    </div>
  </section>
}
