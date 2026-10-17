export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed'
export interface Agent {
  id: string; name: string; alias: string; description: string; instructions: string
  runtime: 'codex' | 'claude'; model: string; color: string; avatar: string
  role?: 'agent' | 'chief'
  pitsShape?: 'round' | 'flat' | 'long'
  pitsCheekColor?: string; pitsEyeColor?: string; pitsAura?: boolean; pitsBlush?: boolean; pitsAnimate?: boolean
  pitsEyeSize?: number; pitsEyeSpacing?: number; pitsSpeed?: number; pitsAmplitude?: number
  canWrite: boolean; computerUse: boolean; approvalMode: 'ask' | 'automatic'; revision: number; createdAt: string
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
export const ASSISTANT_ID = 'app-assistant'
export interface Workspace {
  id: string; name: string; kind: 'local' | 'worktree' | 'free'; path: string
  branch: string | null; baseBranch: string | null; parentWorkspaceId: string | null
  instructions: string; defaultAgentIds: string[]; changes: number
  permissions?: { chiefCreateAgents: boolean; chiefEditAgents: boolean; chiefManageTeam: boolean; chiefCreateSessions: boolean; filesWrite: 'inherit' | 'deny'; computerUse: 'inherit' | 'deny' }
  archived: boolean; createdAt: string
}
export interface Conversation {
  id: string; kind: 'direct' | 'group'; name: string; agentIds: string[]
  workspaceId: string; titleAuto: boolean
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
  id: string; runId: string; conversationId: string; agentId: string; kind: 'write' | 'browser' | 'delegation' | 'agent-change'
  details: { path?: string; action?: string; before?: string; after?: string; truncated?: boolean; recipientName?: string; task?: string; proposal?: string }
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
export interface Snapshot { assistant: Agent; agents: Agent[]; workspaces: Workspace[]; conversations: Conversation[]; messages: Message[]; runs: Run[]; fileChanges: FileChange[]; approvals: Approval[] }
export interface ProjectFileEntry { name: string; path: string; directory: boolean }
export interface ProjectFileContent { path: string; name: string; content: string; hash: string }
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
  saveAssistantPreferences(input: Partial<Pick<Agent, 'canWrite' | 'computerUse' | 'approvalMode'>>): Promise<Agent>
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }): Promise<Conversation>
  saveWorkspace(input: Partial<Workspace> & { path?: string | null }): Promise<Workspace>
  createWorktree(input: { sourceWorkspaceId: string; branch: string; baseBranch?: string }): Promise<Workspace>
  archiveWorkspace(workspaceId: string, preserveDirtyWorktree?: boolean): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  deleteAgent(agentId: string): Promise<void>
  workspaceDiff(workspaceId: string): Promise<string>
  listProjectFiles(workspaceId: string, directory?: string): Promise<ProjectFileEntry[]>
  readProjectFile(workspaceId: string, filePath: string): Promise<ProjectFileContent>
  writeProjectFile(workspaceId: string, filePath: string, content: string, expectedHash: string): Promise<{ path: string; hash: string }>
  respondApproval(approvalId: string, approved: boolean): Promise<void>
  setVisibleConversation(conversationId: string | null): Promise<void>
  history(conversationId: string): Promise<Message[]>
  send(conversationId: string, text: string, model?: string, effort?: Agent['effort']): Promise<void>
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
