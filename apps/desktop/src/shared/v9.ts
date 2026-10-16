export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed'
export interface Agent {
  id: string; name: string; alias: string; description: string; instructions: string
  runtime: 'codex' | 'claude'; model: string; color: string; avatar: string
  canWrite: boolean; computerUse: boolean; approvalMode: 'ask' | 'automatic'; revision: number; createdAt: string
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
export const ASSISTANT_ID = 'app-assistant'
export interface Workspace {
  id: string; projectId: string | null; kind: 'local' | 'worktree'; path: string
  branch: string | null; baseBranch: string | null; changes: number
  archived: boolean; createdAt: string
}
export interface Project {
  id: string; name: string; defaultWorkspaceId: string | null; instructions: string
  defaultAgentIds: string[]; revision: number; archived: boolean; createdAt: string
}
export interface Conversation {
  id: string; kind: 'direct' | 'group'; name: string; agentIds: string[]
  projectId: string | null; workspaceId: string; titleAuto: boolean
  revision: number; archived: boolean; createdAt: string
}
export interface Message {
  id: string; conversationId: string; agentId: string | null; author: string
  role: 'user' | 'assistant' | 'activity'; text: string; status: RunStatus
  runId: string | null; delegationId?: string; relatedConversationId?: string; createdAt: string
}
export interface FileChange {
  id: string; runId: string; messageId: string; toolCallId: string; agentId: string; workspaceId: string
  path: string; status: 'applied' | 'failed' | 'unknown' | 'unchanged'; before: string; after: string
  additions: number; deletions: number; truncated: boolean; binary: boolean; createdAt: string
}
export interface Approval {
  id: string; runId: string; conversationId: string; agentId: string; kind: 'write' | 'browser'
  details: { path?: string; action?: string; before?: string; after?: string; truncated?: boolean }
  status: 'pending' | 'approved' | 'denied' | 'interrupted'; createdAt: string; resolvedAt: string | null
}
export interface Run {
  id: string; conversationId: string; agentId: string; rootId: string; parentId: string | null
  ancestry: string[]; status: RunStatus; threadId: string | null; turnId: string | null
  messageId: string; input: string; agent: Agent; workspaceId: string; workspacePath: string; createdAt: string
}
export interface Delegation {
  id: string; idempotencyKey: string; rootRunId: string; parentRunId: string; childRunId: string
  requesterAgentId: string; recipientAgentId: string; sourceConversationId: string
  targetConversationId: string; sourceMessageId: string; requestMessageId: string
  resultMessageId: string; task: string; status: RunStatus; result: string
  error: string; createdAt: string; updatedAt: string
}
export interface Model { id: string; name: string; runtime: 'codex' | 'claude'; isDefault: boolean }
export interface Snapshot { assistant: Agent; agents: Agent[]; projects: Project[]; workspaces: Workspace[]; conversations: Conversation[]; messages: Message[]; runs: Run[]; fileChanges: FileChange[]; approvals: Approval[] }
export interface BrowserFrame {
  key: string; conversationId: string; agentId: string; url: string; title: string
  image: string; width: number; height: number; x: number | null; y: number | null
  human: boolean; action: string; capturedAt: string
}
export type WorkspaceEvent =
  | { type: 'changed' }
  | { type: 'message'; message: Message }
  | { type: 'fileChange'; fileChange: FileChange }
  | { type: 'approval'; approval: Approval }
  | { type: 'browser'; frame: BrowserFrame }
export interface AppAPI {
  snapshot(): Promise<Snapshot>
  saveAgent(input: Partial<Agent>): Promise<Agent>
  saveProject(input: Partial<Project>): Promise<Project>
  saveConversation(input: Partial<Conversation>): Promise<Conversation>
  createLocalWorkspace(input: { projectId: string | null; path: string }): Promise<Workspace>
  createWorktree(input: { projectId: string; sourceWorkspaceId: string; branch: string; baseBranch?: string }): Promise<Workspace>
  archiveWorkspace(workspaceId: string, preserveDirtyWorktree?: boolean): Promise<void>
  workspaceDiff(workspaceId: string): Promise<string>
  respondApproval(approvalId: string, approved: boolean): Promise<void>
  setVisibleConversation(conversationId: string | null): Promise<void>
  history(conversationId: string): Promise<Message[]>
  send(conversationId: string, text: string, model?: string): Promise<void>
  stop(conversationId: string): Promise<void>
  cancelDelegation(delegationId: string): Promise<void>
  models(runtime?: 'codex' | 'claude'): Promise<Model[]>
  hasClaudeCredential(): Promise<boolean>
  saveClaudeCredential(apiKey: string): Promise<void>
  pickFolder(): Promise<string | null>
  openFolder(conversationId: string): Promise<void>
  browserFrames(conversationId: string): Promise<BrowserFrame[]>
  browserControl(key: string, human: boolean): Promise<void>
  browserAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }): Promise<void>
  onEvent(callback: (event: WorkspaceEvent) => void): () => void
}
