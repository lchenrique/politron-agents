// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const pipelineExecutorMock = vi.hoisted(() => ({
  addTask: vi.fn(),
  ensureTask: vi.fn(),
  getPipelineStatus: vi.fn(() => "idle"),
  getReadyTasks: vi.fn(() => []),
  getTask: vi.fn(),
  startTask: vi.fn(),
  blockTask: vi.fn(),
  failTask: vi.fn(),
}))

vi.mock("../../../main/services/app-state-db", () => ({
  appStateDb: {
    init: vi.fn(),
    loadState: vi.fn(() => ({ teams: [], tasks: [] })),
    saveTeam: vi.fn(),
    deleteTeam: vi.fn(),
    saveTask: vi.fn(),
    deleteTask: vi.fn(),
    deleteTasksByTeam: vi.fn(),
  },
}))

vi.mock("../../../main/services/pipeline-executor", () => ({
  pipelineExecutor: pipelineExecutorMock,
}))

import { openCodeSdkService } from "../../../main/services/opencode-sdk"
import { ceoCommandExecutor } from "../../../main/services/ceo-command-executor"
import { sessionStore } from "../../../main/services/session-store"
import { teamStore } from "../../../main/services/team-store"
import type { Agent, PipelineTask, Team } from "../../../main/types/team"
import type { CeoCommand } from "../../../main/types/ceo"

function createAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: crypto.randomUUID(),
    name: "Agent",
    role: "frontend",
    catalogSlug: "frontend-dev",
    systemPromptPath: "dummy.md",
    status: "idle",
    color: "#fff",
    currentFiles: [],
    hiredAt: new Date().toISOString(),
    ...overrides,
  }
}

function createTeam(): Team {
  const team = teamStore.createTeam({
    name: "SaaS",
    projectName: "SaaS",
    projectPath: "D:/projetos pessoais/politron/apps/desktop",
  })

  const techLead = createAgent({
    id: "tech-lead-1",
    name: "Tech Lead",
    role: "tech-lead",
    catalogSlug: "tech-lead",
    isTeamLead: true,
  } as Partial<Agent>)

  teamStore.addAgentToTeam(team.id, techLead)
  teamStore.setTechLead(team.id, techLead.id)

  return teamStore.getTeam(team.id)!
}

function addTeamAgent(team: Team, overrides: Partial<Agent> = {}): Agent {
  const agent = createAgent(overrides)
  teamStore.addAgentToTeam(team.id, agent)
  return agent
}

