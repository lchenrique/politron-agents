import type { Agent } from '../../shared/v9'

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
