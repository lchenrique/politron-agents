import { EventEmitter } from "events"
import type { Team, Agent, PipelineState, TeamStatus } from "../types/team"
import { appStateDb } from "./app-state-db"

export interface CreateTeamInput {
  name: string
  projectPath: string
  projectName?: string
  projectColor?: string
  templateId?: string
}

class TeamStore extends EventEmitter {
  private teams: Map<string, Team> = new Map()

  hydrate(teams: Team[]): void {
    this.teams = new Map(teams.map((team) => [team.id, team]))
  }

  createTeam(input: CreateTeamInput): Team {
    const team: Team = {
      id: crypto.randomUUID(),
      name: input.name,
      projectPath: input.projectPath,
      projectName: input.projectName,
      projectColor: input.projectColor,
      techLeadAgentId: "",
      agents: [],
      status: "active",
      pipeline: {
        tasks: [],
        status: "idle",
      },
      createdAt: new Date().toISOString(),
      templateId: input.templateId,
    }

    this.teams.set(team.id, team)
    appStateDb.saveTeam(team)
    this.emit("team:created", team)
    return team
  }

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId)
  }

  deleteTeam(teamId: string): boolean {
    const deleted = this.teams.delete(teamId)
    if (deleted) {
      appStateDb.deleteTasksByTeam(teamId)
      appStateDb.deleteTeam(teamId)
      this.emit("team:deleted", teamId)
    }
    return deleted
  }

  updateTeam(teamId: string, updates: Partial<Team>): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = { ...team, ...updates }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:updated", updatedTeam)
    return updatedTeam
  }

  listTeams(): Team[] {
    return Array.from(this.teams.values())
  }

  addAgentToTeam(teamId: string, agent: Agent): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = {
      ...team,
      agents: [...team.agents, agent],
    }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:agent-added", { teamId, agent })
    return updatedTeam
  }

  removeAgentFromTeam(teamId: string, agentId: string): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = {
      ...team,
      agents: team.agents.filter((a: Agent) => a.id !== agentId),
    }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:agent-removed", { teamId, agentId })
    return updatedTeam
  }

  setTechLead(teamId: string, agentId: string): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = {
      ...team,
      techLeadAgentId: agentId,
    }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:techlead-changed", { teamId, agentId })
    return updatedTeam
  }

  pauseTeam(teamId: string): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = {
      ...team,
      status: "paused" as TeamStatus,
    }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:paused", { teamId })
    return updatedTeam
  }

  resumeTeam(teamId: string): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) {
      return undefined
    }

    const updatedTeam = {
      ...team,
      status: "active" as TeamStatus,
    }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:resumed", { teamId })
    return updatedTeam
  }

  updateAgentStatus(teamId: string, agentId: string, status: Agent["status"]): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const agentIndex = team.agents.findIndex(a => a.id === agentId)
    if (agentIndex === -1) return undefined

    const updatedAgents = [...team.agents]
    updatedAgents[agentIndex] = { ...updatedAgents[agentIndex], status }

    const updatedTeam = { ...team, agents: updatedAgents }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:agent-status-updated", { teamId, agentId, status })
    this.emit("team:updated", updatedTeam)
    return updatedTeam
  }

  updateAgent(teamId: string, agentId: string, updates: Partial<Agent>): Team | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const agentIndex = team.agents.findIndex(a => a.id === agentId)
    if (agentIndex === -1) return undefined

    const updatedAgents = [...team.agents]
    updatedAgents[agentIndex] = { ...updatedAgents[agentIndex], ...updates }

    const updatedTeam = { ...team, agents: updatedAgents }
    this.teams.set(teamId, updatedTeam)
    appStateDb.saveTeam(updatedTeam)
    this.emit("team:agent-updated", { teamId, agentId, agent: updatedAgents[agentIndex] })
    this.emit("team:updated", updatedTeam)
    return updatedTeam
  }

  getActiveTeams(): Team[] {
    return Array.from(this.teams.values()).filter((team: Team) => team.status === "active")
  }
}

export const teamStore = new TeamStore()
