import { EventEmitter } from "events"
import { PipelineTask, PipelineStatus, TaskStatus } from "./types/team"
import { fileLockManager, FileLock } from "./file-lock"
import { appStateDb } from "./app-state-db"

export interface AddTaskInput {
  teamId: string
  agentId: string
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
  files: string[]
  dependsOn: string[]
  branchName?: string
  status?: TaskStatus
  result?: string
  observations?: string
  blockedReason?: string
  artifacts?: string[]
}

export interface StartTaskResult {
  canStart: boolean
  reason?: string
}

export interface EnsureTaskResult {
  task: PipelineTask
  reused: boolean
}

export interface DedupeTasksResult {
  keptTask?: PipelineTask
  cancelledTasks: PipelineTask[]
}

export interface UpdateTaskStatusInput {
  actorAgentId?: string
  actorAgentName?: string
  note?: string
  blockedReason?: string
  result?: string
  observations?: string
}

export class PipelineExecutor extends EventEmitter {
  private tasks: Map<string, PipelineTask> = new Map()

  hydrate(tasks: PipelineTask[]): void {
    this.tasks = new Map(tasks.map((task) => [task.id, task]))
  }

  addTask(input: AddTaskInput): PipelineTask {
    const task: PipelineTask = {
      id: crypto.randomUUID(),
      teamId: input.teamId,
      agentId: input.agentId,
      title: input.title ?? input.description,
      description: input.description,
      requesterAgentId: input.requesterAgentId,
      requesterAgentName: input.requesterAgentName,
      createdByAgentId: input.createdByAgentId,
      createdByAgentName: input.createdByAgentName,
      responsibleAgentRole: input.responsibleAgentRole,
      priority: input.priority,
      context: input.context,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      files: input.files,
      status: input.status ?? "backlog",
      dependsOn: input.dependsOn,
      branchName: input.branchName,
      result: input.result,
      observations: input.observations,
      blockedReason: input.blockedReason,
      artifacts: input.artifacts ?? [],
      history: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          status: input.status ?? "backlog",
          actorAgentId: input.createdByAgentId ?? input.requesterAgentId,
          actorAgentName: input.createdByAgentName ?? input.requesterAgentName,
          note: "Issue criada no board",
        },
      ],
    }

    this.tasks.set(task.id, task)
    appStateDb.saveTask(task)
    this.emit("task:added", task)
    this.emitPipelineStatusChanged(input.teamId)

    return task
  }

  ensureTask(input: AddTaskInput): EnsureTaskResult {
    const existingTask = this.findExistingOpenTask(input)
    if (existingTask) {
      this.appendHistory(
        existingTask,
        existingTask.status,
        "Issue reaproveitada no board; fluxo continuará a partir da task existente",
        input.createdByAgentId ?? input.requesterAgentId,
        input.createdByAgentName ?? input.requesterAgentName
      )

      if (!existingTask.requesterAgentId && input.requesterAgentId) {
        existingTask.requesterAgentId = input.requesterAgentId
      }
      if (!existingTask.requesterAgentName && input.requesterAgentName) {
        existingTask.requesterAgentName = input.requesterAgentName
      }
      if (!existingTask.createdByAgentId && input.createdByAgentId) {
        existingTask.createdByAgentId = input.createdByAgentId
      }
      if (!existingTask.createdByAgentName && input.createdByAgentName) {
        existingTask.createdByAgentName = input.createdByAgentName
      }
      if (!existingTask.responsibleAgentRole && input.responsibleAgentRole) {
        existingTask.responsibleAgentRole = input.responsibleAgentRole
      }
      if (!existingTask.priority && input.priority) {
        existingTask.priority = input.priority
      }
      if (!existingTask.context && input.context) {
        existingTask.context = input.context
      }
      if ((!existingTask.acceptanceCriteria || existingTask.acceptanceCriteria.length === 0) && input.acceptanceCriteria?.length) {
        existingTask.acceptanceCriteria = [...input.acceptanceCriteria]
      }
      if ((!existingTask.files || existingTask.files.length === 0) && input.files.length > 0) {
        existingTask.files = [...input.files]
      }
      if ((!existingTask.dependsOn || existingTask.dependsOn.length === 0) && input.dependsOn.length > 0) {
        existingTask.dependsOn = [...input.dependsOn]
      }
      if (!existingTask.branchName && input.branchName) {
        existingTask.branchName = input.branchName
      }
      if (!existingTask.observations && input.observations) {
        existingTask.observations = input.observations
      }
      if ((!existingTask.artifacts || existingTask.artifacts.length === 0) && input.artifacts?.length) {
        existingTask.artifacts = [...input.artifacts]
      }

      appStateDb.saveTask(existingTask)
      this.emit("task:updated", existingTask)
      this.emitPipelineStatusChanged(existingTask.teamId)
      return { task: existingTask, reused: true }
    }

    return { task: this.addTask(input), reused: false }
  }

  dedupeEquivalentTasks(input: AddTaskInput, options: { preserveInProgress?: boolean } = {}): DedupeTasksResult {
    const matches = this.findMatchingOpenTasks(input)
    if (matches.length <= 1) {
      return {
        keptTask: matches[0],
        cancelledTasks: [],
      }
    }

    const preserveInProgress = options.preserveInProgress !== false
    const keptTask =
      matches.find((task) => preserveInProgress && task.status === "in_progress") ??
      matches[0]

    const cancelledTasks: PipelineTask[] = []
    for (const task of matches) {
      if (task.id === keptTask.id) {
        continue
      }

      if (preserveInProgress && task.status === "in_progress") {
        continue
      }

      const cancelled = this.updateTaskStatus(task.id, "cancelled", {
        note: `Task redundante cancelada; mantida a issue ${keptTask.id}`,
      })
      if (cancelled) {
        cancelledTasks.push(cancelled)
      }
    }

    return {
      keptTask,
      cancelledTasks,
    }
  }

  getTask(taskId: string): PipelineTask | undefined {
    return this.tasks.get(taskId)
  }

  clearTasksByTeam(teamId: string): number {
    const tasksToRemove = Array.from(this.tasks.values()).filter((task) => task.teamId === teamId)
    for (const task of tasksToRemove) {
      this.releaseTaskLocks(task)
      this.tasks.delete(task.id)
      appStateDb.deleteTask(task.id)
    }

    this.emitPipelineStatusChanged(teamId)
    return tasksToRemove.length
  }

  clearAllTasks(): number {
    const tasksToRemove = Array.from(this.tasks.values())
    const affectedTeams = new Set<string>()

    for (const task of tasksToRemove) {
      affectedTeams.add(task.teamId)
      this.releaseTaskLocks(task)
      this.tasks.delete(task.id)
    }

    appStateDb.deleteAllTasks()

    for (const teamId of affectedTeams) {
      this.emitPipelineStatusChanged(teamId)
    }

    return tasksToRemove.length
  }

  getTasksByTeam(teamId: string): PipelineTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.teamId === teamId
    )
  }

  getTasksByAgent(agentId: string): PipelineTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.agentId === agentId
    )
  }

  startTask(taskId: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    const check = this.canStartTask(taskId)
    if (!check.canStart) {
      return undefined
    }

    for (const file of task.files) {
      const lockResult = fileLockManager.acquireLock(file, task.agentId)
      if (!lockResult.success) {
        for (const acquiredFile of task.files) {
          if (task.files.indexOf(acquiredFile) < task.files.indexOf(file)) {
            fileLockManager.releaseLock(acquiredFile, task.agentId)
          }
        }
        return undefined
      }
    }

    task.status = "in_progress"
    task.startedAt = new Date().toISOString()
    this.appendHistory(task, "in_progress", "Tarefa assumida para execução")
    appStateDb.saveTask(task)

    this.emit("task:started", task)
    this.emitPipelineStatusChanged(task.teamId)

    return task
  }

  updateTaskStatus(taskId: string, status: TaskStatus, input: UpdateTaskStatusInput = {}): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    const previousStatus = task.status
    const nextStatus = status

    if (nextStatus === "in_progress") {
      const check = this.canStartTask(taskId)
      if (!check.canStart) {
        return undefined
      }
      for (const file of task.files) {
        const lockResult = fileLockManager.acquireLock(file, task.agentId)
        if (!lockResult.success) {
          this.releaseTaskLocks(task)
          return undefined
        }
      }
      task.startedAt = task.startedAt ?? new Date().toISOString()
    }

    if (previousStatus === "in_progress" && nextStatus !== "in_progress") {
      this.releaseTaskLocks(task)
    }

    task.status = nextStatus

    if (nextStatus === "in_progress") {
      this.appendHistory(task, nextStatus, input.note ?? "Status atualizado manualmente", input.actorAgentId, input.actorAgentName)
    } else if (nextStatus === "in_review") {
      task.finishedAt = new Date().toISOString()
      this.appendHistory(task, nextStatus, input.note ?? "Status atualizado manualmente", input.actorAgentId, input.actorAgentName)
    } else if (nextStatus === "done") {
      task.finishedAt = new Date().toISOString()
      task.result = input.result ?? task.result
      this.appendHistory(task, nextStatus, input.note ?? "Concluída manualmente", input.actorAgentId, input.actorAgentName)
    } else if (nextStatus === "blocked") {
      task.finishedAt = task.finishedAt ?? new Date().toISOString()
      task.blockedReason = input.blockedReason ?? task.blockedReason
      this.appendHistory(task, nextStatus, input.note ?? task.blockedReason ?? "Task blocked", input.actorAgentId, input.actorAgentName)
    } else if (input.note || previousStatus !== nextStatus) {
      this.appendHistory(task, nextStatus, input.note ?? "Status atualizado manualmente", input.actorAgentId, input.actorAgentName)
    }

    if (nextStatus === "ready") {
      task.blockedReason = undefined
    }

    if (input.result !== undefined && nextStatus !== "done") {
      task.result = input.result
    }

    if (input.observations !== undefined) {
      task.observations = input.observations
    }

    if (input.blockedReason !== undefined && nextStatus !== "blocked") {
      task.blockedReason = input.blockedReason
    }

    appStateDb.saveTask(task)
    if (nextStatus === "in_progress") {
      this.emit("task:started", task)
    } else if (nextStatus === "in_review" || nextStatus === "done") {
      this.emit("task:completed", task)
    } else if (nextStatus === "blocked") {
      this.emit("task:blocked", task)
    }
    this.emit("task:updated", task)
    this.emitPipelineStatusChanged(task.teamId)

    return task
  }

  completeTask(taskId: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    task.status = "in_review"
    task.finishedAt = new Date().toISOString()
    this.appendHistory(task, "in_review", "Execução concluída, aguardando revisão")
    appStateDb.saveTask(task)

    for (const file of task.files) {
      fileLockManager.releaseLock(file, task.agentId)
    }

    this.emit("task:completed", task)
    this.emitPipelineStatusChanged(task.teamId)

    this.checkAndUnblockDependentTasks(taskId)

    return task
  }

  failTask(taskId: string, error: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    // CRITICAL FIX: Release locks BEFORE setting blocked status to avoid deadlocks
    for (const file of task.files) {
      fileLockManager.releaseLock(file, task.agentId)
    }

    task.status = "blocked"
    task.error = error
    task.blockedReason = error
    task.finishedAt = new Date().toISOString()
    this.appendHistory(task, "blocked", error)
    appStateDb.saveTask(task)

    this.emit("task:failed", task)
    this.emitPipelineStatusChanged(task.teamId)

    // Also unblock dependent tasks when a task fails
    this.checkAndUnblockDependentTasks(taskId, "cancelled")

    return task
  }

  getTaskLocks(taskId: string): FileLock[] {
    const task = this.tasks.get(taskId)
    if (!task) return []

    return fileLockManager.getLocksByAgent(task.agentId).filter(
      (lock) => task.files.includes(lock.filePath)
    )
  }

  blockTask(taskId: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    task.status = "blocked"
    this.appendHistory(task, "blocked", task.blockedReason ?? "Task blocked")
    appStateDb.saveTask(task)

    this.emit("task:blocked", task)
    this.emitPipelineStatusChanged(task.teamId)

    return task
  }

  unblockTask(taskId: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    const check = this.canStartTask(taskId)
    if (check.canStart) {
      task.status = "ready"
      task.blockedReason = undefined
      this.appendHistory(task, "ready", "Bloqueio removido")
      appStateDb.saveTask(task)
    }

    this.emitPipelineStatusChanged(task.teamId)

    return task
  }

  canStartTask(taskId: string): StartTaskResult {
    const task = this.tasks.get(taskId)
    if (!task) {
      return { canStart: false, reason: "Task not found" }
    }

    if (task.status !== "ready" && task.status !== "blocked") {
      return { canStart: false, reason: `Task status is ${task.status}` }
    }

    for (const depId of task.dependsOn) {
      const depTask = this.tasks.get(depId)
      if (!depTask) {
        return { canStart: false, reason: `Dependency ${depId} not found` }
      }
      if (depTask.status !== "done") {
        return {
          canStart: false,
          reason: `Dependency ${depId} is ${depTask.status}`,
        }
      }
    }

    const hasConflict = this.hasFileConflict(task)
    if (hasConflict) {
      return { canStart: false, reason: "File conflict with running task" }
    }

    const lockCheck = fileLockManager.canLockFiles(task.files, task.agentId)
    if (!lockCheck.canLock) {
      return { canStart: false, reason: "File conflict with locked files" }
    }

    return { canStart: true }
  }

  getPipelineStatus(teamId: string): PipelineStatus {
    const teamTasks = this.getTasksByTeam(teamId)

    if (teamTasks.length === 0) {
      return "idle"
    }

    const hasRunning = teamTasks.some((t) => t.status === "in_progress")
    if (hasRunning) {
      return "running"
    }

    const allDone = teamTasks.every((t) => t.status === "done" || t.status === "cancelled")
    if (allDone) {
      return "done"
    }

    return "idle"
  }

  getReadyTasks(teamId: string): PipelineTask[] {
    const teamTasks = this.getTasksByTeam(teamId)

    return teamTasks.filter((task) => {
      if (task.status !== "ready") return false

      for (const depId of task.dependsOn) {
        const depTask = this.tasks.get(depId)
        if (!depTask || depTask.status !== "done") return false
      }

      const hasConflict = this.hasFileConflict(task)
      if (hasConflict) return false

      return true
    })
  }

  private findExistingOpenTask(input: AddTaskInput): PipelineTask | undefined {
    return this.findMatchingOpenTasks(input)[0]
  }

  private normalizeTaskText(value?: string): string {
    return (value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s./:-]/g, " ")
      .replace(/\s+/g, " ")
  }

  private findMatchingOpenTasks(input: AddTaskInput): PipelineTask[] {
    const comparableTasks = this.getTasksByTeam(input.teamId).filter(
      (task) => task.status !== "done" && task.status !== "cancelled"
    )

    const normalizedTitle = this.normalizeTaskText(input.title ?? input.description)
    const normalizedDescription = this.normalizeTaskText(input.description)
    const normalizedFiles = [...new Set(input.files.map((file) => this.normalizeTaskText(file)).filter(Boolean))].sort()

    return comparableTasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => {
        if (task.agentId !== input.agentId) {
          return false
        }

        const taskTitle = this.normalizeTaskText(task.title)
        const taskDescription = this.normalizeTaskText(task.description)
        const taskFiles = [...new Set(task.files.map((file) => this.normalizeTaskText(file)).filter(Boolean))].sort()

        const sameText =
          (normalizedDescription && normalizedDescription === taskDescription) ||
          (normalizedTitle && normalizedTitle === taskTitle) ||
          (normalizedDescription && normalizedDescription === taskTitle) ||
          (normalizedTitle && normalizedTitle === taskDescription)

        if (!sameText) {
          return false
        }

        if (normalizedFiles.length === 0 || taskFiles.length === 0) {
          return true
        }

        if (normalizedFiles.length !== taskFiles.length) {
          return false
        }

        return normalizedFiles.every((file, index) => file === taskFiles[index])
      })
      .sort((left, right) => {
        const leftCreatedAt = new Date(left.task.history?.[0]?.timestamp ?? left.task.startedAt ?? 0).getTime()
        const rightCreatedAt = new Date(right.task.history?.[0]?.timestamp ?? right.task.startedAt ?? 0).getTime()
        if (rightCreatedAt !== leftCreatedAt) {
          return rightCreatedAt - leftCreatedAt
        }

        // If two tasks were created in the same millisecond, prefer the most recently inserted one.
        return right.index - left.index
      })
      .map(({ task }) => task)
  }

  private hasFileConflict(task: PipelineTask): boolean {
    const runningTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === "in_progress" && t.teamId === task.teamId
    )

    for (const running of runningTasks) {
      const overlap = task.files.filter((f) => running.files.includes(f))
      if (overlap.length > 0) {
        return true
      }
    }

    return false
  }

  private checkAndUnblockDependentTasks(completedTaskId: string, reason: "completed" | "cancelled" = "completed"): void {
    const dependentTasks = Array.from(this.tasks.values()).filter((t) =>
      t.dependsOn.includes(completedTaskId)
    )

    for (const task of dependentTasks) {
      if (task.status === "blocked") {
        if (reason === "cancelled") {
          // If the dependency was cancelled, we should keep the dependent blocked
          // but update the blocked reason to indicate the dependency failed
          task.blockedReason = `Dependency ${completedTaskId} was cancelled`
          this.appendHistory(task, "blocked", task.blockedReason)
        } else {
          this.unblockTask(task.id)
        }
      }
    }
  }

  private emitPipelineStatusChanged(teamId: string): void {
    const status = this.getPipelineStatus(teamId)
    const tasks = this.getTasksByTeam(teamId)
    this.emit("pipeline:status-changed", { teamId, status, tasks })
  }

  private releaseTaskLocks(task: PipelineTask): void {
    for (const file of task.files) {
      fileLockManager.releaseLock(file, task.agentId)
    }
  }

  private appendHistory(task: PipelineTask, status: TaskStatus, note?: string, actorAgentId?: string, actorAgentName?: string): void {
    const history = task.history ?? []
    history.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      status,
      actorAgentId,
      actorAgentName,
      note,
    })
    task.history = history
  }
}

export const pipelineExecutor = new PipelineExecutor()
