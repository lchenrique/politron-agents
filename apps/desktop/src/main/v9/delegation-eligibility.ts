import type { Agent } from '../../shared/v9'

export type DelegationEligibilityContext = {
  agentId: string
  role?: Agent['role']
  workspaceId: string
  eligibleAgentIds: Iterable<string>
  ancestry: string[]
  maxDepth?: number
}

export type DelegationEligibility = { canDelegate: boolean; reason?: string }

export function delegationEligibility(context: DelegationEligibilityContext, candidate: Agent): DelegationEligibility {
  if (candidate.id === context.agentId) return { canDelegate: false, reason: 'O agente não pode delegar para si mesmo.' }
  if (candidate.temporaryStatus === 'retired') return { canDelegate: false, reason: 'O agente foi aposentado.' }
  const isWorkspaceTemporary = candidate.temporary === true && candidate.temporaryWorkspaceId === context.workspaceId
  if (candidate.temporary && !isWorkspaceTemporary) return { canDelegate: false, reason: 'O agente temporário pertence a outro workspace.' }
  if (candidate.temporary && candidate.temporaryStatus !== 'available') return { canDelegate: false, reason: 'O agente temporário já está ocupado.' }
  if (context.ancestry.includes(candidate.id)) return { canDelegate: false, reason: 'A delegação criaria um ciclo de agentes.' }
  if (context.ancestry.length >= (context.maxDepth ?? 4)) return { canDelegate: false, reason: 'A delegação atingiu o limite de profundidade.' }

  const isTeamMember = new Set(context.eligibleAgentIds).has(candidate.id)
  const mayDelegateOutsideTeam = context.role !== 'chief' && !candidate.temporary
  if (!isTeamMember && !isWorkspaceTemporary && !mayDelegateOutsideTeam) {
    return { canDelegate: false, reason: 'O agente não está na equipe desta conversa ou do workspace.' }
  }
  return { canDelegate: true }
}
