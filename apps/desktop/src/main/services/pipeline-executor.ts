import { EventEmitter } from "events"
import { PipelineTask, PipelineStatus, TaskStatus } from "./types/team"
import { fileLockManager, FileLock } from "./file-lock"
import { appStateDb } from "./app-state-db"

export interface AddTaskInput {
  teamId: string
  agentId: string
  description: string
  files: string[]
  dependsOn: string[]
  branchName?: string
}

export interface StartTaskResult {
  canStart: boolean
  reason?: string
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
      description: input.description,
      files: input.files,
      status: "pending" as TaskStatus,
      dependsOn: input.dependsOn,
      branchName: input.branchName,
    }

    this.tasks.set(task.id, task)
    appStateDb.saveTask(task)
    this.emit("task:added", task)
    this.emitPipelineStatusChanged(input.teamId)

    return task
  }

  getTask(taskId: string): PipelineTask | undefined {
    return this.tasks.get(taskId)
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

    task.status = "running"
    task.startedAt = new Date().toISOString()
    appStateDb.saveTask(task)

    this.emit("task:started", task)
    this.emitPipelineStatusChanged(task.teamId)

    return task
  }

  completeTask(taskId: string): PipelineTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    task.status = "done"
    task.finishedAt = new Date().toISOString()
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

    task.status = "failed"
    task.error = error
    task.finishedAt = new Date().toISOString()
    appStateDb.saveTask(task)

    for (const file of task.files) {
      fileLockManager.releaseLock(file, task.agentId)
    }

    this.emit("task:failed", task)
    this.emitPipelineStatusChanged(task.teamId)

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
      task.status = "pending"
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

    if (task.status !== "pending" && task.status !== "blocked") {
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

    const hasFailed = teamTasks.some((t) => t.status === "failed")
    if (hasFailed) {
      return "failed"
    }

    const hasRunning = teamTasks.some((t) => t.status === "running")
    if (hasRunning) {
      return "running"
    }

    const allDone = teamTasks.every((t) => t.status === "done")
    if (allDone) {
      return "done"
    }

    return "idle"
  }

  getReadyTasks(teamId: string): PipelineTask[] {
    const teamTasks = this.getTasksByTeam(teamId)

    return teamTasks.filter((task) => {
      if (task.status !== "pending") return false

      for (const depId of task.dependsOn) {
        const depTask = this.tasks.get(depId)
        if (!depTask || depTask.status !== "done") return false
      }

      const hasConflict = this.hasFileConflict(task)
      if (hasConflict) return false

      return true
    })
  }

  private hasFileConflict(task: PipelineTask): boolean {
    const runningTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === "running" && t.teamId === task.teamId
    )

    for (const running of runningTasks) {
      const overlap = task.files.filter((f) => running.files.includes(f))
      if (overlap.length > 0) {
        return true
      }
    }

    return false
  }

  private checkAndUnblockDependentTasks(completedTaskId: string): void {
    const dependentTasks = Array.from(this.tasks.values()).filter((t) =>
      t.dependsOn.includes(completedTaskId)
    )

    for (const task of dependentTasks) {
      if (task.status === "blocked") {
        this.unblockTask(task.id)
      }
    }
  }

  private emitPipelineStatusChanged(teamId: string): void {
    const status = this.getPipelineStatus(teamId)
    const tasks = this.getTasksByTeam(teamId)
    this.emit("pipeline:status-changed", { teamId, status, tasks })
  }
}

export const pipelineExecutor = new PipelineExecutor()
