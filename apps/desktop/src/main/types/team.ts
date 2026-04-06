export type AgentStatus = "idle" | "running" | "waiting" | "blocked" | "done" | "error"

export type PipelineStatus = "idle" | "running" | "paused" | "done" | "failed"

export type TaskStatus = "pending" | "running" | "done" | "failed" | "blocked"

export type TeamStatus = "active" | "paused"

export type LogType = "delegation" | "status" | "result" | "error" | "merge"

export interface Agent {
  id: string
  name: string
  role: string
  catalogSlug: string
  systemPromptPath: string
  status: AgentStatus
  color: string
  currentFiles: string[]
  sessionId?: string
  hiredAt: string
  isTeamLead?: boolean
  llmModel?: {
    modelID: string
    providerID: string
  }
}

export interface Team {
  id: string
  name: string
  projectPath: string
  projectName?: string
  projectColor?: string
  techLeadAgentId: string
  agents: Agent[]
  status: TeamStatus
  pipeline: PipelineState
  createdAt: string
  templateId?: string
}

export interface Workspace {
  globalCeoAgentId: string | null
  teams: Team[]
  activeTeamId: string | null
}

export interface PipelineState {
  tasks: PipelineTask[]
  status: PipelineStatus
  startedAt?: string
  finishedAt?: string
}

export interface PipelineTask {
  id: string
  teamId: string
  agentId: string
  description: string
  files: string[]
  status: TaskStatus
  dependsOn: string[]
  branchName?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface TeamTemplate {
  id: string
  name: string
  description: string
  icon: string
  agentSlugs: string[]
  suggestedTechLeadSlug?: string
  pipelineDescription: string
}

export interface AgentLog {
  id: string
  timestamp: string
  fromAgentId: string
  toAgentId?: string
  type: LogType
  content: string
  taskId?: string
  teamId?: string
}
