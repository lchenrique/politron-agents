import { useRef, useState } from 'react'
import type { Approval } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'
import styles from './PlanReviewTakeover.module.css'

export function PlanReviewTakeover({ approval, onNotice }: { approval: Approval; onNotice: (message: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [requestingChanges, setRequestingChanges] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const steps = approval.details.planSteps || []
  const stepsId = `plan-review-${approval.id}-steps`

  const decide = async (decision: 'approve' | 'reject' | 'request_changes', value?: string) => {
    if (approval.status !== 'pending' || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await window.appAPI.reviewPlan(approval.id, decision, value)
    } catch (error) {
      locked.current = false
      setBusy(false)
      onNotice(errorText(error))
    }
  }

  const submitChanges = () => {
    const note = feedback.trim()
    if (!note) {
      setFeedbackError('Descreva o que deve mudar no plano.')
      return
    }
    setFeedbackError('')
    void decide('request_changes', note)
  }

  return <section className={styles.panel} aria-label="Revisão do plano" aria-busy={busy}>
    <div className={styles.banner}><span aria-hidden="true" className={styles.dot} /> Aguardando sua revisão do plano</div>
    <div className={styles.body}>
      <div className={styles.heading}>
        <div>
          <h2>{approval.details.planTitle || 'Plano de implementação'}</h2>
          <p>Revise as etapas antes de decidir. Aprovar não inicia alterações neste modo.</p>
        </div>
        <button type="button" className={`${styles.actionButton} ${styles.smallButton}`} aria-expanded={expanded} aria-controls={stepsId}
          onClick={() => setExpanded(value => !value)} disabled={busy}>
          {expanded ? 'Ocultar plano' : 'Ver plano completo'}
        </button>
      </div>
      {expanded && <div id={stepsId} className={styles.steps}>
        {steps.length ? <ol>{steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
          : <p className={styles.empty}>O agente não registrou etapas neste plano.</p>}
      </div>}
      {requestingChanges && <div className={styles.feedback}>
        <label htmlFor={`${stepsId}-feedback`}>O que precisa mudar?</label>
        <textarea id={`${stepsId}-feedback`} value={feedback} maxLength={2000} rows={3}
          aria-invalid={Boolean(feedbackError)} aria-describedby={feedbackError ? `${stepsId}-error` : undefined}
          onChange={event => { setFeedback(event.target.value); if (feedbackError) setFeedbackError('') }} />
        {feedbackError && <p id={`${stepsId}-error`} role="alert">{feedbackError}</p>}
        <div className={styles.feedbackActions}>
          <button type="button" className={styles.actionButton} disabled={busy} onClick={() => { setRequestingChanges(false); setFeedbackError('') }}>Cancelar</button>
          <button type="button" className={`${styles.actionButton} ${styles.primaryButton}`} disabled={busy} onClick={submitChanges}>Enviar pedido de mudanças</button>
        </div>
      </div>}
      {!requestingChanges && <div className={styles.actions}>
        <button type="button" className={styles.actionButton} disabled={busy} onClick={() => void decide('reject')}>Recusar</button>
        <button type="button" className={styles.actionButton} disabled={busy} onClick={() => setRequestingChanges(true)}>Pedir mudanças</button>
        <button type="button" className={`${styles.actionButton} ${styles.primaryButton}`} disabled={busy || steps.length === 0} onClick={() => void decide('approve')}>Aprovar</button>
      </div>}
    </div>
  </section>
}
