import type { Agent } from '../../shared/v9'

/** Acesso total: motor sem sandbox e sem perguntas, ferramentas nativas ligadas e nenhuma confirmação do Boobot. */
export const hasFullAccess = (agent: Pick<Agent, 'runtimePermissionMode'>) => agent.runtimePermissionMode === 'bypass'

export function codexRuntimePermissions(agent: Pick<Agent, 'runtimePermissionMode'>) {
  return agent.runtimePermissionMode === 'bypass'
    ? { sandbox: 'danger-full-access' as const, approvalPolicy: 'never' as const }
    : { sandbox: 'read-only' as const, approvalPolicy: 'on-request' as const }
}

export function claudeRuntimePermissions(agent: Pick<Agent, 'runtimePermissionMode'>) {
  return agent.runtimePermissionMode === 'bypass'
    ? { permissionMode: 'bypassPermissions' as const, allowDangerouslySkipPermissions: true as const }
    : { permissionMode: 'default' as const, allowDangerouslySkipPermissions: false as const }
}
