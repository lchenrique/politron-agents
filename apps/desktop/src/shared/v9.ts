import type { BooAccessoryColors } from './boo-accessory-colors'

export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'interrupted' | 'failed' | 'cancelled'
export interface MessageAttachment { id: string; name: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; size: number }
export interface SendOptions {
  requestId: string
  delivery: 'queue' | 'now'
  attachments?: MessageAttachment[]
  returnAfterAcceptance?: boolean
}
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
  pitsHeadAccessory?: 'none' | 'antenna' | 'horns' | 'cap' | 'cap-flat' | 'cap-back' | 'beanie' | 'bucket' | 'top-hat' | 'witch-hat' | 'headphones' | 'crown' | 'party-hat' | 'chef-hat' | 'bow' | 'flower' | 'halo'
  pitsFaceAccessory?: 'none' | 'glasses' | 'round-glasses' | 'sunglasses' | 'heart-glasses' | 'star-glasses' | 'monocle' | 'mustache' | 'star-mask'
  /** Cores por peça e acessório; continuam salvas ao alternar o item. */
  pitsAccessoryColors?: BooAccessoryColors
  pitsCheekColor?: string; pitsEyeColor?: string; pitsAura?: boolean; pitsBlush?: boolean; pitsAnimate?: boolean
  pitsEyeSize?: number; pitsEyeSpacing?: number; pitsSpeed?: number; pitsAmplitude?: number
  pitsBodyWidth?: number; pitsBodyHeight?: number
  pitsMouthSize?: number; pitsBlushStrength?: number
  canWrite: boolean; computerUse: boolean; approvalMode: 'ask' | 'automatic' | 'bypass'; revision: number; createdAt: string
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
  runId: string | null; delegationId?: string; relatedConversationId?: string; attachments?: MessageAttachment[]; createdAt: string
}
export interface MessagePage { messages: Message[]; hasMore: boolean; beforeCursor: number | null }
export interface MessageSearchHit { message: Message; cursor: number; snippet: string }
export interface ContextCheckpoint { id: string; conversationId: string; agentId: string; runId: string; summary: string; decisions: string[]; pending: string[]; createdAt: string }
export interface FileChange {
  id: string; runId: string; messageId: string; toolCallId: string; agentId: string; workspaceId: string
  path: string; status: 'applied' | 'failed' | 'unknown' | 'unchanged'; before: string; after: string
  additions: number; deletions: number; truncated: boolean; binary: boolean; createdAt: string
}
export type CommandStatus = 'completed' | 'failed' | 'interrupted' | 'timed_out'
export interface CommandResult { output: string; exitCode: number | null; status: CommandStatus; truncated: boolean }
export interface CommandEvidence extends CommandResult {
  id: string; runId: string; toolCallId: string; agentId: string; conversationId: string; workspaceId: string
  command: string; cwd: string; createdAt: string; finishedAt: string
}
export interface Approval {
  id: string; runId: string; conversationId: string; agentId: string; kind: 'write' | 'browser' | 'command' | 'delegation' | 'agent-change' | 'question' | 'plan'
  details: { path?: string; action?: string; command?: string; cwd?: string; before?: string; after?: string; truncated?: boolean; recipientName?: string; task?: string; proposal?: string; question?: string; options?: string[]; answer?: string; planTitle?: string; planSteps?: string[] }
  status: 'pending' | 'approved' | 'denied' | 'interrupted'; createdAt: string; resolvedAt: string | null
}
export interface Run {
  id: string; conversationId: string; agentId: string; rootId: string; parentId: string | null
  ancestry: string[]; status: RunStatus; threadId: string | null; turnId: string | null
  messageId: string; input: string; inputMessageId?: string; planMode?: boolean; agent: Agent; workspaceId: string; workspacePath: string; createdAt: string
}
export interface Delegation {
  id: string; idempotencyKey: string; rootRunId: string; parentRunId: string; childRunId: string
  requesterAgentId: string; recipientAgentId: string; sourceConversationId: string
  targetConversationId: string; sourceMessageId: string; requestMessageId: string
  resultMessageId: string; task: string; status: RunStatus; result: string
  error: string; createdAt: string; updatedAt: string
  previousDelegationId?: string
  continuationRunId?: string
}
export type MissionStatus = 'active' | 'waiting' | 'paused' | 'completed' | 'failed' | 'cancelled'
export interface MissionStep { id: string; title: string; status: 'pending' | 'doing' | 'done' | 'blocked' | 'skipped'; assignee?: string; note?: string }
export interface MissionUpdate { at: string; agentId: string | null; kind: 'progress' | 'decision' | 'error' | 'system' | 'result'; text: string }
/** Objetivo persistente: o motor continua os turnos do responsável até concluir, bloquear ou esgotar o orçamento. */
export interface Mission {
  id: string; title: string; goal: string; workspaceId: string; conversationId: string; ownerAgentId: string
  routineId: string | null; model: string | null; status: MissionStatus
  steps: MissionStep[]; updates: MissionUpdate[]; question: string | null; options: string[]; result: string | null
  turns: number; maxTurns: number; idleTurns: number; failures: number; lastProgressAt: string | null
  createdAt: string; updatedAt: string; completedAt: string | null
}
export type RoutineTrigger =
  | { kind: 'daily'; time: string; weekdays: number[] }
  | { kind: 'interval'; minutes: number }
  | { kind: 'event'; event: 'app-start' | 'project-changed' }
