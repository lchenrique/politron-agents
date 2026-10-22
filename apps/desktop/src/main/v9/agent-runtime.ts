import type { EventEmitter } from 'node:events'
import type { Agent, Model } from '../../shared/v9'
import type { DynamicTool } from './codex'

export interface AgentRuntime extends Pick<EventEmitter, 'on' | 'off' | 'emit'> {
  models(binaryPath?: string): Promise<Model[]>
  thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions?: string): Promise<RuntimeThread>
  send(threadId: string, input: string, model?: string, timeout?: number): Promise<any>
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
