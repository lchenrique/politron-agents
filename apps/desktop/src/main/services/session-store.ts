import { EventEmitter } from "events"

export type AgentStatus = "idle" | "running" | "waiting" | "blocked" | "done" | "error"

export type AgentRole = "global-ceo" | "global-agent" | "tech-lead" | "team-agent"

export interface ManagedSession {
  agentId: string
  teamId?: string
  role: AgentRole
  session: any
  workspaceDirectory?: string
  status: AgentStatus
  agentSlug?: string
  systemPrompt?: string
  systemPromptPath?: string
  lastEventAt?: string
}

export interface SessionLimitConfig {
  /** Maximum concurrent sessions per agent. Default: 1 */
  maxSessionsPerAgent: number
  /** Maximum total concurrent sessions. Default: 10 */
  maxTotalSessions: number
}

const DEFAULT_SESSION_LIMIT_CONFIG: SessionLimitConfig = {
  maxSessionsPerAgent: 1,
  maxTotalSessions: 10,
}

export class SessionStore extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map()
  private limitConfig: SessionLimitConfig = { ...DEFAULT_SESSION_LIMIT_CONFIG }

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /**
   * Configure session limits
   */
  setLimitConfig(config: Partial<SessionLimitConfig>): void {
    this.limitConfig = { ...this.limitConfig, ...config }
  }

  /**
   * Get current limit configuration
   */
  getLimitConfig(): SessionLimitConfig {
    return { ...this.limitConfig }
  }

  /**
   * Check if a new session can be created for an agent
   * Returns { allowed: true } if OK, or { allowed: false, reason: string } if not
   */
  canCreateSession(agentId: string): { allowed: boolean; reason?: string } {
    // Check total limit
    if (this.sessions.size >= this.limitConfig.maxTotalSessions) {
      return {
        allowed: false,
        reason: `Total session limit reached (${this.limitConfig.maxTotalSessions}). Wait for an active session to complete.`,
      }
    }

    // Check per-agent limit
    const existingSession = this.sessions.get(agentId)
    if (existingSession) {
      // Allow if existing session is idle/done/error (not active)
      if (["idle", "done", "error"].includes(existingSession.status)) {
        return { allowed: true }
      }
      // For global agents, allow multiple sessions
      if (existingSession.role === "global-ceo" || existingSession.role === "global-agent") {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: `Agent already has an active session (status: ${existingSession.status}). Wait for it to complete or cancel it first.`,
      }
    }

    return { allowed: true }
  }

  getSession(agentId: string): ManagedSession | undefined {
    return this.sessions.get(agentId)
  }

  /**
   * Set a session. If agent already has an active session, will be rejected.
   * Use replaceSession() to forcefully replace an existing session.
   */
  setSession(session: ManagedSession): { success: boolean; reason?: string; replacedSession?: ManagedSession } {
    const canCreate = this.canCreateSession(session.agentId)
    if (!canCreate.allowed) {
      return { success: false, reason: canCreate.reason }
    }

    const existingSession = this.sessions.get(session.agentId)
    if (existingSession) {
      // Remove old session reference
      this.emit("session:replaced", existingSession)
    }

    this.sessions.set(session.agentId, session)
    this.emit("session:created", session)
    return { success: true, replacedSession: existingSession }
  }

  /**
   * Forcefully replace an existing session without limit checking
   */
  replaceSession(session: ManagedSession): ManagedSession | undefined {
    const existingSession = this.sessions.get(session.agentId)
    this.sessions.set(session.agentId, session)
    this.emit("session:replaced", existingSession)
    this.emit("session:created", session)
    return existingSession
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
