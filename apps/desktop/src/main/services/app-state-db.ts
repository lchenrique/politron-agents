import { mkdirSync, existsSync } from "fs"
import { join } from "path"
import { DatabaseSync } from "node:sqlite"
import type { Agent, PipelineTask, Team } from "../types/team"

function normalizeCatalogSlug(role: string, catalogSlug: string): string {
  if (role === "tech-lead" && catalogSlug === "studio-producer") {
    return "software-architect"
  }

  return catalogSlug
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
        description TEXT NOT NULL,
        files_json TEXT NOT NULL,
        status TEXT NOT NULL,
        depends_on_json TEXT NOT NULL,
        branch_name TEXT,
        started_at TEXT,
        finished_at TEXT,
        error TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
    `)
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
      SELECT id, team_id, agent_id, description, files_json, status, depends_on_json, branch_name, started_at, finished_at, error
      FROM pipeline_tasks
      ORDER BY COALESCE(started_at, finished_at, id) ASC
    `).all() as any[]

    const agentsByTeam = new Map<string, Agent[]>()
    for (const row of agentRows) {
      const agent: Agent = {
        id: row.id,
        name: row.name,
        role: row.role,
        catalogSlug: normalizeCatalogSlug(row.role, row.catalog_slug),
        systemPromptPath: row.system_prompt_path,
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
      description: row.description,
      files: JSON.parse(row.files_json || "[]"),
      status: row.status,
      dependsOn: JSON.parse(row.depends_on_json || "[]"),
      branchName: row.branch_name ?? undefined,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      error: row.error ?? undefined
    }))

    const tasksByTeam = new Map<string, PipelineTask[]>()
    for (const task of tasks) {
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

    return { teams, tasks }
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
      INSERT INTO pipeline_tasks (id, team_id, agent_id, description, files_json, status, depends_on_json, branch_name, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        team_id = excluded.team_id,
        agent_id = excluded.agent_id,
        description = excluded.description,
        files_json = excluded.files_json,
        status = excluded.status,
        depends_on_json = excluded.depends_on_json,
        branch_name = excluded.branch_name,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        error = excluded.error
    `).run(
      task.id,
      task.teamId,
      task.agentId,
      task.description,
      JSON.stringify(task.files ?? []),
      task.status,
      JSON.stringify(task.dependsOn ?? []),
      task.branchName ?? null,
      task.startedAt ?? null,
      task.finishedAt ?? null,
      task.error ?? null
    )
  }

  deleteTask(taskId: string): void {
    this.database.prepare(`DELETE FROM pipeline_tasks WHERE id = ?`).run(taskId)
  }

  deleteTasksByTeam(teamId: string): void {
    this.database.prepare(`DELETE FROM pipeline_tasks WHERE team_id = ?`).run(teamId)
  }
}

export const appStateDb = new AppStateDb()
