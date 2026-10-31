import type { Agent } from '../../shared/v9'

export interface RuntimeAccessScope { planMode?: boolean; boardReview?: boolean }

/** A restrição do turno prevalece sobre Acesso total, sem modificar o perfil salvo. */
export function effectiveRuntimeAgent<T extends Pick<Agent, 'runtimePermissionMode'>>(agent: T, scope: RuntimeAccessScope): T {
  return scope.planMode || scope.boardReview ? { ...agent, runtimePermissionMode: 'managed' } : agent
}

/** Acesso total só habilita ferramentas nativas em turnos de execução. */
export const hasFullAccess = (agent: Pick<Agent, 'runtimePermissionMode'>) => agent.runtimePermissionMode === 'bypass'

export function codexRuntimePermissions(agent: Pick<Agent, 'runtimePermissionMode'>) {
  return hasFullAccess(agent)
    ? { sandbox: 'danger-full-access' as const, approvalPolicy: 'never' as const }
    : { sandbox: 'read-only' as const, approvalPolicy: 'on-request' as const }
}

export function claudeRuntimePermissions(agent: Pick<Agent, 'runtimePermissionMode'>) {
  return hasFullAccess(agent)
    ? { permissionMode: 'bypassPermissions' as const, allowDangerouslySkipPermissions: true as const }
    : { permissionMode: 'default' as const, allowDangerouslySkipPermissions: false as const }
}