/** Responsabilidade contínua: cada disparo abre uma missão na mesma conversa da rotina. */
export interface Routine {
  id: string; name: string; instructions: string; agentId: string; workspaceId: string; trigger: RoutineTrigger
  enabled: boolean; maxTurns: number; model: string | null; conversationId: string | null
  lastRunAt: string | null; nextRunAt: string | null; lastMissionId: string | null; createdAt: string; updatedAt: string
}
export interface StartMissionInput { goal: string; title?: string; workspaceId?: string | null; conversationId?: string; agentId?: string; maxTurns?: number; model?: string | null }
export type MissionAction = 'pause' | 'resume' | 'cancel' | 'reply' | 'extend'
export type ModelEffort = NonNullable<Agent['effort']>
export interface Model {
  id: string; name: string; runtime: 'codex' | 'claude' | 'pi' | 'antigravity' | 'opencode'; isDefault: boolean
  description?: string
  supportedEfforts?: ModelEffort[]
  defaultEffort?: ModelEffort
}
export interface Snapshot { assistant: Agent; agents: Agent[]; workspaces: Workspace[]; conversations: Conversation[]; messages: Message[]; runs: Run[]; fileChanges: FileChange[]; approvals: Approval[]; terminalEnabled: boolean; steeringRuntimes?: Agent['runtime'][]; imageRuntimes?: Agent['runtime'][]; missions?: Mission[]; routines?: Routine[] }
export interface VoiceStatus { transcription: boolean; speech: boolean; provider?: 'realtime' | 'openrouter' | 'local' | 'pits' | 'pocket'; engine: 'piper' | 'chatterbox-pt-br' | 'openrouter' | 'pit-voices' | 'pocket-tts'; language: 'pt-BR'; voiceKeyConfigured: boolean; localSpeechInstalled: boolean; defaultVoiceReady: boolean; pitSpeechInstalled: boolean; pocketSpeechInstalled: boolean; transcriptionEngine?: 'whisper-small-fast' | 'whisper-tiny' }
export type PitVoiceId = 'f1' | 'f2' | 'f3' | 'f4' | 'm1' | 'm1-young' | 'dora' | 'alex' | 'santa'
export interface PitVoiceSelection { defaultVoiceId: PitVoiceId; agentVoiceIds: Record<string, PitVoiceId> }
export interface PocketVoicesInfo { installed: boolean; choices: { id: string; name: string }[]; selection: { defaultVoiceId: string; agentVoiceIds: Record<string, string> } }
export interface PitVoicesInfo { choices: { id: PitVoiceId; name: string; engine: string; sample: string }[]; selection: PitVoiceSelection }
export interface DecisionModel { id: string; name: string; free?: boolean }
export interface DecisionModelCatalog { source: 'openrouter'; models: DecisionModel[] }
export interface OpenRouterDecisionStatus { configured: boolean; modelId: string }
export interface ProjectFileEntry { name: string; path: string; directory: boolean }
export interface ProjectFileContent { path: string; name: string; content: string; hash: string }
/** Sessão PTY de um comando do agente, no host que executa o workspace. Separada do terminal manual. */
export interface AgentTerminalSession {
  id: string; workspaceId: string; conversationId: string; runId: string; agentId: string; agentName: string
  command: string; cwd: string; mode: 'command' | 'process'; status: 'running' | CommandStatus
  exitCode: number | null; truncated: boolean; createdAt: string; finishedAt: string | null
}
export type AgentTerminalSessionWithOutput = AgentTerminalSession & { output: string }
export type WorkspaceEvent =
  | { type: 'changed'; reason?: 'connection-restored' }
  | { type: 'agentTerminal'; event: 'started' | 'output' | 'finished'; session: AgentTerminalSession; data?: string }
  | { type: 'message'; message: Message }
  | { type: 'fileChange'; fileChange: FileChange }
  | { type: 'approval'; approval: Approval }
  | { type: 'mission'; mission: Mission }
