import type { EventEmitter } from 'node:events'
import type { Agent, Model } from '../../shared/v9'
import type { DynamicTool } from './codex'

export interface AgentRuntime extends Pick<EventEmitter, 'on' | 'off' | 'emit'> {
  models(): Promise<Model[]>
  thread(agent: Agent, directory: string, tools: DynamicTool[], threadId?: string, projectInstructions?: string): Promise<string>
  send(threadId: string, input: string, model?: string, timeout?: number): Promise<any>
  respond(id: number | string, result: unknown): void
  interrupt(threadId: string, turnId: string): Promise<void>
  close(): void
}
