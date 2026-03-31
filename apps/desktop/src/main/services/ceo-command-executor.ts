import { EventEmitter } from "events"
import type { CeoCommand } from "../types/ceo"
import { teamStore } from "./team-store"
import { pipelineExecutor } from "./pipeline-executor"
import { getTemplateById, getAgentBySlug } from "./agent-catalog"
import type { Agent, Team } from "../types/team"

export class CeoCommandExecutor extends EventEmitter {
  async execute(command: CeoCommand): Promise<void> {
    switch (command.type) {
      case "CREATE_TEAM":
        await this.handleCreateTeam(command)
        break
      case "DELEGATE":
        await this.handleDelegate(command)
        break
      case "HIRE_AGENT":
        await this.handleHireAgent(command)
        break
      case "PAUSE_TEAM":
        await this.handlePauseTeam(command)
        break
      case "RESUME_TEAM":
        await this.handleResumeTeam(command)
        break
      case "ASK_HUMAN":
        await this.handleAskHuman(command)
        break
      default:
        this.emit("error", { command, message: `Unknown command type: ${command.type}` })
    }
  }

  private async handleCreateTeam(command: CeoCommand): Promise<void> {
    const templateId = command.payload.templateId as string
    const name = command.payload.name as string
    const projectPath = command.payload.projectPath as string

    if (!templateId || !name || !projectPath) {
      this.emit("error", { command, message: "Missing required fields: templateId, name, projectPath" })
      return
    }

    const template = getTemplateById(templateId)
    if (!template) {
      this.emit("error", { command, message: `Template not found: ${templateId}` })
      return
    }

    const team = teamStore.createTeam({
      name,
      projectPath,
      projectName: name,
      projectColor: "hsl(239 84% 67%)",
      templateId,
    })

    for (const agentSlug of template.agentSlugs) {
      const agentEntry = getAgentBySlug(agentSlug)
      if (agentEntry) {
        const agent: Agent = {
          id: crypto.randomUUID(),
          name: agentEntry.name,
          role: agentEntry.role,
          catalogSlug: agentEntry.slug,
          systemPromptPath: agentEntry.systemPromptPath || "",
          status: "idle",
          color: agentEntry.color,
          currentFiles: [],
          hiredAt: new Date().toISOString(),
        }
        teamStore.addAgentToTeam(team.id, agent)
      }
    }

    if (template.suggestedTechLeadSlug) {
      const agents = teamStore.getTeam(team.id)?.agents || []
      const techLead = agents.find((a) => a.catalogSlug === template.suggestedTechLeadSlug)
      if (techLead) {
        teamStore.setTechLead(team.id, techLead.id)
      }
    }

    this.emit("team:created", team)
  }

  private async handleDelegate(command: CeoCommand): Promise<void> {
    const teamName = command.payload.team as string
    const task = command.payload.task as string

    if (!teamName || !task) {
      this.emit("error", { command, message: "Missing required fields: team, task" })
      return
    }

    const team = this.findTeamByName(teamName)
    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName}` })
      return
    }

    const agentId = team.techLeadAgentId || team.agents[0]?.id
    if (!agentId) {
      this.emit("error", { command, message: `No agents available in team: ${teamName}` })
      return
    }

    const pipelineTask = pipelineExecutor.addTask({
      teamId: team.id,
      agentId,
      description: task,
      files: [],
      dependsOn: [],
    })

    this.emit("task:delegated", { team, task: pipelineTask })
  }

  private async handleHireAgent(command: CeoCommand): Promise<void> {
    const teamName = command.payload.team as string
    const role = command.payload.role as string
    const agentSlug = command.payload.agentSlug as string

    if (!teamName || !role) {
      this.emit("error", { command, message: "Missing required fields: team, role" })
      return
    }

    const team = this.findTeamByName(teamName)
    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName}` })
      return
    }

    const slugToUse = agentSlug || role
    const agentEntry = getAgentBySlug(slugToUse)

    if (!agentEntry) {
      this.emit("error", { command, message: `Agent not found: ${slugToUse}` })
      return
    }

    const agent: Agent = {
      id: crypto.randomUUID(),
      name: agentEntry.name,
      role: agentEntry.role,
      catalogSlug: agentEntry.slug,
      systemPromptPath: agentEntry.systemPromptPath || "",
      status: "idle",
      color: agentEntry.color,
      currentFiles: [],
      hiredAt: new Date().toISOString(),
    }

    teamStore.addAgentToTeam(team.id, agent)
    this.emit("agent:hired", { team, agent })
  }

  private async handlePauseTeam(command: CeoCommand): Promise<void> {
    const teamName = command.payload.team as string

    if (!teamName) {
      this.emit("error", { command, message: "Missing required field: team" })
      return
    }

    const team = this.findTeamByName(teamName)
    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName}` })
      return
    }

    teamStore.pauseTeam(team.id)
    this.emit("team:paused", { team })
  }

  private async handleResumeTeam(command: CeoCommand): Promise<void> {
    const teamName = command.payload.team as string

    if (!teamName) {
      this.emit("error", { command, message: "Missing required field: team" })
      return
    }

    const team = this.findTeamByName(teamName)
    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName}` })
      return
    }

    teamStore.resumeTeam(team.id)
    this.emit("team:resumed", { team })
  }

  private async handleAskHuman(command: CeoCommand): Promise<void> {
    const question = command.payload.question as string

    if (!question) {
      this.emit("error", { command, message: "Missing required field: question" })
      return
    }

    this.emit("vibe:ceo:ask-human", { question, raw: command.raw })
  }

  private findTeamByName(name: string): Team | undefined {
    const teams = teamStore.listTeams()
    return teams.find((t) => t.name.toLowerCase() === name.toLowerCase())
  }
}

export const ceoCommandExecutor = new CeoCommandExecutor()
