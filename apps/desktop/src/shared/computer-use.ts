/** Computer Use: o Boo controla o Windows pelo cua-driver (trycua/cua, MIT). Tipos compartilhados entre main e renderer. */
export const CUA_DRIVER_URL = 'https://github.com/trycua/cua'
/** Runtimes que aceitam servidores MCP por sessão; os demais ficam sem Computer Use. */
export const COMPUTER_USE_RUNTIMES = ['codex', 'claude'] as const

export interface ComputerUseDriverStatus {
  state: 'installed' | 'missing' | 'invalid'
  version?: string
  path?: string
  source?: 'boobot' | 'cua' | 'openbot'
  error?: string
  instructions?: string
}
export interface ComputerUseRuntimeStatus { runtime: string; supported: boolean; note: string }
export interface ComputerUseGrant { conversationId: string; agentId: string; conversationTitle: string; agentName: string }
export interface ComputerUseStatus { driver: ComputerUseDriverStatus; runtimes: ComputerUseRuntimeStatus[]; grants: ComputerUseGrant[] }
export interface ComputerUseAPI {
  status(): Promise<ComputerUseStatus>
  /** Revoga a autorização de uma conversa+Boo; as chamadas seguintes do driver são recusadas. */
  revoke(conversationId: string, agentId: string): Promise<ComputerUseStatus>
}