export interface AppAPI {
  snapshot(): Promise<Snapshot>
  settingsPreferences(): Promise<{ canWrite: boolean; computerUse: boolean; approvalMode: Agent['approvalMode']; terminalEnabled: boolean }>
  saveAgent(input: Partial<Agent>): Promise<Agent>
  saveAssistantPreferences(input: Partial<Pick<Agent, 'canWrite' | 'computerUse' | 'approvalMode'>>): Promise<Agent>
  saveTerminalAccess(enabled: boolean): Promise<void>
  saveConversation(input: Partial<Conversation> & { workspacePath?: string | null }): Promise<Conversation>
  saveWorkspace(input: Partial<Workspace> & { path?: string | null }): Promise<Workspace>
  createWorktree(input: { sourceWorkspaceId: string; branch: string; baseBranch?: string }): Promise<Workspace>
  createProjectFolder(input: { parent: string; name: string }): Promise<string>
  cloneRepository(input: { repository: string; parent: string; name?: string }): Promise<string>
  cancelClone(): Promise<void>
  archiveWorkspace(workspaceId: string, preserveDirtyWorktree?: boolean): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  deleteAgent(agentId: string): Promise<void>
  workspaceDiff(workspaceId: string): Promise<string>
  listProjectFiles(workspaceId: string, directory?: string): Promise<ProjectFileEntry[]>
  readProjectFile(workspaceId: string, filePath: string): Promise<ProjectFileContent>
  writeProjectFile(workspaceId: string, filePath: string, content: string, expectedHash: string): Promise<{ path: string; hash: string }>
  respondApproval(approvalId: string, approved: boolean): Promise<void>
  answerQuestion(approvalId: string, answer: string): Promise<void>
  setVisibleConversation(conversationId: string | null): Promise<void>
  getVisibleConversation(): Promise<string | null>
  respondToAgent(conversationId: string, text: string, agentId: string): Promise<string>
  history(conversationId: string): Promise<Message[]>
  historyPage(conversationId: string, beforeCursor?: number | string | null, limit?: number): Promise<MessagePage>
  searchHistory(conversationId: string, query: string, limit?: number): Promise<MessageSearchHit[]>
  historyAround(conversationId: string, cursor: number, limit?: number): Promise<MessagePage>
  send(conversationId: string, text: string, model?: string, effort?: Agent['effort'], planMode?: boolean, options?: SendOptions): Promise<void>
  cancelQueuedMessage(messageId: string): Promise<void>
  uploadAttachment(conversationId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<MessageAttachment>
  readAttachment(conversationId: string, id: string): Promise<{ mimeType: string; bytes: Uint8Array }>
  stop(conversationId: string): Promise<void>
  voiceStatus(): Promise<VoiceStatus>
  pitVoices(): Promise<PitVoicesInfo>
  setPitVoice(voiceId: PitVoiceId | null, agentId?: string): Promise<PitVoiceSelection>
  pitVoiceSample(voiceId: PitVoiceId): Promise<Uint8Array>
  pocketVoices(): Promise<PocketVoicesInfo>
  setPocketVoice(voiceId: string | null, agentId?: string): Promise<PocketVoicesInfo>
  importPocketVoice(): Promise<PocketVoicesInfo | null>
  optimizePocketVoice(voiceId: string): Promise<PocketVoicesInfo>
  voiceInstall(mode?: 'transcription' | 'local'): Promise<VoiceStatus>
  voiceTranscribe(wav: Uint8Array): Promise<string>
  voiceSpeak(text: string, speed?: number, agentId?: string): Promise<Uint8Array>
  voiceNew(agentId?: string): Promise<Uint8Array>
  voiceResetAgent(agentId: string): Promise<void>
  voiceSetProvider(provider: 'realtime' | 'openrouter' | 'local' | 'pits' | 'pocket'): Promise<VoiceStatus>
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
  agentTerminalSessions(conversationId: string, workspaceId: string): Promise<AgentTerminalSessionWithOutput[]>
  agentTerminalStop(sessionId: string, conversationId: string, workspaceId: string): Promise<AgentTerminalSession>
  /** Abre o terminal do sistema na pasta, somente por clique do usuário e somente neste computador. */
  openExternalTerminal(workspaceId: string): Promise<void>
  startMission(input: StartMissionInput): Promise<Mission>
  missionAction(missionId: string, action: MissionAction, text?: string): Promise<Mission>
  saveRoutine(input: Partial<Routine>): Promise<Routine>
  deleteRoutine(routineId: string): Promise<void>
  runRoutine(routineId: string): Promise<Mission>
  onEvent(callback: (event: WorkspaceEvent) => void): () => void
}
