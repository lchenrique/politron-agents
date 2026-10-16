import { EventEmitter } from "events"
import type { CeoCommand } from "../types/ceo"
import { teamStore } from "./team-store"
import { pipelineExecutor } from "./pipeline-executor"
import {
  getTemplateById,
  getAgentByIdentity,
  getAgentBySlug,
  getGlobalAgentByIdentity,
  getMarketplaceAgentByIdentity,
  listMarketplaceAgentIdentities,
} from "./agent-catalog"
import type { Agent, Team } from "../types/team"

function firstPayloadValue(value: string | string[] | undefined): string | undefined {
  if (value == null) {
    return undefined
  }

  return Array.isArray(value) ? value[0] : value
}

function payloadToArray(value: string | string[] | undefined): string[] {
  if (value == null) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function getPayloadValue(payload: CeoCommand["payload"], key: string): string | string[] | undefined {
  const normalizedKey = key.toLowerCase()
  const aliasesByKey: Record<string, string[]> = {
    team: ["time", "equipe", "projeto"],
    task: ["tarefa", "pedido", "demanda"],
    to: ["para", "destino"],
    target: ["alvo"],
    agent: ["agente"],
    justification: ["justificativa", "motivo", "razao", "razão"],
    role: ["papel", "cargo", "funcao", "função"],
    desiredrole: ["papeldesejado", "cargodesejado", "desired_role"],
    requestedrole: ["papelsolicitado", "cargosolicitado", "requested_role"],
    branchname: ["branch", "ramo"],
    successcriteria: ["criteriosdesucesso", "critériosdesucesso"],
    priority: ["prioridade"],
    context: ["contexto"],
    files: ["arquivos"],
  }
  const aliases = aliasesByKey[normalizedKey] ?? []

  return (
    payload[key] ??
    payload[normalizedKey] ??
    payload[key.charAt(0).toUpperCase() + key.slice(1)] ??
    payload[key.toUpperCase()] ??
    payload[key.replace(/(^|-)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)] ??
    payload[normalizedKey.replace(/(^|-)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)] ??
    aliases.flatMap((alias) => [
      payload[alias],
      payload[alias.toLowerCase()],
      payload[alias.toUpperCase()],
      payload[alias.charAt(0).toUpperCase() + alias.slice(1)],
    ]).find((value) => value != null)
  )
}

function isTruthyFlag(value: string | string[] | undefined): boolean {
  const raw = firstPayloadValue(value)
  if (!raw) {
    return false
  }

  return ["true", "1", "yes", "sim"].includes(raw.trim().toLowerCase())
}

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-")
}

function matchesAgentIdentity(agent: Agent, value: string): boolean {
  const normalizedValue = normalizeLookupValue(value)
  const normalizedName = normalizeLookupValue(agent.name)
  const normalizedSlug = normalizeLookupValue(agent.catalogSlug || "")
  const normalizedRole = normalizeLookupValue(agent.role)

  return (
    normalizedName === normalizedValue ||
    normalizedSlug === normalizedValue ||
    normalizedRole === normalizedValue ||
    normalizedName.includes(normalizedValue) ||
    normalizedSlug.includes(normalizedValue) ||
    normalizedValue.includes(normalizedSlug)
  )
}

interface CommandExecutionContext {
  agentId?: string
  teamId?: string
  role?: "global-ceo" | "global-agent" | "tech-lead" | "team-agent"
  agentSlug?: string
}

function buildMarketplaceSupportMessage(): string {
  return `Supported marketplace agents: ${listMarketplaceAgentIdentities().join(", ")}`
}

