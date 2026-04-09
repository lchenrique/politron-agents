// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

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

import { ceoCommandExecutor } from "../../../main/services/ceo-command-executor"
import { pipelineExecutor } from "../../../main/services/pipeline-executor"
import { teamStore } from "../../../main/services/team-store"
import type { Agent } from "../../../main/types/team"
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

function createTeamWithLead() {
  const team = teamStore.createTeam({
    name: "SaaS",
    projectName: "SaaS",
    projectPath: "D:/projetos pessoais/politron/apps/desktop",
  })

  const techLead = createAgent({
    name: "Tech Lead",
    role: "tech-lead",
    catalogSlug: "tech-lead",
    isTeamLead: true,
  } as Partial<Agent>)

  const frontend = createAgent({
    name: "Frontend Developer",
    role: "frontend",
    catalogSlug: "frontend-dev",
  })

  teamStore.addAgentToTeam(team.id, techLead)
  teamStore.addAgentToTeam(team.id, frontend)
  teamStore.setTechLead(team.id, techLead.id)

  return {
    teamId: team.id,
    techLeadId: techLead.id,
  }
}

describe("ceoCommandExecutor staffing flow", () => {
  beforeEach(() => {
    teamStore.hydrate([])
    pipelineExecutor.hydrate([])
    vi.restoreAllMocks()
  })

  it("delegates staffing requests from Tech Lead to RH Global via handoff", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const delegatedSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("task:delegated", delegatedSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        task: "Contratar um QA Engineer para melhorar cobertura de testes",
        desiredRole: "Reality Checker",
        justification: "Cobertura de testes está abaixo do necessário",
        priority: "high",
        successCriteria: "Aumentar a cobertura de regressão e reduzir bugs escapados",
        files: ["src/renderer/src/App.tsx"],
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(delegatedSpy).toHaveBeenCalledOnce()
    expect(handoffSpy).toHaveBeenCalledOnce()

    const handoffEvent = handoffSpy.mock.calls[0][0]
    expect(handoffEvent.targetScope).toBe("global")
    expect(handoffEvent.toAgentId).toBe("hr-global")
    expect(handoffEvent.toAgentName).toBe("RH Global")
    expect(handoffEvent.toAgentSlug).toBe("hr-global")
    expect(handoffEvent.teamId).toBe(teamId)
    expect(handoffEvent.payload).toMatchObject({
      team: "SaaS",
      desiredRole: "Reality Checker",
      justification: "Cobertura de testes está abaixo do necessário",
      priority: "high",
    })

    ceoCommandExecutor.off("task:delegated", delegatedSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("rejects empty staffing requests before they reach RH Global", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const errorSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        task: "hire_agent",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0].message).toContain("Missing required staffing fields")
    expect(handoffSpy).not.toHaveBeenCalled()

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("allows RH handoff with partial staffing context so HR can clarify once", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const errorSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        task: "Avaliar reforço para frontend/UI neste projeto",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(handoffSpy).toHaveBeenCalledOnce()
    expect(handoffSpy.mock.calls[0][0]).toMatchObject({
      targetScope: "global",
      toAgentSlug: "hr-global",
      task: "Avaliar reforço para frontend/UI neste projeto",
    })

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("synthesizes a staffing task when the request already has hiring context", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const errorSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        desiredRole: "UX Designer",
        justification: "Precisamos redesenhar a tela de configurações com foco real de setup",
        priority: "high",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(handoffSpy).toHaveBeenCalledOnce()
    expect(handoffSpy.mock.calls[0][0]).toMatchObject({
      targetScope: "global",
      toAgentSlug: "hr-global",
      task: "Avaliar e viabilizar contratação/alocação de UI Designer para o time SaaS",
      payload: expect.objectContaining({
        desiredRole: "UX Designer",
        justification: "Precisamos redesenhar a tela de configurações com foco real de setup",
      }),
    })

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("rejects contextual RH staffing requests when the desiredRole is not in the marketplace registry", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const errorSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "RH Global",
        desiredRole: "Desenvolvedor Frontend/UI",
        justification: "Precisamos redesenhar a tela de configurações do produto",
        priority: "high",
        successCriteria: "Novo membro consegue assumir o redesign da tela de configurações",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0].message).toContain("Unsupported marketplace agent requested for staffing")
    expect(handoffSpy).not.toHaveBeenCalled()

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("blocks direct hiring when the command comes from Tech Lead", async () => {
    createTeamWithLead()
    const errorSpy = vi.fn()
    const hiredSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:hired", hiredSpy)

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        role: "Reality Checker",
        agentSlug: "reality-checker",
      },
      raw: "[HIRE_AGENT]",
    }

    await ceoCommandExecutor.execute(command, {
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0].message).toContain("restricted")
    expect(hiredSpy).not.toHaveBeenCalled()

    const team = teamStore.listTeams()[0]
    expect(team.agents).toHaveLength(2)

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:hired", hiredSpy)
  })

  it("does not create a board task twice when delegating to a team executor", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const delegatedSpy = vi.fn()
    const handoffSpy = vi.fn()
    const addTaskSpy = vi.spyOn(pipelineExecutor, "addTask")

    ceoCommandExecutor.on("task:delegated", delegatedSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "Frontend Developer",
        task: "Implement settings page",
        files: ["apps/desktop/src/renderer/src/components/ide/SettingsScreen.tsx"],
        directFlow: "true",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(addTaskSpy).not.toHaveBeenCalled()
    expect(delegatedSpy).not.toHaveBeenCalled()
    expect(handoffSpy).toHaveBeenCalledOnce()
    expect(handoffSpy.mock.calls[0][0]).toMatchObject({
      targetScope: "team",
      toAgentName: "Frontend Developer",
      task: "Implement settings page",
    })

    ceoCommandExecutor.off("task:delegated", delegatedSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
    addTaskSpy.mockRestore()
  })

  it("accepts delegate payload fields written in Portuguese", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        time: "SaaS",
        para: "Tech Lead",
        tarefa: "Definir o desiredRole exato para esta vaga",
        justificativa: "Necessário para o RH seguir com a contratação",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(handoffSpy).toHaveBeenCalledOnce()
    expect(handoffSpy.mock.calls[0][0]).toMatchObject({
      targetScope: "team",
      toAgentName: "Tech Lead",
      task: "Definir o desiredRole exato para esta vaga",
    })

    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("allows RH Global to hire into the requested team", async () => {
    createTeamWithLead()
    const hiredSpy = vi.fn()

    ceoCommandExecutor.on("agent:hired", hiredSpy)

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        role: "Reality Checker",
        agentSlug: "reality-checker",
      },
      raw: "[HIRE_AGENT]",
    }

    await ceoCommandExecutor.execute(command, {
      role: "global-agent",
      agentSlug: "hr-global",
      agentId: "hr-global",
    })

    expect(hiredSpy).toHaveBeenCalledOnce()

    const team = teamStore.listTeams()[0]
    const qaAgent = team.agents.find((agent) => agent.catalogSlug === "reality-checker")
    expect(qaAgent).toBeDefined()
    expect(qaAgent?.role).toBe("reality-checker")

    ceoCommandExecutor.off("agent:hired", hiredSpy)
  })

  it("creates an initial ready board task for the newly hired agent when the hiring request includes work context", async () => {
    createTeamWithLead()
    const hiredSpy = vi.fn()
    const delegatedSpy = vi.fn()

    ceoCommandExecutor.on("agent:hired", hiredSpy)
    ceoCommandExecutor.on("task:delegated", delegatedSpy)

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        desiredRole: "UX Designer",
        task: "Redesenhar a tela de configurações para parecer uma tela de configuração, não um dashboard",
        title: "Redesign da tela de configurações",
        priority: "high",
        context: "Separar parametrização de monitoramento e melhorar usabilidade",
        successCriteria: [
          "Protótipo inicial aprovado pelo Tech Lead",
          "Tela sem elementos típicos de dashboard",
        ],
        requesterAgentId: "tech-lead-requester",
        requesterAgentName: "Tech Lead",
        files: ["apps/desktop/src/renderer/src/pages/Index.tsx"],
      },
      raw: "[HIRE_AGENT]",
    }

    await ceoCommandExecutor.execute(command, {
      role: "global-agent",
      agentSlug: "hr-global",
      agentId: "hr-global",
    })

    expect(hiredSpy).toHaveBeenCalledOnce()
    expect(delegatedSpy).toHaveBeenCalledOnce()

    const delegatedTask = delegatedSpy.mock.calls[0][0].task
    expect(delegatedSpy.mock.calls[0][0].autoStart).toBe(true)
    expect(delegatedTask).toMatchObject({
      teamId: teamStore.listTeams()[0].id,
      title: "Redesign da tela de configurações",
      description: "Redesenhar a tela de configurações para parecer uma tela de configuração, não um dashboard",
      status: "ready",
      priority: "high",
      context: "Separar parametrização de monitoramento e melhorar usabilidade",
      requesterAgentId: "tech-lead-requester",
      requesterAgentName: "Tech Lead",
      acceptanceCriteria: [
        "Protótipo inicial aprovado pelo Tech Lead",
        "Tela sem elementos típicos de dashboard",
      ],
      files: ["apps/desktop/src/renderer/src/pages/Index.tsx"],
    })

    ceoCommandExecutor.off("agent:hired", hiredSpy)
    ceoCommandExecutor.off("task:delegated", delegatedSpy)
  })

  it("maps UI/UX Designer hiring requests to the real marketplace agent", async () => {
    createTeamWithLead()
    const hiredSpy = vi.fn()
    const errorSpy = vi.fn()

    ceoCommandExecutor.on("agent:hired", hiredSpy)
    ceoCommandExecutor.on("error", errorSpy)

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        role: "UI/UX Designer",
      },
      raw: `[HIRE_AGENT team="SaaS" role="UI/UX Designer"]`,
    }

    await ceoCommandExecutor.execute(command, {
      agentId: "hr-global",
      role: "global-agent",
      agentSlug: "hr-global",
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(hiredSpy).toHaveBeenCalledOnce()
    expect(hiredSpy.mock.calls[0][0].agent).toMatchObject({
      catalogSlug: "ui-designer",
      role: "ui-designer",
      name: "UI Designer",
    })

    ceoCommandExecutor.off("agent:hired", hiredSpy)
    ceoCommandExecutor.off("error", errorSpy)
  })

  it("rejects staffing requests that name an unsupported marketplace agent", async () => {
    const { teamId, techLeadId } = createTeamWithLead()
    const errorSpy = vi.fn()
    const handoffSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:handoff", handoffSpy)

    const command: CeoCommand = {
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        desiredRole: "QA Ninja",
        justification: "Precisamos reforçar testes",
      },
      raw: "[DELEGATE]",
    }

    await ceoCommandExecutor.execute(command, {
      teamId,
      agentId: techLeadId,
      role: "tech-lead",
      agentSlug: "tech-lead",
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0].message).toContain("Unsupported marketplace agent requested for staffing")
    expect(handoffSpy).not.toHaveBeenCalled()

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:handoff", handoffSpy)
  })

  it("rejects hire requests when role and agentSlug point to different marketplace agents", async () => {
    createTeamWithLead()
    const errorSpy = vi.fn()
    const hiredSpy = vi.fn()

    ceoCommandExecutor.on("error", errorSpy)
    ceoCommandExecutor.on("agent:hired", hiredSpy)

    const command: CeoCommand = {
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        role: "UI Designer",
        agentSlug: "reality-checker",
      },
      raw: "[HIRE_AGENT]",
    }

    await ceoCommandExecutor.execute(command, {
      role: "global-agent",
      agentSlug: "hr-global",
      agentId: "hr-global",
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0].message).toContain("Role/agentSlug mismatch")
    expect(hiredSpy).not.toHaveBeenCalled()

    ceoCommandExecutor.off("error", errorSpy)
    ceoCommandExecutor.off("agent:hired", hiredSpy)
  })
})
