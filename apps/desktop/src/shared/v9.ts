export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed'
/** Mesma paleta do Poli Studio (PoliCustomizer); usada também para sortear a cor de um Pit novo, criado pelo usuário ou pelo Chief. */
export const PIT_COLOR_PALETTE = ['#786bea', '#4098eb', '#32b6a0', '#f0a05b', '#ef79ac', '#393f56', '#e05e70']
export const randomPitColor = (): string => PIT_COLOR_PALETTE[Math.floor(Math.random() * PIT_COLOR_PALETTE.length)]
export interface Agent {
  id: string; name: string; alias: string; description: string; instructions: string
  runtime: 'codex' | 'claude' | 'pi' | 'opencode' | 'antigravity'; model: string; color: string; avatar: string
  role?: 'agent' | 'chief'
  /** Boos temporários pertencem a um workspace; aposentados preservam histórico e resultados. */
  temporary?: boolean
  temporaryStatus?: 'available' | 'working' | 'retired'
  temporaryWorkspaceId?: string
  temporaryTask?: string
  pitsShape?: 'round' | 'flat' | 'long' | 'drop' | 'squircle' | 'bean' | 'ghost-wave' | 'ghost-puff' | 'ghost-peak' | 'cute-squid' | 'soft-square' | 'little-cat'
  pitsAccessory?: 'none' | 'antenna' | 'horns' | 'glasses' | 'cap'
  pitsHeadAccessory?: 'none' | 'antenna' | 'horns' | 'cap' | 'cap-flat' | 'cap-back' | 'beanie' | 'bucket' | 'top-hat' | 'witch-hat' | 'headphones' | 'crown'
  pitsFaceAccessory?: 'none' | 'glasses' | 'round-glasses' | 'sunglasses'
  pitsCheekColor?: string; pitsEyeColor?: string; pitsAura?: boolean; pitsBlush?: boolean; pitsAnimate?: boolean
  pitsEyeSize?: number; pitsEyeSpacing?: number; pitsSpeed?: number; pitsAmplitude?: number
  pitsBodyWidth?: number; pitsBodyHeight?: number
  pitsMouthSize?: number; pitsBlushStrength?: number
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
  /** Sem menção: o líder é o padrão; broadcast é explícito; auto consulta o decisor OpenRouter e cai no líder. */
  responseMode?: 'broadcast' | 'leader' | 'auto' | 'discussion'
  leaderAgentId?: string | null
  revision: number; archived: boolean; createdAt: string
}
export interface Message {
  id: string; conversationId: string; agentId: string | null; author: string
  role: 'user' | 'assistant' | 'activity'; text: string; status: RunStatus
  runId: string | null; delegationId?: string; relatedConversationId?: string; createdAt: string
}
export interface MessagePage { messages: Message[]; hasMore: boolean; beforeCursor: number | null }
export interface MessageSearchHit { message: Message; cursor: number; snippet: string }
export interface ContextCheckpoint { id: string; conversationId: string; agentId: string; runId: string; summary: string; decisions: string[]; pending: string[]; createdAt: string }
export interface FileChange {
  id: string; runId: string; messageId: string; toolCallId: string; agentId: string; workspaceId: string
  path: string; status: 'applied' | 'failed' | 'unknown' | 'unchanged'; before: string; after: string
  additions: number; deletions: number; truncated: boolean; binary: boolean; createdAt: string
}
export interface Approval {
  id: string; runId: string; conversationId: string; agentId: string; kind: 'write' | 'browser' | 'command' | 'delegation' | 'agent-change'
  details: { path?: string; action?: string; command?: string; cwd?: string; before?: string; after?: string; truncated?: boolean; recipientName?: string; task?: string; proposal?: string }
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
  continuationRunId?: string
}
export type ModelEffort = NonNullable<Agent['effort']>
export interface Model {
  id: string; name: string; runtime: 'codex' | 'claude' | 'pi' | 'antigravity' | 'opencode'; isDefault: boolean
  description?: string
  supportedEfforts?: ModelEffort[]
  defaultEffort?: ModelEffort
}
export interface Snapshot { assistant: Agent; agents: Agent[]; workspaces: Workspace[]; conversations: Conversation[]; messages: Message[]; runs: Run[]; fileChanges: FileChange[]; approvals: Approval[]; terminalEnabled: boolean; steeringRuntimes?: Agent['runtime'][] }
export interface VoiceStatus { transcription: boolean; speech: boolean; engine: 'chatterbox-pt-br' | 'openrouter' | 'pit-voices'; language: 'pt-BR'; voiceKeyConfigured: boolean; localSpeechInstalled: boolean; defaultVoiceReady: boolean; pitSpeechInstalled: boolean; transcriptionEngine?: 'whisper-small-fast' | 'whisper-tiny' }
export type PitVoiceId = 'f1' | 'f2' | 'f3' | 'f4' | 'm1' | 'm1-young' | 'dora' | 'alex' | 'santa'
export interface PitVoiceSelection { defaultVoiceId: PitVoiceId; agentVoiceIds: Record<string, PitVoiceId> }
export interface PitVoicesInfo { choices: { id: PitVoiceId; name: string; engine: string; sample: string }[]; selection: PitVoiceSelection }
export interface DecisionModel { id: string; name: string; free?: boolean }
export interface DecisionModelCatalog { source: 'openrouter'; models: DecisionModel[] }
export interface OpenRouterDecisionStatus { configured: boolean; modelId: string }
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
  saveTerminalAccess(enabled: boolean): Promise<void>
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
  getVisibleConversation(): Promise<string | null>
  respondToAgent(conversationId: string, text: string, agentId: string): Promise<string>
  history(conversationId: string): Promise<Message[]>
  historyPage(conversationId: string, beforeCursor?: number | string | null, limit?: number): Promise<MessagePage>
  searchHistory(conversationId: string, query: string, limit?: number): Promise<MessageSearchHit[]>
  historyAround(conversationId: string, cursor: number, limit?: number): Promise<MessagePage>
  send(conversationId: string, text: string, model?: string, effort?: Agent['effort']): Promise<void>
  stop(conversationId: string): Promise<void>
  voiceStatus(): Promise<VoiceStatus>
  pitVoices(): Promise<PitVoicesInfo>
  setPitVoice(voiceId: PitVoiceId | null, agentId?: string): Promise<PitVoiceSelection>
  pitVoiceSample(voiceId: PitVoiceId): Promise<Uint8Array>
  voiceInstall(mode?: 'transcription' | 'local'): Promise<VoiceStatus>
  voiceTranscribe(wav: Uint8Array): Promise<string>
  voiceSpeak(text: string, speed?: number, agentId?: string): Promise<Uint8Array>
  voiceNew(agentId?: string): Promise<Uint8Array>
  voiceResetAgent(agentId: string): Promise<void>
  voiceSetProvider(provider: 'openrouter' | 'local' | 'pits'): Promise<VoiceStatus>
  voiceSaveOpenRouterKey(key: string): Promise<VoiceStatus>
  voiceClearOpenRouterKey(): Promise<VoiceStatus>
  cancelDelegation(delegationId: string): Promise<void>
  models(runtime?: 'codex' | 'claude'): Promise<Model[]>
  hasClaudeCredential(): Promise<boolean>
  saveClaudeCredential(apiKey: string): Promise<void>
  clearClaudeCredential(): Promise<void>
  openRouterDecisionStatus(): Promise<OpenRouterDecisionStatus>
  openRouterDecisionModels(key?: string): Promise<DecisionModelCatalog>
  saveOpenRouterDecision(key: string, modelId: string): Promise<void>
  saveOpenRouterDecisionModel(modelId: string): Promise<void>
  clearOpenRouterDecision(): Promise<void>
  pickFolder(): Promise<string | null>
  openFolder(conversationId: string): Promise<void>
  browserFrames(conversationId: string): Promise<BrowserFrame[]>
  browserControl(key: string, human: boolean): Promise<void>
  browserAction(key: string, action: { type: 'click' | 'type' | 'scroll' | 'key' | 'refresh'; x?: number; y?: number; text?: string }): Promise<void>
  onEvent(callback: (event: WorkspaceEvent) => void): () => void
}
