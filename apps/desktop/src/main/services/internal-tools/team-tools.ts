/**
 * Team Tools - Internal Tools for Team Management
 * 
 * Phase 1: Dual Provider Architecture
 * Handlers delegate to teamStore
 */

import { teamStore } from "../team-store"
import type { Team, Agent, TeamStatus } from "../types/team"

// =============================================================================
// TYPES - Match OpenCode tool schema
// =============================================================================

export interface InternalTool {
  name: string
  description: string
  input_schema: {
    type: string
    properties: Record<string, unknown>
    required: string[]
  }
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>
}

export interface ToolContext {
  agentId: string
  agentName: string
  sessionId: string
  workspaceDirectory?: string
  role?: "global-ceo" | "global-agent" | "tech-lead" | "team-agent"
  agentSlug?: string
}

// =============================================================================
// TEAM TOOLS
// =============================================================================

export function createTeamTools(): InternalTool[] {
  return [
    // ---------------------------------------------------------------------
    // TOOL: team_list
    // ---------------------------------------------------------------------
    {
      name: "team_list",
      description: "Lista todos os times do workspace",
      input_schema: {
        type: "object",
        properties: {},
        required: []
      },
      handler: async (_args, _context) => {
        const teams = teamStore.listTeams()
        return {
          teams: teams.map(t => ({
            id: t.id,
            name: t.name,
            projectPath: t.projectPath,
            projectName: t.projectName,
            projectColor: t.projectColor,
            memberCount: t.agents.length,
            status: t.status,
            techLeadAgentId: t.techLeadAgentId,
            createdAt: t.createdAt,
          })),
          total: teams.length,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_resolve
    // ---------------------------------------------------------------------
    {
      name: "team_resolve",
      description: "Resolve nome ou ID de time - retorna ID canônico",
      input_schema: {
        type: "object",
        properties: {
          teamName: { type: "string", description: "Nome do time (ex: 'Core Team', 'SaaS MVP')" },
          teamId: { type: "string", description: "ID direto do time" },
          projectName: { type: "string", description: "Nome do projeto vinculado ao time" },
          projectPath: { type: "string", description: "Caminho do projeto vinculado ao time" },
        },
        required: []
      },
      handler: async (args, _context) => {
        const teams = teamStore.listTeams()
        
        // If teamId is provided directly, validate it exists
        if (args.teamId) {
          const team = teamStore.getTeam(args.teamId as string)
          if (team) {
            return { 
              teamId: team.id, 
              teamName: team.name, 
              resolved: true,
              method: "id_provided"
            }
          }
          return { error: `Time não encontrado com ID: ${args.teamId}`, resolved: false }
        }
        
        if (args.projectPath) {
          const searchPath = (args.projectPath as string).toLowerCase().trim()
          const byProjectPath = teams.find(
            (team) => team.projectPath.toLowerCase().trim() === searchPath
          )
          if (byProjectPath) {
            return {
              teamId: byProjectPath.id,
              teamName: byProjectPath.name,
              resolved: true,
              method: "project_path"
            }
          }
        }

        if (args.projectName) {
          const searchProject = (args.projectName as string).toLowerCase().trim()
          const exactProjectMatch = teams.find(
            (team) => team.projectName?.toLowerCase().trim() === searchProject
          )
          if (exactProjectMatch) {
            return {
              teamId: exactProjectMatch.id,
              teamName: exactProjectMatch.name,
              resolved: true,
              method: "project_name"
            }
          }

          const partialProjectMatch = teams.find((team) => {
            const currentProjectName = team.projectName?.toLowerCase().trim()
            return Boolean(
              currentProjectName &&
              (currentProjectName.includes(searchProject) || searchProject.includes(currentProjectName))
            )
          })
          if (partialProjectMatch) {
            return {
              teamId: partialProjectMatch.id,
              teamName: partialProjectMatch.name,
              resolved: true,
              method: "partial_project_name"
            }
          }
        }

        // Resolve by name
        if (args.teamName) {
          const searchName = (args.teamName as string).toLowerCase().trim()
          
          // Exact match first
          const exactMatch = teams.find(t => t.name.toLowerCase() === searchName)
          if (exactMatch) {
            return { 
              teamId: exactMatch.id, 
              teamName: exactMatch.name, 
              resolved: true,
              method: "exact_name"
            }
          }
          
          // Partial match
          const partialMatch = teams.find(t => 
            t.name.toLowerCase().includes(searchName) ||
            searchName.includes(t.name.toLowerCase())
          )
          if (partialMatch) {
            return { 
              teamId: partialMatch.id, 
              teamName: partialMatch.name, 
              resolved: true,
              method: "partial_name"
            }
          }
          
          return { 
            error: `Time não encontrado: ${args.teamName}. Times disponíveis: ${teams.map(t => t.name).join(", ")}`,
            resolved: false,
            availableTeams: teams.map(t => ({ id: t.id, name: t.name }))
          }
        }
        
        return { error: "Forneça teamName, teamId, projectName ou projectPath", resolved: false }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_get
    // ---------------------------------------------------------------------
    {
      name: "team_get",
      description: "Obtém detalhes de um time específico",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
        },
        required: ["teamId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const team = teamStore.getTeam(teamId)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        return {
          id: team.id,
          name: team.name,
          projectPath: team.projectPath,
          projectName: team.projectName,
          projectColor: team.projectColor,
          status: team.status,
          techLeadAgentId: team.techLeadAgentId,
          createdAt: team.createdAt,
          templateId: team.templateId,
          pipeline: {
            status: team.pipeline.status,
            taskCount: team.pipeline.tasks.length,
          },
          agents: team.agents.map(a => ({
            id: a.id,
            name: a.name,
            role: a.role,
            catalogSlug: a.catalogSlug,
            status: a.status,
            color: a.color,
            isTeamLead: a.isTeamLead,
            hiredAt: a.hiredAt,
          })),
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_create
    // ---------------------------------------------------------------------
    {
      name: "team_create",
      description: "Cria um novo time",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do time" },
          projectPath: { type: "string", description: "Caminho do projeto" },
          projectName: { type: "string", description: "Nome do projeto (opcional)" },
          projectColor: { type: "string", description: "Cor do projeto em formato HSL (opcional)" },
          templateId: { type: "string", description: "ID do template de time (opcional)" },
        },
        required: ["name", "projectPath"]
      },
      handler: async (args, _context) => {
        const team = teamStore.createTeam({
          name: args.name as string,
          projectPath: args.projectPath as string,
          projectName: args.projectName as string | undefined,
          projectColor: args.projectColor as string | undefined,
          templateId: args.templateId as string | undefined,
        })

        return {
          id: team.id,
          name: team.name,
          projectPath: team.projectPath,
          projectName: team.projectName,
          status: team.status,
          created: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_add_agent
    // ---------------------------------------------------------------------
    {
      name: "team_add_agent",
      description: "Adiciona um agente a um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente" },
          agentName: { type: "string", description: "Nome do agente" },
          agentRole: { type: "string", description: "Papel do agente (role)" },
          agentSlug: { type: "string", description: "Slug do catálogo do agente" },
          agentColor: { type: "string", description: "Cor do agente" },
        },
        required: ["teamId", "agentName"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const agentId = (args.agentId as string) || crypto.randomUUID()
        const agentName = args.agentName as string
        const agentRole = (args.agentRole as string) || "team-agent"
        const agentSlug = (args.agentSlug as string) || agentName.toLowerCase().replace(/\s+/g, "-")
        const agentColor = (args.agentColor as string) || "hsl(239 84% 67%)"

        const agent: Agent = {
          id: agentId,
          name: agentName,
          role: agentRole,
          catalogSlug: agentSlug,
          systemPromptPath: "",
          status: "idle",
          color: agentColor,
          currentFiles: [],
          hiredAt: new Date().toISOString(),
        }

        const team = teamStore.addAgentToTeam(teamId, agent)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          agent: {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            catalogSlug: agent.catalogSlug,
          },
          added: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_remove_agent
    // ---------------------------------------------------------------------
    {
      name: "team_remove_agent",
      description: "Remove um agente de um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente a remover" },
        },
        required: ["teamId", "agentId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const agentId = args.agentId as string

        const team = teamStore.removeAgentFromTeam(teamId, agentId)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          removedAgentId: agentId,
          removed: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_set_techlead
    // ---------------------------------------------------------------------
    {
      name: "team_set_techlead",
      description: "Define o Tech Lead de um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente que será Tech Lead" },
        },
        required: ["teamId", "agentId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const agentId = args.agentId as string

        const team = teamStore.setTechLead(teamId, agentId)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        const techLeadAgent = team.agents.find(a => a.id === agentId)
        
        return {
          teamId: team.id,
          teamName: team.name,
          techLeadAgentId: team.techLeadAgentId,
          techLeadAgentName: techLeadAgent?.name || null,
          updated: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_pause
    // ---------------------------------------------------------------------
    {
      name: "team_pause",
      description: "Pausa um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
        },
        required: ["teamId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string

        const team = teamStore.pauseTeam(teamId)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          status: team.status,
          paused: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: team_resume
    // ---------------------------------------------------------------------
    {
      name: "team_resume",
      description: "Retoma um time pausado",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
        },
        required: ["teamId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string

        const team = teamStore.resumeTeam(teamId)
        
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          status: team.status,
          resumed: true,
        }
      },
    },
  ]
}
