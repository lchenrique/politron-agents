import type { RemoteEvent, RpcHandler } from './wire'

// Lista explícita: pareamento não expõe IPC arbitrário nem ações da janela local.
const METHODS = new Set([
  'snapshot', 'saveAgent', 'saveAssistantPreferences', 'saveTerminalAccess', 'saveConversation', 'saveWorkspace',
  'createWorktree', 'archiveWorkspace', 'deleteWorkspace', 'deleteConversation', 'deleteAgent', 'workspaceDiff',
  'listProjectFiles', 'readProjectFile', 'writeProjectFile', 'respondApproval', 'setVisibleConversation', 'getVisibleConversation',
  'respondToAgent', 'history', 'historyPage', 'searchHistory', 'historyAround', 'send', 'stop', 'cancelDelegation', 'models',
  'openRouterDecisionStatus', 'saveOpenRouterDecisionModel', 'browserFrames', 'browserControl', 'browserAction',
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
}

export interface HostRouting {
  readonly remote: boolean
  register(method: string, handler: (...args: never[]) => unknown): void
  invoke(method: string, args: unknown[], local: () => unknown, sender?: Electron.WebContents): unknown
  publish(event: RemoteEvent): boolean
}