describe("openCodeSdkService board routing", () => {
  beforeEach(() => {
    teamStore.hydrate([])
    sessionStore.clear()
    vi.clearAllMocks()
    ;(openCodeSdkService as any).delegationOriginsBySessionId.clear()
  })

  it("creates a ready board issue instead of sending a direct handoff to a team executor", async () => {
    const team = createTeam()
    const executor = addTeamAgent(team, {
      id: "frontend-1",
      name: "Frontend Developer",
      role: "frontend",
      catalogSlug: "frontend-dev",
    })

    const delegatedEvents: any[] = []
    const pipelineUpdates: any[] = []
    const task: PipelineTask = {
      id: "task-1",
      teamId: team.id,
      agentId: executor.id,
      title: "Implement dashboard",
      description: "Implement dashboard",
      files: ["src/index.ts"],
      status: "ready",
      dependsOn: [],
      acceptanceCriteria: ["Dashboard renders"],
      history: [],
    }

    pipelineExecutorMock.ensureTask.mockReturnValue({ task, reused: false })
    pipelineExecutorMock.getPipelineStatus.mockReturnValue("idle")

    const sendMessageSpy = vi.spyOn(openCodeSdkService as any, "sendMessageToSession")
    sendMessageSpy.mockResolvedValue(undefined)
    const delegatedListener = (event: any) => delegatedEvents.push(event)
    const pipelineListener = (event: any) => pipelineUpdates.push(event)
    openCodeSdkService.on("vibe:task:delegated", delegatedListener)
    openCodeSdkService.on("vibe:pipeline:update", pipelineListener)

    await (openCodeSdkService as any).routeAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      fromAgentName: "Tech Lead",
      toAgentId: executor.id,
      toAgentName: executor.name,
      teamId: team.id,
      teamName: team.name,
      task: "Implement dashboard",
      payload: {
        title: "Board issue",
        priority: "high",
        context: "Need to ship the first dashboard",
        successCriteria: ["Dashboard renders", "No console errors"],
        notes: "Keep it small",
      },
      files: ["src/index.ts"],
    })

    expect(pipelineExecutorMock.ensureTask).toHaveBeenCalledOnce()
    expect(pipelineExecutorMock.ensureTask).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: team.id,
        agentId: executor.id,
        title: "Board issue",
        description: "Implement dashboard",
        requesterAgentId: "tech-lead-1",
        requesterAgentName: "Tech Lead",
        createdByAgentId: "tech-lead-1",
        createdByAgentName: "Tech Lead",
        responsibleAgentRole: "frontend",
        priority: "high",
        context: "Need to ship the first dashboard",
        acceptanceCriteria: ["Dashboard renders", "No console errors"],
        files: ["src/index.ts"],
        dependsOn: [],
        status: "ready",
        artifacts: [],
        observations: "Keep it small",
      })
    )

    expect(delegatedEvents).toHaveLength(1)
    expect(delegatedEvents[0].task).toMatchObject({
      id: "task-1",
      teamId: team.id,
      status: "ready",
    })
    expect(sendMessageSpy).not.toHaveBeenCalled()

    expect(pipelineUpdates).toHaveLength(1)
    expect(pipelineUpdates[0]).toMatchObject({
      teamId: team.id,
      task: expect.objectContaining({ id: "task-1" }),
      status: "idle",
    })

    openCodeSdkService.off("vibe:task:delegated", delegatedListener)
    openCodeSdkService.off("vibe:pipeline:update", pipelineListener)
    sendMessageSpy.mockRestore()
  })

  it("only dispatches ready board tasks for active teams", async () => {
    const activeTeam = createTeam()
    const activeAgent = addTeamAgent(activeTeam, {
      id: "active-frontend",
      name: "Frontend Developer",
      role: "frontend",
      catalogSlug: "frontend-dev",
    })

    const pausedTeam = createTeam()
    const pausedAgent = addTeamAgent(pausedTeam, {
      id: "paused-frontend",
      name: "Frontend Developer",
      role: "frontend",
      catalogSlug: "frontend-dev",
    })
    teamStore.pauseTeam(pausedTeam.id)

    const activeTask: PipelineTask = {
      id: "active-task",
      teamId: activeTeam.id,
      agentId: activeAgent.id,
      title: "Active task",
      description: "Active task",
      files: [],
      status: "ready",
      dependsOn: [],
      history: [],
    }
    const pausedTask: PipelineTask = {
      id: "paused-task",
      teamId: pausedTeam.id,
      agentId: pausedAgent.id,
      title: "Paused task",
      description: "Paused task",
      files: [],
      status: "ready",
      dependsOn: [],
      history: [],
    }

    pipelineExecutorMock.getReadyTasks.mockImplementation((teamId: string) => {
      if (teamId === activeTeam.id) return [activeTask]
      if (teamId === pausedTeam.id) return [pausedTask]
      return []
    })

    const dispatchSpy = vi.spyOn(openCodeSdkService as any, "dispatchBoardTask").mockResolvedValue(undefined)

    await (openCodeSdkService as any).dispatchReadyBoardTasks()

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(activeTeam.id, "active-task")
    expect(dispatchSpy).not.toHaveBeenCalledWith(pausedTeam.id, "paused-task")

    dispatchSpy.mockRestore()
  })

  it("enriches RH hiring commands with the original staffing context", () => {
    ;(openCodeSdkService as any).requestIdBySessionId.set("session-hr", "request-1")
    ;(openCodeSdkService as any).communicationRequestsById.set("request-1", {
      requestId: "request-1",
      rootRequestId: "request-1",
      requesterAgentId: "tech-lead-1",
      requesterAgentName: "Tech Lead",
      currentAgentId: "hr-global",
      currentAgentName: "RH Global",
      teamId: "team-1",
      teamName: "SaaS",
      task: "Redesenhar a tela de configurações com foco real de setup",
      payload: {
        desiredRole: "UX Designer",
        priority: "high",
        context: "Projeto precisa de reforço em design de configuração",
        successCriteria: ["Protótipo aprovado pelo Tech Lead"],
      },
      files: ["apps/desktop/src/renderer/src/pages/Index.tsx"],
      branchName: "feat/settings-redesign",
      status: "in_progress",
      decisionPipeline: { stage: "staffing", transitions: [] },
      participants: [],
      history: [],
    })

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        agentSlug: "ux-designer",
      },
      raw: "[HIRE_AGENT]",
    }

    const enriched = (openCodeSdkService as any).enrichCommandWithCommunicationContext(command, {
      agentId: "hr-global",
      agentSlug: "hr-global",
    }, "session-hr")

    expect(enriched.payload).toMatchObject({
      team: "SaaS",
      role: "UX Designer",
      desiredRole: "UX Designer",
      task: "Redesenhar a tela de configurações com foco real de setup",
      requesterAgentId: "tech-lead-1",
      requesterAgentName: "Tech Lead",
      priority: "high",
      context: "Projeto precisa de reforço em design de configuração",
      successCriteria: ["Protótipo aprovado pelo Tech Lead"],
      files: ["apps/desktop/src/renderer/src/pages/Index.tsx"],
      branchName: "feat/settings-redesign",
      createdByAgentName: "RH Global",
    })
  })

  it("ignores HIRE_AGENT commands parsed from non-HR sessions during session idle", async () => {
    const team = createTeam()
    sessionStore.setSession({
      agentId: "tech-lead-1",
      teamId: team.id,
      role: "tech-lead",
      status: "busy",
      workspaceDirectory: "D:/projetos pessoais/politron/apps/desktop",
      agentSlug: "tech-lead",
      systemPrompt: undefined,
      systemPromptPath: "dummy.md",
      session: { id: "session-techlead" },
    })

    const executeSpy = vi.spyOn(ceoCommandExecutor, "execute").mockResolvedValue(undefined)
    ;(openCodeSdkService as any).commandOutputBuffers.set(
      "session-techlead",
      '[HIRE_AGENT team="SaaS" role="UI/UX Designer"]'
    )

    await (openCodeSdkService as any).handleSdkEvent({
      type: "session.idle",
      properties: {
        sessionID: "session-techlead",
      },
    })

    expect(executeSpy).not.toHaveBeenCalled()

    executeSpy.mockRestore()
  })

  it("exposes the supported agent marketplace in team and workspace prompts", () => {
    const team = createTeam()

    const teamPrompt = (openCodeSdkService as any).buildTeamContextPrompt(team.id, "tech-lead-1", "tech-lead")
    const workspacePrompt = (openCodeSdkService as any).buildWorkspaceContextPrompt()

    expect(teamPrompt).toContain("[Mercado de agentes disponível]")
    expect(teamPrompt).toContain("Frontend Developer [frontend-developer]")
    expect(teamPrompt).toContain("Software Architect [software-architect]")
    expect(teamPrompt).toContain("Fluxo padrão de staffing")

    expect(workspacePrompt).toContain("[Mercado de agentes disponível]")
    expect(workspacePrompt).toContain("UI Designer [ui-designer]")
    expect(workspacePrompt).toContain("Reality Checker [reality-checker]")
  })

  it("auto-dispatches ready tasks emitted after hiring", async () => {
    const dispatchSpy = vi.spyOn(openCodeSdkService as any, "dispatchBoardTask").mockResolvedValue(undefined)

    ceoCommandExecutor.emit("task:delegated", {
      autoStart: true,
      task: {
        id: "task-hire-1",
        teamId: "team-hire",
        agentId: "ux-1",
        title: "Redesign da tela de configurações",
        description: "Redesign da tela de configurações",
        files: [],
        status: "ready",
        dependsOn: [],
        history: [],
      },
    })

    await Promise.resolve()

    expect(dispatchSpy).toHaveBeenCalledWith("team-hire", "task-hire-1")

    dispatchSpy.mockRestore()
  })
})
