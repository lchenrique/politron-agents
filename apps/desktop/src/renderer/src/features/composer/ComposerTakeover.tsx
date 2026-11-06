import type { Approval } from '../../../../shared/v9'
import { AgentInteractionCard } from '../chat/AgentInteractionCard'
import { PolitronToolApproval } from '../chat/PolitronToolApproval'
import { PlanReviewTakeover } from './PlanReviewTakeover'
import styles from './ComposerTakeover.module.css'

export function ComposerTakeover({ approval, onNotice }: {
  approval: Approval
  onNotice: (message: string) => void
}) {
  if (approval.status !== 'pending') return null

  return <div className={styles.dock}>
    <div className={styles.column}>
      {approval.kind === 'plan' ? <PlanReviewTakeover approval={approval} onNotice={onNotice} />
        : approval.kind === 'question' ? <section aria-label="Resposta necessária" className={styles.questionPanel}>
        <p className={styles.questionStatus}>Aguardando sua resposta</p>
        <AgentInteractionCard approval={approval} onNotice={onNotice} takeover />
      </section> : <PolitronToolApproval key={approval.id} approval={approval} onNotice={onNotice} takeover />}
    </div>
  </div>
}
