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
    deleteAllTasks: vi.fn(),
  },
}))

import { appStateDb } from "../../../main/services/app-state-db"
import { pipelineExecutor } from "../../../main/services/pipeline-executor"

describe("pipelineExecutor board flow", () => {
  beforeEach(() => {
    pipelineExecutor.hydrate([])
    vi.clearAllMocks()
  })

  it("moves a ready task through in_progress and in_review", () => {
    const task = pipelineExecutor.addTask({
      teamId: "team-1",
      agentId: "agent-1",
      title: "Build dashboard",
      description: "Build dashboard",
      files: ["src/dashboard.tsx"],
      dependsOn: [],
      status: "ready",
      acceptanceCriteria: ["Dashboard renders"],
    })

    expect(task.status).toBe("ready")
    expect(task.history?.[0]).toMatchObject({
      status: "ready",
      note: "Issue criada no board",
    })

    const started = pipelineExecutor.startTask(task.id)
    expect(started?.status).toBe("in_progress")
    expect(started?.startedAt).toBeDefined()
    expect(started?.history?.at(-1)?.status).toBe("in_progress")
    expect(started?.history?.at(-1)?.note).toContain("Tarefa assumida")

    const completed = pipelineExecutor.completeTask(task.id)
    expect(completed?.status).toBe("in_review")
    expect(completed?.finishedAt).toBeDefined()
    expect(completed?.history?.at(-1)?.status).toBe("in_review")
    expect(completed?.history?.at(-1)?.note).toContain("aguardando")
  })

  it("keeps ready tasks in the dispatchable queue and excludes running tasks", () => {
    const readyTask = pipelineExecutor.addTask({
      teamId: "team-2",
      agentId: "agent-ready",
      title: "Ready task",
      description: "Ready task",
      files: ["src/ready.ts"],
      dependsOn: [],
      status: "ready",
    })

    const runningTask = pipelineExecutor.addTask({
      teamId: "team-2",
      agentId: "agent-running",
      title: "Running task",
      description: "Running task",
      files: ["src/running.ts"],
      dependsOn: [],
      status: "ready",
    })

    pipelineExecutor.startTask(runningTask.id)

    expect(pipelineExecutor.getReadyTasks("team-2").map((task) => task.id)).toEqual([readyTask.id])
    expect(pipelineExecutor.getPipelineStatus("team-2")).toBe("running")
  })

  it("allows manual board transitions through in_progress, blocked, and ready", () => {
    const task = pipelineExecutor.addTask({
      teamId: "team-3",
      agentId: "agent-board",
      title: "Editable task",
      description: "Editable task",
      files: ["src/editable.ts"],
      dependsOn: [],
      status: "ready",
    })

    const started = pipelineExecutor.updateTaskStatus(task.id, "in_progress", {
      note: "Started from board",
      actorAgentName: "Board",
    })

    expect(started?.status).toBe("in_progress")
    expect(started?.startedAt).toBeDefined()
    expect(started?.history?.at(-1)?.status).toBe("in_progress")

    const blocked = pipelineExecutor.updateTaskStatus(task.id, "blocked", {
      blockedReason: "Waiting on a dependency",
      note: "Blocked from board",
    })

    expect(blocked?.status).toBe("blocked")
    expect(blocked?.blockedReason).toBe("Waiting on a dependency")
    expect(blocked?.history?.at(-1)?.status).toBe("blocked")

    const readyAgain = pipelineExecutor.updateTaskStatus(task.id, "ready", {
      note: "Unblocked from board",
    })

    expect(readyAgain?.status).toBe("ready")
    expect(readyAgain?.blockedReason).toBeUndefined()
    expect(readyAgain?.history?.at(-1)?.status).toBe("ready")
  })

  it("reuses an open equivalent board task instead of creating a duplicate", () => {
    const original = pipelineExecutor.addTask({
      teamId: "team-dup",
      agentId: "agent-dup",
      title: "Implement settings page",
      description: "Implement settings page",
      files: ["src/settings.tsx"],
      dependsOn: [],
      status: "ready",
    })

    const ensured = pipelineExecutor.ensureTask({
      teamId: "team-dup",
      agentId: "agent-dup",
      title: "Implement settings page",
      description: "Implement settings page",
      files: ["src/settings.tsx"],
      dependsOn: [],
      status: "ready",
    })

    expect(ensured.reused).toBe(true)
    expect(ensured.task.id).toBe(original.id)
    expect(pipelineExecutor.getTasksByTeam("team-dup")).toHaveLength(1)
    expect(ensured.task.history?.at(-1)?.note).toContain("reaproveitada")
  })

  it("cancels older duplicated tasks and keeps the newest one", () => {
    const older = pipelineExecutor.addTask({
      teamId: "team-dedupe",
      agentId: "agent-dedupe",
      title: "Implement settings page",
      description: "Implement settings page",
      files: ["src/settings.tsx"],
      dependsOn: [],
      status: "ready",
    })

    const newer = pipelineExecutor.addTask({
      teamId: "team-dedupe",
      agentId: "agent-dedupe",
      title: "Implement settings page",
      description: "Implement settings page",
      files: ["src/settings.tsx"],
      dependsOn: [],
      status: "ready",
    })

    const result = pipelineExecutor.dedupeEquivalentTasks({
      teamId: "team-dedupe",
      agentId: "agent-dedupe",
      title: "Implement settings page",
      description: "Implement settings page",
      files: ["src/settings.tsx"],
      dependsOn: [],
      status: "ready",
    })

    expect(result.keptTask?.id).toBe(newer.id)
    expect(result.cancelledTasks.map((task) => task.id)).toEqual([older.id])
    expect(pipelineExecutor.getTask(older.id)?.status).toBe("cancelled")
    expect(pipelineExecutor.getTask(newer.id)?.status).toBe("ready")
  })

  it("clears all tasks for one team without touching other teams", () => {
    const teamTask = pipelineExecutor.addTask({
      teamId: "team-a",
      agentId: "agent-a",
      title: "Team task",
      description: "Team task",
      files: [],
      dependsOn: [],
      status: "ready",
    })

    const otherTask = pipelineExecutor.addTask({
      teamId: "team-b",
      agentId: "agent-b",
      title: "Other task",
      description: "Other task",
      files: [],
      dependsOn: [],
      status: "ready",
    })

    const deleted = pipelineExecutor.clearTasksByTeam("team-a")

    expect(deleted).toBe(1)
    expect(pipelineExecutor.getTask(teamTask.id)).toBeUndefined()
    expect(pipelineExecutor.getTask(otherTask.id)).toBeDefined()
    expect((appStateDb as any).deleteTask).toHaveBeenCalledWith(teamTask.id)
  })

  it("clears every task from the board", () => {
    pipelineExecutor.addTask({
      teamId: "team-a",
      agentId: "agent-a",
      title: "Task A",
      description: "Task A",
      files: [],
      dependsOn: [],
      status: "ready",
    })

    pipelineExecutor.addTask({
      teamId: "team-b",
      agentId: "agent-b",
      title: "Task B",
      description: "Task B",
      files: [],
      dependsOn: [],
      status: "ready",
    })

    const deleted = pipelineExecutor.clearAllTasks()

    expect(deleted).toBe(2)
    expect(pipelineExecutor.getTasksByTeam("team-a")).toHaveLength(0)
    expect(pipelineExecutor.getTasksByTeam("team-b")).toHaveLength(0)
    expect((appStateDb as any).deleteAllTasks).toHaveBeenCalledOnce()
  })
})
