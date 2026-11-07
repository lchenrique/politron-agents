import type { Agent, Approval } from '../../../../shared/v9'
import { AgentInteractionCard } from '../chat/AgentInteractionCard'
import { PolitronToolApproval } from '../chat/PolitronToolApproval'
import { PlanReviewTakeover } from './PlanReviewTakeover'
import styles from './ComposerTakeover.module.css'

export function ComposerTakeover({ approval, agent, delegated = false, onNotice }: {
  approval: Approval
  agent?: Agent
  /** A pendência é de uma conversa delegada: o líder a repassa aqui e diz para quem é. */
  delegated?: boolean
  onNotice: (message: string) => void
}) {
  if (approval.status !== 'pending') return null

  return <div className={styles.dock}>
    <div className={styles.column}>
      {delegated && <p role="status" className={styles.relayStatus}>
        <span aria-hidden className={styles.relayDot} />Aguardando sua {approval.kind === 'question' ? 'resposta' : 'aprovação'} para {agent?.name || 'um Boo'}
      </p>}
      {approval.kind === 'plan' ? <PlanReviewTakeover approval={approval} onNotice={onNotice} />
        : approval.kind === 'question' ? <section aria-label="Resposta necessária" className={styles.questionPanel}>
        <p className={styles.questionStatus}>Aguardando sua resposta</p>
        <AgentInteractionCard approval={approval} onNotice={onNotice} takeover />
      </section> : <PolitronToolApproval key={approval.id} approval={approval} agent={agent} onNotice={onNotice} takeover />}
    </div>
  </div>
}
