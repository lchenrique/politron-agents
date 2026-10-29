import { useRef, useState } from 'react'
import type { Approval } from '../../../../shared/v9'
import { FollowUpSuggestions } from '@/components/ai/follow-up-suggestions'
import { PlanApprovalCard } from '@/components/ai/plan-approval-card'
import { errorText } from '../app/appShellShared'
import takeoverStyles from '../composer/ComposerTakeover.module.css'

/** Persisted plan and question tool results live alongside the related agent message. */
export function AgentInteractionCard({ approval, onNotice, takeover = false }: {
  approval: Approval; onNotice: (message: string) => void; takeover?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  if (approval.kind === 'plan') {
    return <PlanApprovalCard title={approval.details.planTitle || 'Plano de implementação'}
      steps={(approval.details.planSteps || []).map((label, index) => ({ id: String(index), label }))}
      className="w-full max-w-xl border border-border/60 shadow-none" />
  }
  if (approval.kind !== 'question') return null
  const pending = approval.status === 'pending'
  const options = (approval.details.options || []).map((label, index) => ({
    id: String(index), label,
  }))
  const answer = async (value: string) => {
    if (!pending || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await window.appAPI.answerQuestion(approval.id, value)
    } catch (error) {
      locked.current = false
      setBusy(false)
      onNotice(errorText(error))
    }
  }
  if (!pending) return <section aria-label="Pergunta do Boo" className="rounded-xl border border-border/60 bg-card p-3 text-sm">
    <p className="font-medium">{approval.details.question}</p>
    <p className="mt-1 text-xs text-muted-foreground">Resposta: {approval.details.answer || 'Interrompida'}</p>
  </section>
  return <div aria-label="Pergunta do Boo" className={takeover ? takeoverStyles.questionCard : 'max-w-xl rounded-xl border border-border/60 bg-card p-2'} aria-busy={busy}>
    <FollowUpSuggestions
      title={approval.details.question || 'Escolha uma opção'}
      items={[...options, { id: 'custom', label: 'Outra resposta', custom: true, placeholder: 'Escreva sua resposta' }]}
      submitLabel="Enviar resposta"
      onSelect={(id, value) => void answer(id === 'custom' ? value || '' : options[Number(id)]?.label || '')}
    />
    {busy && <p role="status" className="px-2 text-xs text-muted-foreground">Enviando resposta…</p>}
  </div>
}
