import { EventEmitter } from "events"

export type AgentStatus = "idle" | "running" | "waiting" | "blocked" | "done" | "error"

export type AgentRole = "global-ceo" | "tech-lead" | "team-agent"

export interface ManagedSession {
  agentId: string
  teamId?: string
  role: AgentRole
  session: any
  status: AgentStatus
  lastEventAt?: string
}

export class SessionStore extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map()

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  getSession(agentId: string): ManagedSession | undefined {
    return this.sessions.get(agentId)
  }

  setSession(session: ManagedSession): void {
    this.sessions.set(session.agentId, session)
    this.emit("session:created", session)
  }

  removeSession(agentId: string): boolean {
    const session = this.sessions.get(agentId)
    if (session) {
      this.sessions.delete(agentId)
      this.emit("session:removed", session)
      return true
    }
    return false
  }

  listSessions(): ManagedSession[] {
    return Array.from(this.sessions.values())
  }

  getByRole(role: AgentRole): ManagedSession[] {
    return this.listSessions().filter(s => s.role === role)
  }

  updateStatus(agentId: string, status: AgentStatus): ManagedSession | undefined {
    const session = this.sessions.get(agentId)
    if (session) {
      session.status = status
      session.lastEventAt = new Date().toISOString()
      this.emit("session:status", session)
      return session
    }
    return undefined
  }

  getGlobalCeo(): ManagedSession | undefined {
    const ceoSessions = this.getByRole("global-ceo")
    return ceoSessions[0]
  }

  getTechLeadsByTeam(teamId: string): ManagedSession[] {
    return this.listSessions().filter(
      s => s.role === "tech-lead" && s.teamId === teamId
    )
  }

  getTeamAgents(teamId: string): ManagedSession[] {
    return this.listSessions().filter(
      s => s.role === "team-agent" && s.teamId === teamId
    )
  }

  hasSession(agentId: string): boolean {
    return this.sessions.has(agentId)
  }

  clear(): void {
    this.sessions.clear()
    this.emit("session:cleared")
  }

  size(): number {
    return this.sessions.size
  }
}

export const sessionStore = new SessionStore()
