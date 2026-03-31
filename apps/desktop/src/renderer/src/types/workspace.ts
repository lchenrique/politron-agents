export type AgentStatus = "idle" | "running" | "waiting" | "blocked" | "done" | "error";

export interface Agent {
  id: string;
  name: string;
  role: string;
  initials: string;
  status: AgentStatus;
  color: string;
  bgColor: string;
  borderColor: string;
  currentFiles: string[];
  isTeamLead?: boolean;
}

export interface PipelineTask {
  id: string;
  teamId: string;
  agentId: string;
  agentInitials: string;
  description: string;
  files: string[];
  dependsOn: string[];
  status: "pending" | "running" | "done" | "failed" | "blocked" | "waiting";
}

export interface Team {
  id: string;
  name: string;
  color: string;
  projectPath: string;
  techLeadAgentId: string;
  agents: Agent[];
  status: "active" | "paused";
  pipeline: PipelineTask[];
}

export interface Project {
  id: string;
  initials: string;
  name: string;
  teamId: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  streamId?: string;
  agentId: string;
  agentInitials: string;
  agentName: string;
  agentColor: string;
  isUser: boolean;
  text: string;
  diff?: {
    filename: string;
    additions: number;
    deletions: number;
    lines: { type: "add" | "rem" | "ctx"; text: string }[];
  };
  timestamp: number;
}

export interface Workspace {
  globalCeoAgent: Agent;
  teams: Team[];
  projects: Project[];
  activeProjectId: string | null;
  activeTeamId: string | null;
  activeAgentTabId: string | null;
  messages: Record<string, ChatMessage[]>;
}

export const AGENT_CATALOG: { name: string; role: string; initials: string; color: string; bgColor: string; borderColor: string }[] = [
  { name: "Frontend Dev", role: "frontend", initials: "FE", color: "hsl(142 69% 58%)", bgColor: "bg-ide-green/10", borderColor: "border-ide-green/15" },
  { name: "Backend Arch", role: "backend", initials: "BA", color: "hsl(43 96% 56%)", bgColor: "bg-ide-amber/10", borderColor: "border-ide-amber/15" },
  { name: "Reality Checker", role: "qa", initials: "QA", color: "hsl(330 86% 70%)", bgColor: "bg-ide-pink/10", borderColor: "border-ide-pink/15" },
  { name: "DevOps Engineer", role: "devops", initials: "DO", color: "hsl(174 62% 47%)", bgColor: "bg-ide-teal/10", borderColor: "border-ide-teal/15" },
  { name: "UI Designer", role: "design", initials: "UI", color: "hsl(280 67% 60%)", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/15" },
  { name: "Data Engineer", role: "data", initials: "DE", color: "hsl(200 80% 55%)", bgColor: "bg-blue-400/10", borderColor: "border-blue-400/15" },
  { name: "Security Analyst", role: "security", initials: "SA", color: "hsl(0 72% 51%)", bgColor: "bg-ide-red/10", borderColor: "border-ide-red/15" },
  { name: "Tech Writer", role: "docs", initials: "TW", color: "hsl(50 80% 55%)", bgColor: "bg-yellow-400/10", borderColor: "border-yellow-400/15" },
];
