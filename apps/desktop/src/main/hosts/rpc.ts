import type { RemoteEvent, RpcHandler } from './wire'
import { assertPwaRpcAuthorized, type PwaCapability } from '../../shared/pwa-host-policy'

// Lista explícita: pareamento não expõe IPC arbitrário nem ações da janela local.
const METHODS = new Set([
  'snapshot', 'saveAgent', 'saveAssistantPreferences', 'saveTerminalAccess', 'saveConversation', 'saveWorkspace',
  'createWorktree', 'archiveWorkspace', 'deleteWorkspace', 'deleteConversation', 'deleteAgent', 'workspaceDiff',
  'listProjectFiles', 'readProjectFile', 'writeProjectFile', 'respondApproval', 'setVisibleConversation', 'getVisibleConversation',
  'respondToAgent', 'history', 'historyPage', 'searchHistory', 'historyAround', 'send', 'stop', 'cancelDelegation', 'models',
  'openRouterDecisionStatus', 'saveOpenRouterDecisionModel', 'browserFrames', 'browserControl', 'browserAction',
  // Somente o desktop pareado lista/para PTYs de agentes; a PWA não tem capacidade para estes métodos.
  'agentTerminalSessions', 'agentTerminalStop',
].map(method => `v9:${method}`).concat(['providers:list', 'providers:refresh', 'providers:detect', 'skills:list', 'skills:readContent', 'hosts:browse']))

export class HostRpc {
  private readonly handlers = new Map<string, (...args: never[]) => unknown>()
  register(method: string, handler: (...args: never[]) => unknown): void { if (METHODS.has(method)) this.handlers.set(method, handler) }
  readonly dispatch: RpcHandler = (method, args) => {
    const handler = this.handlers.get(method)
    if (!METHODS.has(method) || !handler) throw new Error('Esta operação não está disponível no host remoto.')
    return handler(...args as never[])
  }
  supports(method: string): boolean { return METHODS.has(method) }
  /** Browser gateway must call this instead of dispatch; the desktop transport remains unchanged. */
  dispatchFromPwa(method: string, args: unknown[], grants: readonly PwaCapability[]): unknown {
    assertPwaRpcAuthorized(method, args, grants)
    return this.dispatch(method, args)
  }
}

export interface HostRouting {
  readonly remote: boolean
  register(method: string, handler: (...args: never[]) => unknown): void
  invoke(method: string, args: unknown[], local: () => unknown, sender?: Electron.WebContents): unknown
  publish(event: RemoteEvent): boolean
}
