// @vitest-environment node

import { mkdtempSync } from "fs"
import { join } from "path"
import os from "os"
import { DatabaseSync } from "node:sqlite"
import { expect, it, vi } from "vitest"
import type { PipelineTask, Team } from "../../../main/types/team"

it("removes duplicate persisted tasks on load and keeps the richer record", async () => {
  await vi.resetModules()
  const { appStateDb } = await import("../../../main/services/app-state-db")

  const tempDir = mkdtempSync(join(os.tmpdir(), "politron-state-"))
  const dbPath = join(tempDir, "politron-state.sqlite")

  appStateDb.init(tempDir)

  const team: Team = {
    id: "team-1",
    name: "Frontend",
    projectPath: "D:/projects/frontend",
    techLeadAgentId: "lead-1",
    agents: [],
    status: "active",
    pipeline: {
      tasks: [],
      status: "idle",
    },
    createdAt: "2026-04-08T10:00:00.000Z",
  }

  appStateDb.saveTeam(team)

  const richTask: PipelineTask = {
    id: "task-rich",
    teamId: team.id,
    agentId: "agent-1",
    title: "Board issue",
    description: "Implement dashboard",
    requesterAgentId: "lead-1",
    requesterAgentName: "Tech Lead",
    createdByAgentId: "lead-1",
    createdByAgentName: "Tech Lead",
    priority: "high",
    context: "Need to ship the first dashboard",
    acceptanceCriteria: ["Dashboard renders"],
    files: ["src/index.tsx"],
    status: "ready",
    dependsOn: [],
    branchName: "feature/dashboard",
    observations: "Keep it small",
    artifacts: ["screenshot.png"],
    history: [
      {
        id: "history-rich",
        timestamp: "2026-04-08T10:01:00.000Z",
        status: "ready",
        actorAgentId: "lead-1",
        actorAgentName: "Tech Lead",
        note: "Issue criada no board",
      },
    ],
  }

  const duplicateTask: PipelineTask = {
    id: "task-duplicate",
    teamId: team.id,
    agentId: "agent-1",
    title: "Implement dashboard",
    description: "Implement dashboard",
    priority: "high",
    context: "Need to ship the first dashboard",
    acceptanceCriteria: ["Dashboard renders"],
    files: ["src/index.tsx"],
    status: "backlog",
    dependsOn: [],
    branchName: "feature/dashboard",
    history: [],
  }

  appStateDb.saveTask(richTask)
  appStateDb.saveTask(duplicateTask)

  const firstLoad = appStateDb.loadState()
  expect(firstLoad.tasks).toHaveLength(1)
  expect(firstLoad.tasks[0]).toMatchObject({
    id: "task-rich",
    title: "Board issue",
    requesterAgentId: "lead-1",
    createdByAgentId: "lead-1",
  })

  const secondLoad = appStateDb.loadState()
  expect(secondLoad.tasks).toHaveLength(1)
  expect(secondLoad.tasks[0].id).toBe("task-rich")

  const sqlite = new DatabaseSync(dbPath)
  try {
    const row = sqlite.prepare("SELECT COUNT(*) AS count FROM pipeline_tasks").get() as { count: number }
    expect(row.count).toBe(1)
  } finally {
    sqlite.close()
  }
})
