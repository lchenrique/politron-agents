/**
 * Security boundary for the future browser/PWA gateway.
 * Electron host pairing is NOT a browser session; browser callers receive
 * short-lived, explicitly scoped capabilities before any RPC is forwarded.
 *
 * This module has no Node/Electron dependencies so the gateway and PWA can
 * share the policy without bundling host code into the browser.
 */
export const PWA_METHOD_CAPABILITIES = {
  'v9:snapshot': 'read',
  'v9:boardSnapshot': 'read',
  'v9:models': 'read',
  'v9:history': 'read',
  'v9:historyPage': 'read',
  'v9:historyAround': 'read',
  'v9:searchHistory': 'read',
  'v9:workspaceDiff': 'read',
  'v9:listProjectFiles': 'files:read',
  'v9:voiceStatus': 'read',

  'v9:send': 'chat',
  'v9:cancelQueuedMessage': 'chat',
  'v9:sendQueuedNow': 'chat',
  'v9:stop': 'chat',
  'v9:respondToAgent': 'chat',
  'v9:saveConversation': 'chat',
  'v9:sidebarLayout': 'read',
  'v9:saveSidebarLayout': 'chat',
  'v9:voiceSpeak': 'chat',
  'v9:voiceTranscribe': 'chat',

  'v9:respondApproval': 'approvals',
  'v9:reviewPlan': 'approvals',
  'v9:approvalGrants': 'approvals',
  'v9:removeApprovalGrant': 'approvals',
  'v9:answerQuestion': 'approvals',

  'v9:readProjectFile': 'files:read',
  'v9:writeProjectFile': 'files:write',
  'v9:cancelDelegation': 'chat',
  'v9:startMission': 'chat',
  'v9:missionAction': 'chat',
} as const

export type PwaCapability = typeof PWA_METHOD_CAPABILITIES[keyof typeof PWA_METHOD_CAPABILITIES]
export type PwaMethod = keyof typeof PWA_METHOD_CAPABILITIES
export const PWA_READ_ONLY = ['read'] as const satisfies readonly PwaCapability[]

export function assertPwaRpcAuthorized(
  method: string,
  args: unknown,
  grants: readonly PwaCapability[],
): asserts args is unknown[] {
  if (!Object.prototype.hasOwnProperty.call(PWA_METHOD_CAPABILITIES, method)) {
    throw new Error('Este método não está disponível para a PWA.')
  }
  if (!Array.isArray(args) || args.length > 12) {
    throw new Error('Parâmetros remotos inválidos.')
  }
  const capability = PWA_METHOD_CAPABILITIES[method as PwaMethod]
  if (!grants.includes(capability)) {
    throw new Error('Permissão da sessão PWA insuficiente.')
  }
}
