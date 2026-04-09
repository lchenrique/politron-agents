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

import { openCodeSdkService } from "../../../main/services/opencode-sdk"
import { sessionStore, type ManagedSession } from "../../../main/services/session-store"
import { teamStore } from "../../../main/services/team-store"
import type { Agent, Team } from "../../../main/types/team"

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

function createGlobalSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    agentId: "hr-global",
    role: "global-agent",
    status: "idle",
    teamId: undefined,
    workspaceDirectory: undefined,
    agentSlug: "hr-global",
    systemPrompt: undefined,
    systemPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
    session: { id: "session-rh" },
    ...overrides,
  }
}

function createTeamSession(agentId: string, teamId: string, agentSlug: string, sessionId: string): ManagedSession {
  return {
    agentId,
    teamId,
    role: agentSlug === "tech-lead" ? "tech-lead" : "team-agent",
    status: "idle",
    workspaceDirectory: "D:/projetos pessoais/politron/apps/desktop",
    agentSlug,
    systemPrompt: undefined,
    systemPromptPath: "dummy.md",
    session: { id: sessionId },
  }
}

describe("openCodeSdkService handoff routing", () => {
  beforeEach(() => {
    teamStore.hydrate([])
    sessionStore.clear()
    vi.restoreAllMocks()
    ;(openCodeSdkService as any).delegationOriginsBySessionId.clear()
  })

  it("creates a global RH session with the right context and forwards the handoff message", async () => {
    const team = createTeam()
    const ensureSessionSpy = vi
      .spyOn(openCodeSdkService, "ensureSession")
      .mockResolvedValue(createGlobalSession())
    const sendMessageToSessionSpy = vi
      .spyOn(openCodeSdkService as any, "sendMessageToSession")
      .mockResolvedValue(undefined)

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      toAgentId: "hr-global",
      toAgentName: "RH Global",
      toAgentSlug: "hr-global",
      toAgentPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
      targetScope: "global",
      task: "Contratar um QA Engineer para o time SaaS",
      payload: {
        team: "SaaS",
        desiredRole: "QA Engineer",
        justification: "Cobertura de testes insuficiente",
        priority: "high",
        successCriteria: "Mais regressões cobertas e menos bugs em produção",
      },
      files: ["src/renderer/src/App.tsx"],
    })

    expect(ensureSessionSpy).toHaveBeenCalledOnce()
    expect(ensureSessionSpy).toHaveBeenCalledWith({
      agentId: "hr-global",
      teamId: undefined,
      role: "global-agent",
      agentSlug: "hr-global",
      workspaceDirectory: "",
      systemPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
    })

    expect(sendMessageToSessionSpy).toHaveBeenCalledOnce()
    expect(sendMessageToSessionSpy.mock.calls[0][0]).toBe("session-rh")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("solicitação")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Pipeline stage: staffing")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Time: SaaS")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Tarefa: Contratar um QA Engineer para o time SaaS")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Solicitação estruturada:")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("desiredRole: QA Engineer")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("justification: Cobertura de testes insuficiente")
    expect(sendMessageToSessionSpy.mock.calls[0][3]).toBe("hr-global")
    expect(sendMessageToSessionSpy.mock.calls[0][5]).toBeUndefined()
    expect(sendMessageToSessionSpy.mock.calls[0][6]).toBeUndefined()
    expect(sendMessageToSessionSpy.mock.calls[0][7]).toBe("global-agent")
    expect(sendMessageToSessionSpy.mock.calls[0][8]).toBe("hr-global")
  })

  it("reuses an existing RH session instead of creating a new one", async () => {
    const team = createTeam()
    sessionStore.setSession(createGlobalSession())

    const ensureSessionSpy = vi.spyOn(openCodeSdkService, "ensureSession")
    const sendMessageToSessionSpy = vi
      .spyOn(openCodeSdkService as any, "sendMessageToSession")
      .mockResolvedValue(undefined)

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      toAgentId: "hr-global",
      toAgentName: "RH Global",
      toAgentSlug: "hr-global",
      toAgentPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
      targetScope: "global",
      task: "Contratar um UI/UX Designer para o time SaaS",
      payload: {
        team: "SaaS",
        desiredRole: "UI/UX Designer",
        justification: "Precisa destravar a experiência da tela principal",
      },
    })

    expect(ensureSessionSpy).not.toHaveBeenCalled()
    expect(sendMessageToSessionSpy).toHaveBeenCalledOnce()
    expect(sendMessageToSessionSpy.mock.calls[0][0]).toBe("session-rh")
  })

  it("delivers partial staffing requests to RH instead of failing before clarification", async () => {
    const team = createTeam()
    const ensureSessionSpy = vi
      .spyOn(openCodeSdkService, "ensureSession")
      .mockResolvedValue(createGlobalSession())
    const sendMessageToSessionSpy = vi
      .spyOn(openCodeSdkService as any, "sendMessageToSession")
      .mockResolvedValue(undefined)

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      toAgentId: "hr-global",
      toAgentName: "RH Global",
      toAgentSlug: "hr-global",
      toAgentPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
      targetScope: "global",
      task: "Avaliar necessidade de reforço para frontend/UI",
      payload: {
        team: "SaaS",
      },
    })

    expect(ensureSessionSpy).toHaveBeenCalledOnce()
    expect(sendMessageToSessionSpy).toHaveBeenCalledOnce()
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Pipeline stage: staffing")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("Solicitação estruturada:")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("desiredRole: não informado")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("justification: não informada")
    expect(sendMessageToSessionSpy.mock.calls[0][1]).toContain("campos faltantes detectados")
  })

  it("tracks a bidirectional request across intermediaries and closes it back at the original requester", async () => {
    const team = createTeam()
    const frontend = addTeamAgent(team, {
      id: "frontend-1",
      name: "Frontend Developer",
      role: "frontend",
      catalogSlug: "frontend-dev",
    })
    const qa = addTeamAgent(team, {
      id: "qa-1",
      name: "QA Engineer",
      role: "qa",
      catalogSlug: "qa-tester",
    })

    sessionStore.setSession(createTeamSession("tech-lead-1", team.id, "tech-lead", "session-techlead"))

    const communicationUpdates: any[] = []
    const sendMessageToSessionSpy = vi
      .spyOn(openCodeSdkService as any, "sendMessageToSession")
      .mockResolvedValue(undefined)
    const ensureSessionSpy = vi
      .spyOn(openCodeSdkService, "ensureSession")
      .mockImplementation(async (input) => {
        const session = createTeamSession(
          input.agentId,
          input.teamId ?? team.id,
          input.agentSlug ?? "team-agent",
          `session-${input.agentId}`
        )
        session.role = input.role
        session.workspaceDirectory = input.workspaceDirectory === "" ? undefined : input.workspaceDirectory
        session.systemPromptPath = input.systemPromptPath
        session.agentSlug = input.agentSlug
        sessionStore.setSession(session)
        return session
      })

    openCodeSdkService.on("vibe:communication:update", (event) => {
      communicationUpdates.push(event)
    })

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      toAgentId: frontend.id,
      toAgentName: frontend.name,
      sourceSessionId: "session-techlead",
      teamId: team.id,
      teamName: team.name,
      task: "Implementar a tela inicial",
    })

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: frontend.id,
      toAgentId: qa.id,
      toAgentName: qa.name,
      sourceSessionId: "session-frontend-1",
      teamId: team.id,
      teamName: team.name,
      task: "Validar regressões da tela inicial",
    })

    await (openCodeSdkService as any).notifyDelegationOrigin(
      "session-qa-1",
      "done",
      "Testes concluídos sem regressões."
    )

    await (openCodeSdkService as any).notifyDelegationOrigin(
      "session-frontend-1",
      "done",
      "Implementação concluída e pronta para revisão."
    )

    expect(ensureSessionSpy).toHaveBeenCalledTimes(2)
    expect(communicationUpdates.length).toBeGreaterThanOrEqual(4)

    const firstUpdate = communicationUpdates[0]
    expect(firstUpdate).toMatchObject({
      requesterAgentId: "tech-lead-1",
      requesterAgentName: "Tech Lead",
      currentAgentId: frontend.id,
      currentAgentName: frontend.name,
      status: "requested",
      decisionPipeline: expect.objectContaining({
        stage: "execution",
      }),
    })

    const nestedHandoffUpdate = communicationUpdates.find(
      (event) => event.currentAgentId === qa.id && event.history?.some((entry: any) => entry.kind === "handoff")
    )
    expect(nestedHandoffUpdate).toBeDefined()
    expect(nestedHandoffUpdate.requestId).toBe(firstUpdate.requestId)
    expect(nestedHandoffUpdate.decisionPipeline.stage).toBe("execution")
    expect(nestedHandoffUpdate.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "tech-lead-1", role: "requester" }),
        expect.objectContaining({ agentId: frontend.id, role: "intermediary" }),
        expect.objectContaining({ agentId: qa.id, role: "executor" }),
      ])
    )

    const finalUpdate = communicationUpdates[communicationUpdates.length - 1]
    expect(finalUpdate.requestId).toBe(firstUpdate.requestId)
    expect(finalUpdate.status).toBe("completed")
    expect(finalUpdate.decisionPipeline.stage).toBe("done")
    expect(finalUpdate.finalResponse).toMatchObject({
      toAgentId: "tech-lead-1",
      fromAgentId: frontend.id,
      status: "completed",
    })

    expect(sendMessageToSessionSpy).toHaveBeenCalledWith(
      "session-techlead",
      expect.stringContaining("Implementação concluída e pronta para revisão."),
      undefined,
      "tech-lead",
      "D:/projetos pessoais/politron/apps/desktop",
      undefined,
      team.id,
      "tech-lead",
      "tech-lead-1"
    )
  })
  it("does not replay structured commands back to the requester in delegation summaries", async () => {
    const team = createTeam()
    sessionStore.setSession(createTeamSession("tech-lead-1", team.id, "tech-lead", "session-techlead"))

    const sendMessageToSessionSpy = vi
      .spyOn(openCodeSdkService as any, "sendMessageToSession")
      .mockResolvedValue(undefined)
    const ensureSessionSpy = vi
      .spyOn(openCodeSdkService, "ensureSession")
      .mockResolvedValue(createGlobalSession())

    await (openCodeSdkService as any).handleAgentHandoff({
      team,
      fromAgentId: "tech-lead-1",
      toAgentId: "hr-global",
      toAgentName: "RH Global",
      toAgentSlug: "hr-global",
      toAgentPromptPath: "D:/projetos pessoais/politron/.opencode/agents/hr-global.md",
      targetScope: "global",
      sourceSessionId: "session-techlead",
      teamId: team.id,
      teamName: team.name,
      task: "Contratação de Desenvolvedor Frontend/UI para o Core Team",
    })

    await (openCodeSdkService as any).notifyDelegationOrigin(
      "session-rh",
      "done",
      [
        "Status: Aprovado. Seguindo com a alocação imediata.",
        "",
        '[HIRE_AGENT(team="Core Team", role="Desenvolvedor Frontend/UI", agentSlug="frontend-ui-ux")]',
        "",
        "Assim que o novo membro estiver integrado ao Core Team, recomendo repassar o contexto para ele.",
      ].join("\n")
    )

    const relayMessage = sendMessageToSessionSpy.mock.calls.find((call) => call[0] === "session-techlead")?.[1]
    expect(relayMessage).toContain("Status: Aprovado. Seguindo com a alocação imediata.")
    expect(relayMessage).toContain("Assim que o novo membro estiver integrado ao Core Team")
    expect(relayMessage).not.toContain("[HIRE_AGENT")
    expect(ensureSessionSpy).toHaveBeenCalledOnce()
  })
})
