import type { Agent, Approval } from '../../shared/v9'

/** Bypass dispensa confirmações de ferramentas; perguntas humanas continuam interativas. */
export function shouldAutoApprove(mode: Agent['approvalMode'], kind: Approval['kind'], forceAsk: boolean): boolean {
  if (kind === 'question' || kind === 'plan') return false
  if (mode === 'bypass') return true
  if (kind === 'agent-change' || kind === 'delegation' || kind === 'command') return false
  if (forceAsk) return false
  return (kind === 'write' || kind === 'browser') && mode === 'automatic'
}