export class CeoCommandExecutor extends EventEmitter {
  async execute(command: CeoCommand, context: CommandExecutionContext = {}): Promise<void> {
    switch (command.type) {
      case "CREATE_TEAM":
        await this.handleCreateTeam(command)
        break
      case "DELEGATE":
        await this.handleDelegate(command, context)
        break
      case "HIRE_AGENT":
        await this.handleHireAgent(command, context)
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
    const templateId = getPayloadValue(command.payload, "templateId") as string
    const name = getPayloadValue(command.payload, "name") as string
    const projectPath = getPayloadValue(command.payload, "projectPath") as string

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

  private async handleDelegate(command: CeoCommand, context: CommandExecutionContext = {}): Promise<void> {
    const teamName = getPayloadValue(command.payload, "team") as string
    const requestedTask = firstPayloadValue(getPayloadValue(command.payload, "task"))
    const files = payloadToArray(getPayloadValue(command.payload, "files"))
    const targetAgentId = firstPayloadValue(getPayloadValue(command.payload, "agentId"))
    const targetAgentName =
      firstPayloadValue(getPayloadValue(command.payload, "to")) ??
      firstPayloadValue(getPayloadValue(command.payload, "target")) ??
      firstPayloadValue(getPayloadValue(command.payload, "agent"))
    const targetAgentSlug = firstPayloadValue(getPayloadValue(command.payload, "agentSlug"))
    const targetRole = firstPayloadValue(getPayloadValue(command.payload, "role"))
    const autoHire = firstPayloadValue(getPayloadValue(command.payload, "autoHire")) === "true"
    const branchName = firstPayloadValue(getPayloadValue(command.payload, "branchName"))

    const namedTeam = teamName ? this.findTeamByName(teamName) : undefined
    const globalTargetFromTeamField = !namedTeam && teamName ? getGlobalAgentByIdentity(teamName) : undefined
    const contextualTeam = context.teamId ? teamStore.getTeam(context.teamId) : undefined
    const team = namedTeam ?? (globalTargetFromTeamField ? contextualTeam : undefined) ?? contextualTeam

    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName || context.teamId || "unknown"}` })
      return
    }

    const fromAgentName = context.agentId
      ? team.agents.find((agent) => agent.id === context.agentId)?.name
      : undefined

    const resolveTargetAgent = (): Agent | undefined => {
      if (targetAgentId) {
        const byId = team.agents.find((agent) => agent.id === targetAgentId)
        if (byId) return byId
      }

      if (targetAgentSlug) {
        const bySlug = team.agents.find((agent) => matchesAgentIdentity(agent, targetAgentSlug))
        if (bySlug) return bySlug
      }

      if (targetRole) {
        const byRole = team.agents.find((agent) => matchesAgentIdentity(agent, targetRole))
        if (byRole) return byRole
      }

      if (targetAgentName) {
        const byName = team.agents.find((agent) => matchesAgentIdentity(agent, targetAgentName))
        if (byName) return byName
      }

      return undefined
    }

    const resolveGlobalTarget = () => {
      const targetHint = targetAgentSlug || targetRole || targetAgentName || globalTargetFromTeamField?.name
      if (targetHint) {
        return getGlobalAgentByIdentity(targetHint)
      }
      // If no explicit target but we have a staffing role requested, default to HR Global
      if (staffingRole && team) {
        return getGlobalAgentByIdentity("hr-global")
      }
      return undefined
    }

    const hireMissingAgent = (): Agent | undefined => {
      const slugToUse = targetAgentSlug || targetRole || targetAgentName
      if (!slugToUse) {
        return undefined
      }

      const agentEntry = getAgentBySlug(slugToUse) ?? getAgentByIdentity(slugToUse)
      if (!agentEntry) {
        return undefined
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
      return agent
    }

    let targetAgent = resolveTargetAgent() ?? (autoHire ? hireMissingAgent() : undefined)
    const globalTarget = targetAgent ? undefined : resolveGlobalTarget()

    const originalTargetAgent: Agent | undefined = undefined

    const isStaffingRequest =
      Boolean(globalTarget) &&
      (globalTarget.slug === "hr-global" || /rh global/i.test(globalTarget.name))
    const staffingRole =
      firstPayloadValue(getPayloadValue(command.payload, "desiredRole")) ||
      firstPayloadValue(getPayloadValue(command.payload, "role")) ||
      firstPayloadValue(getPayloadValue(command.payload, "position")) ||
      firstPayloadValue(getPayloadValue(command.payload, "profile")) ||
      firstPayloadValue(getPayloadValue(command.payload, "requestedRole"))
    const staffingJustification =
      firstPayloadValue(getPayloadValue(command.payload, "justification")) ||
      firstPayloadValue(getPayloadValue(command.payload, "reason")) ||
      firstPayloadValue(getPayloadValue(command.payload, "context")) ||
      firstPayloadValue(getPayloadValue(command.payload, "why"))
    const staffingAgentIdentity =
      firstPayloadValue(getPayloadValue(command.payload, "agentSlug")) ||
      staffingRole
    const staffingAgent = staffingAgentIdentity
      ? getMarketplaceAgentByIdentity(staffingAgentIdentity)
      : undefined
    const synthesizedStaffingTask =
      staffingAgent && team
        ? `Avaliar e viabilizar contratação/alocação de ${staffingAgent.name} para o time ${team.name}`
        : staffingRole && team
        ? `Avaliar e viabilizar contratação/alocação de ${staffingRole} para o time ${team.name}`
        : team
        ? `Avaliar reforço de capacidade para o time ${team.name}`
        : "Avaliar necessidade de contratação ou alocação para o time"
    const task = requestedTask?.trim() || (isStaffingRequest ? synthesizedStaffingTask : "")

    if (!task) {
      this.emit("error", { command, message: "Missing required field: task" })
      return
    }

    if (globalTarget) {
      if (isStaffingRequest && staffingAgentIdentity && !staffingAgent) {
        this.emit("error", {
          command,
          message: `Unsupported marketplace agent requested for staffing: ${staffingAgentIdentity}. ${buildMarketplaceSupportMessage()}`,
        })
        return
      }

      const normalizedTask = task.trim().toLowerCase()
      const looksLikeEmptyStaffingRequest =
        isStaffingRequest &&
        !staffingRole &&
        !staffingJustification &&
        (normalizedTask === "hire_agent" ||
          normalizedTask === "contratar" ||
          normalizedTask === "contratar agente" ||
          normalizedTask === "hiring" ||
          normalizedTask === "staffing")

      if (looksLikeEmptyStaffingRequest) {
        this.emit("error", {
          command,
          message: "Missing required staffing fields: desiredRole and justification",
        })
        return
      }

      this.emit("task:delegated", {
        team,
        task: {
          id: crypto.randomUUID(),
          teamId: team.id,
          agentId: globalTarget.id,
          description: task,
          files,
          status: "queued",
          branchName,
        },
        fromAgentId: context.agentId || team.techLeadAgentId || globalTarget.id,
        fromAgentName,
      })

      this.emit("agent:handoff", {
        team,
        fromAgentId: context.agentId || team.techLeadAgentId || globalTarget.id,
        fromAgentName,
        toAgentId: globalTarget.id,
        toAgentName: globalTarget.name,
        toAgentSlug: globalTarget.slug,
        toAgentPromptPath: globalTarget.systemPromptPath,
        targetScope: "global",
        teamId: team.id,
        teamName: team.name,
        task,
        payload: command.payload,
        files,
        branchName,
      })
      return
    }

    if (!targetAgent) {
      const fallbackAgentId = team.techLeadAgentId || team.agents[0]?.id
      if (!fallbackAgentId) {
        this.emit("error", { command, message: `No agents available in team: ${team.name}` })
        return
      }

      const pipelineTask = pipelineExecutor.ensureTask({
        teamId: team.id,
        agentId: fallbackAgentId,
        description: task,
        files,
        dependsOn: [],
        branchName,
      }).task

      this.emit("task:delegated", {
        team,
        task: pipelineTask,
        fromAgentId: context.agentId || team.techLeadAgentId || fallbackAgentId,
        fromAgentName,
      })
      return
    }

    // In direct flow, never queue for board - send handoff directly to the executor
    // In hierarchical flow, only queue if target is NOT a Tech Lead
    const shouldQueueBoardIssue = !(targetAgent.isTeamLead || targetAgent.role === "tech-lead")

    if (shouldQueueBoardIssue) {
      const pipelineTask = pipelineExecutor.ensureTask({
        teamId: team.id,
        agentId: targetAgent.id,
        description: task,
        files,
        dependsOn: [],
        branchName,
      }).task

      this.emit("task:delegated", {
        team,
        task: pipelineTask,
        fromAgentId: context.agentId || team.techLeadAgentId || targetAgent.id,
        fromAgentName,
      })
    }

    // Always emit handoff for team agents - in direct flow it's immediate,
    // in hierarchical flow it depends on the routing decision
    this.emit("agent:handoff", {
      team,
      fromAgentId: context.agentId || team.techLeadAgentId || targetAgent.id,
      fromAgentName,
      toAgentId: targetAgent.id,
      toAgentName: targetAgent.name,
      targetScope: "team",
      teamId: team.id,
      teamName: team.name,
      task,
      payload: {
        ...command.payload,
        // When escalating, include original target so Tech Lead knows who was intended
        ...(originalTargetAgent
          ? {
              originalTargetAgentId: originalTargetAgent.id,
              originalTargetAgentName: originalTargetAgent.name,
              originalTargetAgentSlug: originalTargetAgent.catalogSlug,
              escalationReason: `Agent ${originalTargetAgent.catalogSlug} cannot handle this task scope. Routed to Tech Lead for reassignment.`,
            }
          : {}),
      },
      files,
      branchName,
    })
  }

  private async handleHireAgent(command: CeoCommand, context: CommandExecutionContext = {}): Promise<void> {
    const canHireDirectly = context.role === "global-ceo" || context.agentSlug === "hr-global"
    if (!canHireDirectly) {
      this.emit("error", {
        command,
        message: "Direct hiring is restricted to CEO Global or HR Global. Tech leads must request staffing through RH.",
      })
      return
    }

    const teamName = getPayloadValue(command.payload, "team") as string
    const requestedRole =
      firstPayloadValue(getPayloadValue(command.payload, "role")) ||
      firstPayloadValue(getPayloadValue(command.payload, "desiredRole"))
    const agentSlug = firstPayloadValue(getPayloadValue(command.payload, "agentSlug"))

    if (!teamName || !requestedRole) {
      this.emit("error", { command, message: "Missing required fields: team, role" })
      return
    }

    const team = this.findTeamByName(teamName)
    if (!team) {
      this.emit("error", { command, message: `Team not found: ${teamName}` })
      return
    }

    const resolvedRoleAgent = getMarketplaceAgentByIdentity(requestedRole)
    const resolvedSlugAgent = agentSlug ? getMarketplaceAgentByIdentity(agentSlug) : undefined

    if (!resolvedRoleAgent) {
      this.emit("error", {
        command,
        message: `Unsupported marketplace agent requested for hire: ${requestedRole}. ${buildMarketplaceSupportMessage()}`,
      })
      return
    }

    if (agentSlug && !resolvedSlugAgent) {
      this.emit("error", {
        command,
        message: `Unsupported marketplace agent slug requested for hire: ${agentSlug}. ${buildMarketplaceSupportMessage()}`,
      })
      return
    }

    if (resolvedSlugAgent && resolvedSlugAgent.slug !== resolvedRoleAgent.slug) {
      this.emit("error", {
        command,
        message: `Role/agentSlug mismatch for hire request: role=${requestedRole}, agentSlug=${agentSlug}. Use the exact marketplace identity for the same agent.`,
      })
      return
    }

    const agent: Agent = {
      id: crypto.randomUUID(),
      name: resolvedRoleAgent.name,
      role: resolvedRoleAgent.role,
      catalogSlug: resolvedRoleAgent.slug,
      systemPromptPath: resolvedRoleAgent.systemPromptPath || "",
      status: "idle",
      color: resolvedRoleAgent.color,
      currentFiles: [],
      hiredAt: new Date().toISOString(),
    }

    teamStore.addAgentToTeam(team.id, agent)
    this.emit("agent:hired", { team, agent })

    const initialTask =
      firstPayloadValue(getPayloadValue(command.payload, "task")) ||
      firstPayloadValue(getPayloadValue(command.payload, "initialTask")) ||
      firstPayloadValue(getPayloadValue(command.payload, "workItem"))
    if (!initialTask) {
      return
    }

    const title =
      firstPayloadValue(getPayloadValue(command.payload, "title")) ||
      initialTask.slice(0, 90)
    const acceptanceCriteriaRaw = getPayloadValue(command.payload, "successCriteria")
    const acceptanceCriteria = payloadToArray(acceptanceCriteriaRaw)
    const files = payloadToArray(getPayloadValue(command.payload, "files"))
    const requesterAgentId = firstPayloadValue(getPayloadValue(command.payload, "requesterAgentId"))
    const requesterAgentName = firstPayloadValue(getPayloadValue(command.payload, "requesterAgentName"))
    const createdByAgentId = context.agentId
    const createdByAgentName =
      firstPayloadValue(getPayloadValue(command.payload, "createdByAgentName")) ||
      (context.agentSlug === "hr-global" ? "RH Global" : context.agentSlug)
    const branchName = firstPayloadValue(getPayloadValue(command.payload, "branchName"))
    const priority = firstPayloadValue(getPayloadValue(command.payload, "priority"))
    const contextText = firstPayloadValue(getPayloadValue(command.payload, "context"))
    const observations = firstPayloadValue(getPayloadValue(command.payload, "observations"))
    const autoStart = !isTruthyFlag(getPayloadValue(command.payload, "deferBoardDispatch"))

    const pipelineTask = pipelineExecutor.ensureTask({
      teamId: team.id,
      agentId: agent.id,
      title,
      description: initialTask,
      requesterAgentId,
      requesterAgentName,
      createdByAgentId,
      createdByAgentName,
      responsibleAgentRole: agent.role,
      priority,
      context: contextText,
      acceptanceCriteria,
      files,
      dependsOn: [],
      branchName,
      status: "ready",
      observations,
      artifacts: [],
    }).task

    this.emit("task:delegated", {
      team,
      task: pipelineTask,
      fromAgentId: requesterAgentId ?? createdByAgentId ?? agent.id,
      fromAgentName: requesterAgentName ?? createdByAgentName,
      autoStart,
    })
  }

  private async handlePauseTeam(command: CeoCommand): Promise<void> {
    const teamName = getPayloadValue(command.payload, "team") as string

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
    const teamName = getPayloadValue(command.payload, "team") as string

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
    const question = getPayloadValue(command.payload, "question") as string

    if (!question) {
      this.emit("error", { command, message: "Missing required field: question" })
      return
    }

    this.emit("vibe:ceo:ask-human", { question, raw: command.raw })
  }

  private findTeamByName(name: string): Team | undefined {
    const teams = teamStore.listTeams()
    const normalizedInput = normalizeLookupValue(name)

    return teams.find((team) => {
      const candidates = [
        team.name,
        team.projectName || "",
        team.projectPath || "",
        team.projectPath ? team.projectPath.split(/[\\/]/).filter(Boolean).pop() || "" : "",
      ]
        .map((value) => normalizeLookupValue(value))
        .filter(Boolean)

      return candidates.some((candidate) =>
        candidate === normalizedInput ||
        candidate.includes(normalizedInput) ||
        normalizedInput.includes(candidate)
      )
    })
  }
}

export const ceoCommandExecutor = new CeoCommandExecutor()
