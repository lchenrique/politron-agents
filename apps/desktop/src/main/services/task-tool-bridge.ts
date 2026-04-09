import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { teamStore } from "./team-store"
import { pipelineExecutor, type AddTaskInput, type UpdateTaskStatusInput } from "./pipeline-executor"
import type { Agent, PipelineTask, TaskStatus, Team } from "../types/team"

interface BridgeContextInput {
  directory?: string
  worktree?: string
  teamId?: string
  teamName?: string
  agentId?: string
  agentName?: string
}

interface ListTasksInput extends BridgeContextInput {
  status?: TaskStatus | TaskStatus[]
  limit?: number
}

interface EnsureTaskBridgeInput extends BridgeContextInput {
  title?: string
  description: string
  requesterAgentId?: string
  requesterAgentName?: string
  createdByAgentId?: string
  createdByAgentName?: string
  responsibleAgentRole?: string
  priority?: string
  context?: string
  acceptanceCriteria?: string[]
  files?: string[]
  dependsOn?: string[]
  branchName?: string
  status?: TaskStatus
  result?: string
  observations?: string
  blockedReason?: string
  artifacts?: string[]
}

interface DedupeTasksBridgeInput extends BridgeContextInput {
  title?: string
  description: string
  files?: string[]
  preserveInProgress?: boolean
}

interface UpdateTaskBridgeInput extends BridgeContextInput {
  taskId: string
  status?: TaskStatus
  note?: string
  blockedReason?: string
  result?: string
  observations?: string
}

interface StartTaskBridgeInput {
  taskId: string
}

interface CompleteTaskBridgeInput {
  taskId: string
}

type BridgeRequestBody =
  | ListTasksInput
  | EnsureTaskBridgeInput
  | DedupeTasksBridgeInput
  | UpdateTaskBridgeInput
  | StartTaskBridgeInput
  | CompleteTaskBridgeInput
  | undefined

class TaskToolBridge {
  private server: Server | null = null
  private token: string | null = null
  private url: string | null = null

