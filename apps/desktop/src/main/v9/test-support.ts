import type { AppService } from './workspace'
import type { ClaudeRuntime } from './claude'
import type { CodexRuntime } from './codex'

// Contratos restritos dos membros privados exercitados pelos testes.
// Fixtures parciais atravessam unknown explicitamente, sem ampliar a API pública.
export type RunContext = Parameters<AppService['execute']>[0]
export interface ServiceInternals {
  execute: AppService['execute']
  finish: AppService['finish']
  contexts: AppService['contexts']
  callTool(context: unknown, name: string, args: Record<string, unknown>, callId?: string): Promise<unknown>
  requestApproval: AppService['requestApproval']
  delegate(parent: unknown, ...args: Tail<Parameters<AppService['delegate']>>): ReturnType<AppService['delegate']>
}
type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never
export interface ClaudeInternals {
  executable: ClaudeRuntime['executable']
  threads: ClaudeRuntime['threads']
  waits: ClaudeRuntime['waits']
}
export interface CodexInternals {
  pending: CodexRuntime['pending']
  receive: CodexRuntime['receive']
}
export interface RuntimeEvent {
  id: string | number
  method: string
  params: {
    delta?: string
    turn?: { status: string; error: { message: string } }
    item?: { type: string; id: string }
  }
}
