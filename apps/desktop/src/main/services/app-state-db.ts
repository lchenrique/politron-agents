import { mkdirSync, existsSync } from "fs"
import { join } from "path"
import { DatabaseSync } from "node:sqlite"
import type { Agent, PipelineTask, Team, TaskStatus } from "../types/team"
import { getAgentBySlug } from "./agent-catalog"

function normalizeCatalogSlug(role: string, catalogSlug: string): string {
  if (role === "tech-lead") return "tech-lead"
  if (role === "frontend") return "frontend-dev"
  if (role === "backend") return "backend-dev"
  if (role === "qa") return "qa-tester"
  if (role === "devops") return "devops-eng"
  if (role === "design") return "ux-designer"
  if (role === "ceo") return "ceo"
  if (role === "global-ceo") return "ceo"
  if (role === "team-agent" && (catalogSlug === "software-architect" || catalogSlug === "studio-producer")) {
    return "tech-lead"
  }

  return catalogSlug
}

function normalizeSystemPromptPath(catalogSlug: string, currentPath: string): string {
  const catalogAgent = getAgentBySlug(catalogSlug)
  return catalogAgent?.systemPromptPath || currentPath
}

function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  switch ((status || "").toLowerCase()) {
    case "pending":
    case "waiting":
      return "backlog"
    case "running":
    case "in_progress":
      return "in_progress"
    case "done":
      return "done"
    case "failed":
      return "blocked"
    case "blocked":
      return "blocked"
    case "in_review":
      return "in_review"
    case "cancelled":
      return "cancelled"
    case "triage":
      return "triage"
    case "ready":
      return "ready"
    default:
      return "backlog"
  }
}

