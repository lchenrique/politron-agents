import type { Agent, Approval } from '../../shared/v9'

/** Persisted per-agent mode; never relax administrative approvals. */
export function shouldAutoApprove(mode: Agent['approvalMode'], kind: Approval['kind'], forceAsk: boolean): boolean {
  if (kind === 'agent-change' || kind === 'delegation' || kind === 'question' || kind === 'plan') return false
  if (kind === 'command') return mode === 'bypass'
  if (forceAsk) return false
  return (kind === 'write' || kind === 'browser') && (mode === 'automatic' || mode === 'bypass')
}