  async ensureStarted(): Promise<{ url: string; token: string }> {
    if (this.server && this.token && this.url) {
      return { url: this.url, token: this.token }
    }

    this.token = randomBytes(24).toString("hex")
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(0, "127.0.0.1", () => {
        this.server!.off("error", reject)
        resolve()
      })
    })

    const address = this.server.address()
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve task tool bridge address")
    }

    this.url = `http://127.0.0.1:${address.port}`
    return { url: this.url, token: this.token }
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    this.server = null
    this.token = null
    this.url = null
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== "POST") {
        this.sendJson(res, 405, { ok: false, error: "Method not allowed" })
        return
      }

      if (!this.isAuthorized(req)) {
        this.sendJson(res, 401, { ok: false, error: "Unauthorized" })
        return
      }

      const body = await this.readJsonBody(req)
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname

      if (pathname === "/tasks/list") {
        const result = this.handleList(body as ListTasksInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/get") {
        const result = this.handleGet(body as { taskId?: string })
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/ensure") {
        const result = this.handleEnsure(body as EnsureTaskBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/update") {
        const result = this.handleUpdate(body as UpdateTaskBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/dedupe") {
        const result = this.handleDedupe(body as DedupeTasksBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/start") {
        const result = this.handleStart(body as StartTaskBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/complete") {
        const result = this.handleComplete(body as CompleteTaskBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (pathname === "/tasks/remove") {
        const result = this.handleRemove(body as UpdateTaskBridgeInput)
        this.sendJson(res, 200, { ok: true, ...result })
        return
      }

      this.sendJson(res, 404, { ok: false, error: "Not found" })
    } catch (error) {
      this.sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const provided = req.headers["x-politron-task-token"]
    if (typeof provided !== "string" || !this.token) {
      return false
    }

    const expected = Buffer.from(this.token)
    const actual = Buffer.from(provided)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  private async readJsonBody(req: IncomingMessage): Promise<BridgeRequestBody> {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    if (chunks.length === 0) {
      return undefined
    }

    const raw = Buffer.concat(chunks).toString("utf8").trim()
    if (!raw) return undefined
    return JSON.parse(raw) as BridgeRequestBody
  }

  private sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify(payload))
  }

  private handleList(input: ListTasksInput = {}): { team: Team; tasks: PipelineTask[] } {
    const team = this.resolveTeam(input)
    let tasks = pipelineExecutor.getTasksByTeam(team.id)

    const requestedStatuses = Array.isArray(input.status)
      ? input.status
      : input.status
      ? [input.status]
      : []

    if (requestedStatuses.length > 0) {
      const allowed = new Set(requestedStatuses)
      tasks = tasks.filter((task) => allowed.has(task.status))
    }

    const agent = this.resolveAgent(team, input)
    if (agent) {
      tasks = tasks.filter((task) => task.agentId === agent.id)
    }

    const limit = typeof input.limit === "number" && input.limit > 0 ? input.limit : tasks.length
    return {
      team,
      tasks: tasks.slice(0, limit),
    }
  }

  private handleGet(input: { taskId?: string } = {}): { task: PipelineTask } {
    if (!input.taskId) {
      throw new Error("taskId is required")
    }

    const task = pipelineExecutor.getTask(input.taskId)
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`)
    }

    return { task }
  }

  private handleEnsure(input: EnsureTaskBridgeInput): { team: Team; task: PipelineTask; reused: boolean } {
    if (!input.description?.trim()) {
      throw new Error("description is required")
    }

    const team = this.resolveTeam(input)
    const agent = this.resolveAgent(team, input, true)

    const payload: AddTaskInput = {
      teamId: team.id,
      agentId: agent.id,
      title: input.title,
      description: input.description,
      requesterAgentId: input.requesterAgentId,
      requesterAgentName: input.requesterAgentName,
      createdByAgentId: input.createdByAgentId,
      createdByAgentName: input.createdByAgentName,
      responsibleAgentRole: input.responsibleAgentRole ?? agent.role,
      priority: input.priority,
      context: input.context,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      files: input.files ?? [],
      dependsOn: input.dependsOn ?? [],
      branchName: input.branchName,
      status: input.status,
      result: input.result,
      observations: input.observations,
      blockedReason: input.blockedReason,
      artifacts: input.artifacts ?? [],
    }

    const ensured = pipelineExecutor.ensureTask(payload)
    return {
      team,
      task: ensured.task,
      reused: ensured.reused,
    }
  }

  private handleUpdate(input: UpdateTaskBridgeInput): { task: PipelineTask } {
    if (!input.taskId) {
      throw new Error("taskId is required")
    }

    const existingTask = pipelineExecutor.getTask(input.taskId)
    if (!existingTask) {
      throw new Error(`Task not found: ${input.taskId}`)
    }

    const team = teamStore.getTeam(existingTask.teamId)
    if (!team) {
      throw new Error(`Team not found for task ${input.taskId}`)
    }

    const actor = this.resolveAgent(team, input)
    const actorAgentId = actor?.id
    const actorAgentName = actor?.name ?? input.agentName

    const nextStatus = input.status ?? existingTask.status
    const updateInput: UpdateTaskStatusInput = {
      actorAgentId,
      actorAgentName,
      note: input.note,
      blockedReason: input.blockedReason,
      result: input.result,
      observations: input.observations,
    }

    const task = pipelineExecutor.updateTaskStatus(input.taskId, nextStatus, updateInput)
    if (!task) {
      throw new Error(`Unable to update task ${input.taskId}`)
    }

    return { task }
  }

  private handleDedupe(input: DedupeTasksBridgeInput): {
    team: Team
    keptTask?: PipelineTask
    cancelledTasks: PipelineTask[]
  } {
    if (!input.description?.trim()) {
      throw new Error("description is required")
    }

    const team = this.resolveTeam(input)
    const agent = this.resolveAgent(team, input, true)
    const result = pipelineExecutor.dedupeEquivalentTasks(
      {
        teamId: team.id,
        agentId: agent.id,
        title: input.title,
        description: input.description,
        files: input.files ?? [],
        dependsOn: [],
      },
      {
        preserveInProgress: input.preserveInProgress,
      }
    )

    return {
      team,
      keptTask: result.keptTask,
      cancelledTasks: result.cancelledTasks,
    }
  }

  private handleStart(input: StartTaskBridgeInput): { task: PipelineTask } {
    if (!input.taskId) {
      throw new Error("taskId is required")
    }

    const task = pipelineExecutor.startTask(input.taskId)
    if (!task) {
      const reason = pipelineExecutor.canStartTask(input.taskId).reason ?? "Unable to start task"
      throw new Error(reason)
    }

    return { task }
  }

  private handleComplete(input: CompleteTaskBridgeInput): { task: PipelineTask } {
    if (!input.taskId) {
      throw new Error("taskId is required")
    }

    const task = pipelineExecutor.completeTask(input.taskId)
    if (!task) {
      throw new Error(`Unable to complete task ${input.taskId}`)
    }

    return { task }
  }

  private handleRemove(input: UpdateTaskBridgeInput): { task: PipelineTask } {
    if (!input.taskId) {
      throw new Error("taskId is required")
    }

    const existingTask = pipelineExecutor.getTask(input.taskId)
    if (!existingTask) {
      throw new Error(`Task not found: ${input.taskId}`)
    }

    const team = teamStore.getTeam(existingTask.teamId)
    if (!team) {
      throw new Error(`Team not found for task ${input.taskId}`)
    }

    const actor = this.resolveAgent(team, input)
    const task = pipelineExecutor.updateTaskStatus(input.taskId, "cancelled", {
      actorAgentId: actor?.id,
      actorAgentName: actor?.name ?? input.agentName,
      note: input.note ?? "Task cancelada via tool",
      observations: input.observations,
    })

    if (!task) {
      throw new Error(`Unable to cancel task ${input.taskId}`)
    }

    return { task }
  }

  private resolveTeam(input: BridgeContextInput): Team {
    if (input.teamId) {
      const byId = teamStore.getTeam(input.teamId)
      if (byId) return byId
    }

    const teams = teamStore.listTeams()

    if (input.teamName) {
      const teamNameKey = this.normalize(input.teamName)
      const byName = teams.find((team) => this.normalize(team.name) === teamNameKey)
      if (byName) return byName
    }

    const locationCandidates = [input.directory, input.worktree]
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalizePath(value))

    for (const candidate of locationCandidates) {
      const direct = teams.find((team) => this.normalizePath(team.projectPath) === candidate)
      if (direct) return direct
    }

    for (const candidate of locationCandidates) {
      const parentMatch = teams.find((team) => {
        const teamPath = this.normalizePath(team.projectPath)
        return candidate.startsWith(`${teamPath}/`) || candidate.startsWith(`${teamPath}\\`)
      })
      if (parentMatch) return parentMatch
    }

    throw new Error("Unable to resolve team for task tool request")
  }

  private resolveAgent(team: Team, input: BridgeContextInput, required = false): Agent | undefined {
    if (input.agentId) {
      const byId = team.agents.find((agent) => agent.id === input.agentId)
      if (byId) return byId
    }

    if (input.agentName) {
      const agentNameKey = this.normalize(input.agentName)
      const byName = team.agents.find((agent) => {
        return (
          this.normalize(agent.name) === agentNameKey ||
          this.normalize(agent.catalogSlug) === agentNameKey ||
          this.normalize(agent.role) === agentNameKey
        )
      })
      if (byName) return byName
    }

    if (required) {
      throw new Error(`Unable to resolve agent in team ${team.name}`)
    }

    return undefined
  }

  private normalize(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  }

  private normalizePath(value: string): string {
    return value.trim().replace(/\//g, "\\").toLowerCase()
  }
}

export const taskToolBridge = new TaskToolBridge()
