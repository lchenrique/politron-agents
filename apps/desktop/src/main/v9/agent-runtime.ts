import type { EventEmitter } from 'node:events'
import type { Agent, Model, ModelRuntimeOptions } from '../../shared/v9'
import type { DynamicTool } from './codex'

export interface AgentInput { text: string; images: Array<{ path: string; mimeType: string }> }
/** Proxy MCP do Politron para o navegador externo, registrado só na thread autorizada. */
export interface ExternalBrowserRegistration { url: string; token: string; tools: string[] }
export interface RuntimeSendResult {
  thread?: { id?: string }
  turn?: { id?: string; status?: string; error?: { message?: string } }
}

export interface AgentRuntime extends Pick<EventEmitter, 'on' | 'off' | 'emit'> {
  readonly supportsImages?: boolean
  models(binaryPath?: string): Promise<Model[]>
  thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions?: string, externalBrowser?: ExternalBrowserRegistration): Promise<RuntimeThread>
  send(threadId: string, input: string | AgentInput, model?: string, timeout?: number, options?: ModelRuntimeOptions & { effort?: Agent['effort'] }): Promise<RuntimeSendResult>
  steer?(threadId: string, turnId: string, input: string): Promise<void>
  respond(id: number | string, result: unknown): void
  interrupt(threadId: string, turnId: string): Promise<void>
  close(): void
}

export type RuntimeThread = { id: string; history: 'retained' | 'empty' | 'resume-pending' }

export class SessionUnavailableError extends Error {
  constructor(message = 'A sessão do runtime não existe mais.') {
    super(message)
    this.name = 'SessionUnavailableError'
  }
}
