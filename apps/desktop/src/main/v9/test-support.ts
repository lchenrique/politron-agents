import type { AppService } from './workspace'
import type { ClaudeRuntime } from './claude'
import type { HeadlessCliRuntime } from './headless-cli'
import type { OpenCodeServerRuntime } from './opencode-server'
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
export interface HeadlessInternals {
  binary: HeadlessCliRuntime['binary']
  sessions: HeadlessCliRuntime['sessions']
  pendingTools: HeadlessCliRuntime['pendingTools']
  receive(session: unknown, packet: Record<string, unknown>): void
  structuredResult(session: unknown, action: Record<string, unknown>): void
  resumeTool: HeadlessCliRuntime['resumeTool']
  launch: HeadlessCliRuntime['launch']
}
export interface OpenCodeInternals {
  sessions: OpenCodeServerRuntime['sessions']
  bridge: OpenCodeServerRuntime['bridge']
  nativeCalls: OpenCodeServerRuntime['nativeCalls']
  onStreamEvent: OpenCodeServerRuntime['onStreamEvent']
  finish: OpenCodeServerRuntime['finish']
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
