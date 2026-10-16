export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed'
export interface Agent {
  id: string; name: string; alias: string; description: string; instructions: string
  runtime: 'codex'; model: string; color: string; avatar: string
  canWrite: boolean; computerUse: boolean; revision: number; createdAt: string
}
export const ASSISTANT_ID = 'app-assistant'
export interface Project {
  id: string; name: string; directory: string | null; instructions: string
  defaultAgentIds: string[]; revision: number; archived: boolean; createdAt: string
}
export interface Conversation {
  id: string; kind: 'direct' | 'group'; name: string; agentIds: string[]
  projectId: string | null; titleAuto: boolean
  directory: string | null; revision: number; archived: boolean; createdAt: string
}
export interface Message {
  id: string; conversationId: string; agentId: string | null; author: string
  role: 'user' | 'assistant' | 'activity'; text: string; status: RunStatus
  runId: string | null; delegationId?: string; relatedConversationId?: string; createdAt: string
}
export interface Run {
  id: string; conversationId: string; agentId: string; rootId: string; parentId: string | null
  ancestry: string[]; status: RunStatus; threadId: string | null; turnId: string | null
  messageId: string; input: string; agent: Agent; directory: string | null; createdAt: string
}
export interface Delegation {
  id: string; idempotencyKey: string; rootRunId: string; parentRunId: string; childRunId: string
  requesterAgentId: string; recipientAgentId: string; sourceConversationId: string
  targetConversationId: string; sourceMessageId: string; requestMessageId: string
  resultMessageId: string; task: string; status: RunStatus; result: string
  error: string; createdAt: string; updatedAt: string
}
export interface Model { id: string; name: string; isDefault: boolean }
export interface Snapshot { assistant: Agent; agents: Agent[]; projects: Project[]; conversations: Conversation[]; messages: Message[]; runs: Run[] }
export interface BrowserFrame {
  key: string; conversationId: string; agentId: string; url: string; title: string
  image: string; width: number; height: number; x: number | null; y: number | null
  human: boolean; action: string; capturedAt: string
}
export type WorkspaceEvent =
  | { type: 'changed' }
  | { type: 'message'; message: Message }
  | { type: 'browser'; frame: BrowserFrame }
export interface WorkspaceAPI {
  snapshot(): Promise<Snapshot>
  saveAgent(input: Partial<Agent>): Promise<Agent>
  saveProject(input: Partial<Project>): Promise<Project>
  saveConversation(input: Partial<Conversation>): Promise<Conversation>
  history(conversationId: string): Promise<Message[]>
  send(conversationId: string, text: string, model?: string): Promise<void>
  stop(conversationId: string): Promise<void>
  cancelDelegation(delegationId: string): Promise<void>
  models(): Promise<Model[]>
  pickFolder(): Promise<string | null>
  openFolder(conversationId: string): Promise<void>
  browserFrames(conversationId: string): Promise<BrowserFrame[]>
  browserControl(key: string, human: boolean): Promise<void>
  browserAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }): Promise<void>
  onEvent(callback: (event: WorkspaceEvent) => void): () => void
}