function parseJsonArray<T = string>(value: string | null | undefined, fallback: T[] = [] as T[]): T[] {
  if (!value) {
    return fallback
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function parseTaskHistory(value: string | null | undefined): NonNullable<PipelineTask["history"]> {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((entry: any) => ({
      id: typeof entry?.id === "string" ? entry.id : crypto.randomUUID(),
      timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
      status: normalizeTaskStatus(typeof entry?.status === "string" ? entry.status : undefined),
      actorAgentId: typeof entry?.actorAgentId === "string" ? entry.actorAgentId : undefined,
      actorAgentName: typeof entry?.actorAgentName === "string" ? entry.actorAgentName : undefined,
      note: typeof entry?.note === "string" ? entry.note : undefined
    }))
  } catch {
    return []
  }
}

function normalizeSignatureText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeSignatureArray(value: string[] | undefined): string {
  return JSON.stringify((value ?? []).map((item) => normalizeSignatureText(item)))
}

function getTaskDuplicateSignature(task: PipelineTask): string {
  return [
    task.teamId,
    task.agentId,
    normalizeSignatureText(task.description),
    normalizeSignatureArray(task.files),
    normalizeSignatureText(task.branchName),
    normalizeSignatureText(task.context),
    normalizeSignatureArray(task.acceptanceCriteria),
    normalizeSignatureArray(task.dependsOn),
    normalizeSignatureText(task.priority),
  ].join("::")
}

function getTaskStatusWeight(status: TaskStatus): number {
  switch (status) {
    case "done":
      return 60
    case "in_review":
      return 50
    case "blocked":
      return 40
    case "in_progress":
      return 30
    case "ready":
      return 20
    case "triage":
      return 10
    case "backlog":
      return 0
    case "cancelled":
      return -10
    default:
      return 0
  }
}

function getTaskCompletenessScore(task: PipelineTask): number {
  let score = getTaskStatusWeight(task.status)
  const nonEmpty = (value?: string | null) => (value && value.trim() ? 1 : 0)

  score += nonEmpty(task.title)
  score += nonEmpty(task.requesterAgentId) * 2
  score += nonEmpty(task.requesterAgentName)
  score += nonEmpty(task.createdByAgentId) * 2
  score += nonEmpty(task.createdByAgentName)
  score += nonEmpty(task.responsibleAgentRole)
  score += nonEmpty(task.priority)
  score += nonEmpty(task.context)
  score += nonEmpty(task.branchName)
  score += nonEmpty(task.result) * 2
  score += nonEmpty(task.observations)
  score += nonEmpty(task.blockedReason)
  score += nonEmpty(task.error)
  score += task.acceptanceCriteria?.length ?? 0
  score += task.files?.length ?? 0
  score += task.dependsOn?.length ?? 0
  score += task.artifacts?.length ?? 0
  score += (task.history?.length ?? 0) * 2
  score += task.startedAt ? 4 : 0
  score += task.finishedAt ? 6 : 0

  return score
}

function dedupePersistedTasks(tasks: PipelineTask[]): { tasks: PipelineTask[]; duplicateIds: string[] } {
  const tasksBySignature = new Map<string, PipelineTask[]>()
  for (const task of tasks) {
    const signature = getTaskDuplicateSignature(task)
    const group = tasksBySignature.get(signature) ?? []
    group.push(task)
    tasksBySignature.set(signature, group)
  }

  const dedupedTasks: PipelineTask[] = []
  const duplicateIds: string[] = []

  for (const group of tasksBySignature.values()) {
    if (group.length === 1) {
      dedupedTasks.push(group[0])
      continue
    }

    const survivor = group.reduce((best, candidate) => {
      const bestScore = getTaskCompletenessScore(best)
      const candidateScore = getTaskCompletenessScore(candidate)
      return candidateScore > bestScore ? candidate : best
    })

    dedupedTasks.push(survivor)
    for (const task of group) {
      if (task.id !== survivor.id) {
        duplicateIds.push(task.id)
      }
    }
  }

  return { tasks: dedupedTasks, duplicateIds }
}

interface PersistedState {
  teams: Team[]
  tasks: PipelineTask[]
}

class AppStateDb {
  private db: DatabaseSync | null = null

  init(baseDir: string): void {
    if (this.db) {
      return
    }

    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true })
    }

    const dbPath = join(baseDir, "politron-state.sqlite")
    this.db = new DatabaseSync(dbPath)
    this.db.exec("PRAGMA foreign_keys = ON;")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        project_name TEXT,
        project_color TEXT,
        tech_lead_agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        template_id TEXT
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        catalog_slug TEXT NOT NULL,
        system_prompt_path TEXT NOT NULL,
        status TEXT NOT NULL,
        color TEXT NOT NULL,
        current_files_json TEXT NOT NULL,
        session_id TEXT,
        hired_at TEXT NOT NULL,
        is_team_lead INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pipeline_tasks (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT,
        description TEXT NOT NULL,
        requester_agent_id TEXT,
        requester_agent_name TEXT,
        created_by_agent_id TEXT,
        created_by_agent_name TEXT,
        responsible_agent_role TEXT,
        priority TEXT,
        context TEXT,
        acceptance_criteria_json TEXT,
        files_json TEXT NOT NULL,
        status TEXT NOT NULL,
        depends_on_json TEXT NOT NULL,
        branch_name TEXT,
        started_at TEXT,
        finished_at TEXT,
        result TEXT,
        observations TEXT,
        blocked_reason TEXT,
        artifacts_json TEXT,
        history_json TEXT,
        error TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
    `)

    this.ensurePipelineTaskColumns()
  }

  private ensurePipelineTaskColumns(): void {
    const columns = new Set<string>(
      (this.database.prepare(`PRAGMA table_info(pipeline_tasks)`).all() as any[]).map((row) => String(row.name))
    )

    const requiredColumns: Array<{ name: string; sql: string }> = [
      { name: "title", sql: "ALTER TABLE pipeline_tasks ADD COLUMN title TEXT" },
      { name: "requester_agent_id", sql: "ALTER TABLE pipeline_tasks ADD COLUMN requester_agent_id TEXT" },
      { name: "requester_agent_name", sql: "ALTER TABLE pipeline_tasks ADD COLUMN requester_agent_name TEXT" },
      { name: "created_by_agent_id", sql: "ALTER TABLE pipeline_tasks ADD COLUMN created_by_agent_id TEXT" },
      { name: "created_by_agent_name", sql: "ALTER TABLE pipeline_tasks ADD COLUMN created_by_agent_name TEXT" },
      { name: "responsible_agent_role", sql: "ALTER TABLE pipeline_tasks ADD COLUMN responsible_agent_role TEXT" },
      { name: "priority", sql: "ALTER TABLE pipeline_tasks ADD COLUMN priority TEXT" },
      { name: "context", sql: "ALTER TABLE pipeline_tasks ADD COLUMN context TEXT" },
      { name: "acceptance_criteria_json", sql: "ALTER TABLE pipeline_tasks ADD COLUMN acceptance_criteria_json TEXT" },
      { name: "result", sql: "ALTER TABLE pipeline_tasks ADD COLUMN result TEXT" },
      { name: "observations", sql: "ALTER TABLE pipeline_tasks ADD COLUMN observations TEXT" },
      { name: "blocked_reason", sql: "ALTER TABLE pipeline_tasks ADD COLUMN blocked_reason TEXT" },
      { name: "artifacts_json", sql: "ALTER TABLE pipeline_tasks ADD COLUMN artifacts_json TEXT" },
      { name: "history_json", sql: "ALTER TABLE pipeline_tasks ADD COLUMN history_json TEXT" },
    ]

    for (const column of requiredColumns) {
      if (!columns.has(column.name)) {
        this.database.prepare(column.sql).run()
      }
    }
  }

  private get database(): DatabaseSync {
    if (!this.db) {
      throw new Error("AppStateDb not initialized")
    }
    return this.db
  }

  loadState(): PersistedState {
    const teamRows = this.database.prepare(`
      SELECT id, name, project_path, project_name, project_color, tech_lead_agent_id, status, created_at, template_id
      FROM teams
      ORDER BY created_at ASC
    `).all() as any[]

    const agentRows = this.database.prepare(`
      SELECT id, team_id, name, role, catalog_slug, system_prompt_path, status, color, current_files_json, session_id, hired_at, is_team_lead
      FROM agents
      ORDER BY hired_at ASC
    `).all() as any[]

    const taskRows = this.database.prepare(`
      SELECT id, team_id, agent_id, title, description, requester_agent_id, requester_agent_name, created_by_agent_id, created_by_agent_name, responsible_agent_role, priority, context, acceptance_criteria_json, files_json, status, depends_on_json, branch_name, started_at, finished_at, result, observations, blocked_reason, artifacts_json, history_json, error
      FROM pipeline_tasks
      ORDER BY COALESCE(started_at, finished_at, id) ASC
    `).all() as any[]

    const agentsByTeam = new Map<string, Agent[]>()
    const migratedTeamIds = new Set<string>()
    for (const row of agentRows) {
      const normalizedCatalogSlug = normalizeCatalogSlug(row.role, row.catalog_slug)
      const normalizedSystemPromptPath = normalizeSystemPromptPath(normalizedCatalogSlug, row.system_prompt_path)

      if (
        normalizedCatalogSlug !== row.catalog_slug ||
        normalizedSystemPromptPath !== row.system_prompt_path
      ) {
        migratedTeamIds.add(row.team_id)
      }

      const agent: Agent = {
        id: row.id,
        name: row.name,
        role: row.role,
        catalogSlug: normalizedCatalogSlug,
        systemPromptPath: normalizedSystemPromptPath,
        status: row.status,
        color: row.color,
        currentFiles: JSON.parse(row.current_files_json || "[]"),
        sessionId: row.session_id ?? undefined,
        hiredAt: row.hired_at,
        ...(row.is_team_lead ? { isTeamLead: true } : {})
      } as Agent & { isTeamLead?: boolean }

      const agents = agentsByTeam.get(row.team_id) ?? []
      agents.push(agent)
      agentsByTeam.set(row.team_id, agents)
    }

    const tasks: PipelineTask[] = taskRows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      agentId: row.agent_id,
      title: row.title ?? row.description,
      description: row.description,
      requesterAgentId: row.requester_agent_id ?? undefined,
      requesterAgentName: row.requester_agent_name ?? undefined,
      createdByAgentId: row.created_by_agent_id ?? undefined,
      createdByAgentName: row.created_by_agent_name ?? undefined,
      responsibleAgentRole: row.responsible_agent_role ?? undefined,
      priority: row.priority ?? undefined,
      context: row.context ?? undefined,
      acceptanceCriteria: parseJsonArray<string>(row.acceptance_criteria_json, []),
      files: parseJsonArray<string>(row.files_json, []),
      status: normalizeTaskStatus(row.status),
      dependsOn: parseJsonArray<string>(row.depends_on_json, []),
      branchName: row.branch_name ?? undefined,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      result: row.result ?? undefined,
      observations: row.observations ?? undefined,
      blockedReason: row.blocked_reason ?? undefined,
      artifacts: parseJsonArray<string>(row.artifacts_json, []),
      history: parseTaskHistory(row.history_json),
      error: row.error ?? undefined
    }))

    const { tasks: dedupedTasks, duplicateIds } = dedupePersistedTasks(tasks)
    if (duplicateIds.length > 0) {
      const deleteTask = this.database.prepare(`DELETE FROM pipeline_tasks WHERE id = ?`)
      for (const duplicateId of duplicateIds) {
        deleteTask.run(duplicateId)
      }
    }

    const tasksByTeam = new Map<string, PipelineTask[]>()
    for (const task of dedupedTasks) {
      const teamTasks = tasksByTeam.get(task.teamId) ?? []
      teamTasks.push(task)
      tasksByTeam.set(task.teamId, teamTasks)
    }

    const teams: Team[] = teamRows.map((row) => ({
      id: row.id,
      name: row.name,
      projectPath: row.project_path,
      projectName: row.project_name ?? undefined,
      projectColor: row.project_color ?? undefined,
      techLeadAgentId: row.tech_lead_agent_id,
      agents: agentsByTeam.get(row.id) ?? [],
      status: row.status,
      pipeline: {
        tasks: tasksByTeam.get(row.id) ?? [],
        status: "idle"
      },
      createdAt: row.created_at,
      templateId: row.template_id ?? undefined
    }))

    // Persist identity migration so next startup already comes normalized.
    for (const team of teams) {
      if (migratedTeamIds.has(team.id)) {
        this.saveTeam(team)
      }
    }

    return { teams, tasks: dedupedTasks }
  }

  saveTeam(team: Team): void {
    this.database.prepare(`
      INSERT INTO teams (id, name, project_path, project_name, project_color, tech_lead_agent_id, status, created_at, template_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        project_path = excluded.project_path,
        project_name = excluded.project_name,
        project_color = excluded.project_color,
        tech_lead_agent_id = excluded.tech_lead_agent_id,
        status = excluded.status,
        created_at = excluded.created_at,
        template_id = excluded.template_id
    `).run(
      team.id,
      team.name,
      team.projectPath,
      team.projectName ?? null,
      team.projectColor ?? null,
      team.techLeadAgentId,
      team.status,
      team.createdAt,
      team.templateId ?? null
    )

    this.database.prepare(`DELETE FROM agents WHERE team_id = ?`).run(team.id)
    const insertAgent = this.database.prepare(`
      INSERT INTO agents (id, team_id, name, role, catalog_slug, system_prompt_path, status, color, current_files_json, session_id, hired_at, is_team_lead)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const agent of team.agents) {
      insertAgent.run(
        agent.id,
        team.id,
        agent.name,
        agent.role,
        agent.catalogSlug,
        agent.systemPromptPath,
        agent.status,
        agent.color,
        JSON.stringify(agent.currentFiles ?? []),
        agent.sessionId ?? null,
        agent.hiredAt,
        "isTeamLead" in agent && (agent as any).isTeamLead ? 1 : 0
      )
    }
  }

  deleteTeam(teamId: string): void {
    this.database.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId)
  }

  saveTask(task: PipelineTask): void {
    this.database.prepare(`
      INSERT INTO pipeline_tasks (id, team_id, agent_id, title, description, requester_agent_id, requester_agent_name, created_by_agent_id, created_by_agent_name, responsible_agent_role, priority, context, acceptance_criteria_json, files_json, status, depends_on_json, branch_name, started_at, finished_at, result, observations, blocked_reason, artifacts_json, history_json, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        team_id = excluded.team_id,
        agent_id = excluded.agent_id,
        title = excluded.title,
        description = excluded.description,
        requester_agent_id = excluded.requester_agent_id,
        requester_agent_name = excluded.requester_agent_name,
        created_by_agent_id = excluded.created_by_agent_id,
        created_by_agent_name = excluded.created_by_agent_name,
        responsible_agent_role = excluded.responsible_agent_role,
        priority = excluded.priority,
        context = excluded.context,
        acceptance_criteria_json = excluded.acceptance_criteria_json,
        files_json = excluded.files_json,
        status = excluded.status,
        depends_on_json = excluded.depends_on_json,
        branch_name = excluded.branch_name,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        result = excluded.result,
        observations = excluded.observations,
        blocked_reason = excluded.blocked_reason,
        artifacts_json = excluded.artifacts_json,
        history_json = excluded.history_json,
        error = excluded.error
    `).run(
      task.id,
      task.teamId,
      task.agentId,
      task.title ?? task.description,
      task.description,
      task.requesterAgentId ?? null,
      task.requesterAgentName ?? null,
      task.createdByAgentId ?? null,
      task.createdByAgentName ?? null,
      task.responsibleAgentRole ?? null,
      task.priority ?? null,
      task.context ?? null,
      JSON.stringify(task.acceptanceCriteria ?? []),
      JSON.stringify(task.files ?? []),
      task.status,
      JSON.stringify(task.dependsOn ?? []),
      task.branchName ?? null,
      task.startedAt ?? null,
      task.finishedAt ?? null,
      task.result ?? null,
      task.observations ?? null,
      task.blockedReason ?? null,
      JSON.stringify(task.artifacts ?? []),
      JSON.stringify(task.history ?? []),
      task.error ?? null
    )
  }

  deleteTask(taskId: string): void {
    this.database.prepare(`DELETE FROM pipeline_tasks WHERE id = ?`).run(taskId)
  }

  deleteTasksByTeam(teamId: string): void {
    this.database.prepare(`DELETE FROM pipeline_tasks WHERE team_id = ?`).run(teamId)
  }

  deleteAllTasks(): void {
    this.database.prepare(`DELETE FROM pipeline_tasks`).run()
  }
}

export const appStateDb = new AppStateDb()
