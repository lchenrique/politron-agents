/**
 * Staffing Tools - Internal Tools for Staffing and Hiring
 *
 * Phase 1: Dual Provider Architecture
 * Handlers delegate to ceoCommandExecutor and agentCatalog
 */

import { ceoCommandExecutor } from "../ceo-command-executor"
import { teamStore } from "../team-store"
import {
  AGENT_CATALOG,
  OPENCODE_MARKETPLACE_AGENTS,
  getAgentBySlug,
  getMarketplaceAgentByIdentity,
  listMarketplaceAgentIdentities,
} from "../agent-catalog"
import type { InternalTool } from "./team-tools"

// =============================================================================
// STAFFING TOOLS
// =============================================================================

export function createStaffingTools(): InternalTool[] {
  return [
    // ---------------------------------------------------------------------
    // TOOL: hire_from_catalog
    // ---------------------------------------------------------------------
    {
      name: "hire_from_catalog",
      description: "Contrata um agente do catálogo para um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          teamName: { type: "string", description: "Nome do time (alternativo a teamId)" },
          agentSlug: { type: "string", description: "Slug do agente no catálogo" },
          agentRole: { type: "string", description: "Papel do agente" },
          initialTask: { type: "string", description: "Primeira tarefa para o agente" },
          title: { type: "string", description: "Título da tarefa inicial" },
          successCriteria: { type: "array", items: { type: "string" }, description: "Critérios de sucesso" },
          files: { type: "array", items: { type: "string" }, description: "Arquivos relacionados" },
          branchName: { type: "string", description: "Nome da branch" },
          priority: { type: "string", description: "Prioridade", enum: ["high", "medium", "low"] },
        },
        required: [],
      },
      handler: async (args, context) => {
        const isAuthorizedHiringRole =
          context.role === "global-ceo" ||
          (context.role === "global-agent" && context.agentSlug === "hr-global")

        if (!isAuthorizedHiringRole) {
          return { error: "Apenas CEO Global ou RH Global podem contratar diretamente do catálogo." }
        }

        let teamId = args.teamId as string | undefined
        const teamName = args.teamName as string | undefined

        if (!teamId && teamName) {
          const teams = teamStore.listTeams()
          const found = teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase())
          teamId = found?.id
        }

        if (!teamId) {
          return { error: "teamId ou teamName é obrigatório" }
        }

        const team = teamStore.getTeam(teamId)
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        let agentSlug = args.agentSlug as string | undefined
        const agentRole = args.agentRole as string | undefined

        if (!agentSlug && agentRole) {
          const catalogAgent = getMarketplaceAgentByIdentity(agentRole)
          if (catalogAgent) {
            agentSlug = catalogAgent.slug
          }
        }

        if (!agentSlug) {
          return { error: "agentSlug ou agentRole é obrigatório" }
        }

        const catalogAgent = getAgentBySlug(agentSlug) || getMarketplaceAgentByIdentity(agentSlug)
        if (!catalogAgent) {
          return { error: `Agente não encontrado no catálogo: ${agentSlug}. Use list_catalog para ver os disponíveis.` }
        }

        const command = {
          type: "HIRE_AGENT" as const,
          payload: {
            team: team.name,
            role: catalogAgent.slug,
            agentSlug: catalogAgent.slug,
            task: args.initialTask as string | undefined,
            title: args.title as string | undefined,
            successCriteria: args.successCriteria as string[] | undefined,
            files: args.files as string[] | undefined,
            branchName: args.branchName as string | undefined,
            priority: args.priority as string | undefined,
          },
          raw: `hire ${catalogAgent.slug} to ${team.name}`,
        }

        let hiredAgent: { id: string; name: string; role: string; catalogSlug: string } | null = null

        ceoCommandExecutor.once("agent:hired", (data: { agent: { id: string; name: string; role: string; catalogSlug: string } }) => {
          hiredAgent = {
            id: data.agent.id,
            name: data.agent.name,
            role: data.agent.role,
            catalogSlug: data.agent.catalogSlug,
          }
        })

        await ceoCommandExecutor.execute(command, {
          agentId: context.agentId,
          role: context.role,
          agentSlug: context.agentSlug,
        })

        const updatedTeam = teamStore.getTeam(teamId)
        if (updatedTeam && !hiredAgent) {
          const newAgent = updatedTeam.agents.find((agent) => agent.catalogSlug === catalogAgent.slug)
          if (newAgent) {
            hiredAgent = {
              id: newAgent.id,
              name: newAgent.name,
              role: newAgent.role,
              catalogSlug: newAgent.catalogSlug,
            }
          }
        }

        if (!hiredAgent) {
          return {
            agentId: catalogAgent.slug,
            agentName: catalogAgent.name,
            role: catalogAgent.role,
            hired: true,
            note: "Agente contratado (confirme via team_get)",
          }
        }

        return {
          agentId: hiredAgent.id,
          agentName: hiredAgent.name,
          role: hiredAgent.role,
          catalogSlug: hiredAgent.catalogSlug,
          teamId: team.id,
          teamName: team.name,
          hired: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: staffing_request
    // ---------------------------------------------------------------------
    {
      name: "staffing_request",
      description: "Envia uma solicitação de staffing para o RH Global",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          teamName: { type: "string", description: "Nome do time (alternativo a teamId)" },
          desiredRole: { type: "string", description: "Papel/cargo desejado" },
          justification: { type: "string", description: "Justificativa para a contratação" },
          agentSlug: { type: "string", description: "Slug específico do agente (opcional)" },
          context: { type: "string", description: "Contexto adicional" },
        },
        required: ["desiredRole", "justification"],
      },
      handler: async (args, context) => {
        let teamId = args.teamId as string | undefined
        const teamName = args.teamName as string | undefined

        if (!teamId && teamName) {
          const teams = teamStore.listTeams()
          const found = teams.find((team) => team.name.toLowerCase() === teamName.toLowerCase())
          teamId = found?.id
        }

        if (!teamId) {
          return { error: "teamId ou teamName é obrigatório" }
        }

        const team = teamStore.getTeam(teamId)
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        const requestId = crypto.randomUUID()
        const staffingTask = `Avaliar e viabilizar contratação/alocação de ${args.desiredRole} para o time ${team.name}. Justificativa: ${args.justification}`

        await ceoCommandExecutor.execute(
          {
            type: "DELEGATE",
            raw: `staffing_request ${args.desiredRole} for ${team.name}`,
            payload: {
              team: team.name,
              task: staffingTask,
              target: "hr-global",
              agentSlug: "hr-global",
              desiredRole: args.desiredRole as string,
              requestedRole: args.desiredRole as string,
              justification: args.justification as string,
              context: args.context as string | undefined,
              requestId,
            },
          },
          {
            agentId: context.agentId,
            teamId: team.id,
            role: context.role,
            agentSlug: context.agentSlug,
          }
        )

        return {
          teamId: team.id,
          teamName: team.name,
          desiredRole: args.desiredRole,
          justification: args.justification,
          agentSlug: args.agentSlug,
          requestId,
          requested: true,
          note: "Solicitação enviada para RH Global",
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: list_catalog
    // ---------------------------------------------------------------------
    {
      name: "list_catalog",
      description: "Lista todos os agentes disponíveis no catálogo",
      input_schema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: "Escopo do catálogo",
            enum: ["all", "team", "marketplace", "global"],
          },
        },
        required: [],
      },
      handler: async (args) => {
        const scope = (args.scope as string) || "all"
        const agents: Array<{
          slug: string
          name: string
          role: string
          color: string
          scope: string
        }> = []

        if (scope === "all" || scope === "marketplace") {
          for (const agent of OPENCODE_MARKETPLACE_AGENTS) {
            agents.push({
              slug: agent.slug,
              name: agent.name,
              role: agent.role,
              color: agent.color,
              scope: "marketplace",
            })
          }
        }

        if (scope === "all" || scope === "global") {
          agents.push(
            { slug: "ceo", name: "CEO Global", role: "global-ceo", color: "hsl(239 84% 67%)", scope: "global" },
            { slug: "hr-global", name: "RH Global", role: "global-agent", color: "hsl(280 84% 60%)", scope: "global" }
          )
        }

        if (scope === "team") {
          for (const agent of AGENT_CATALOG) {
            agents.push({
              slug: agent.slug,
              name: agent.name,
              role: agent.role,
              color: agent.color,
              scope: "team",
            })
          }
        }

        return {
          agents,
          total: agents.length,
          availableCommands: listMarketplaceAgentIdentities(),
        }
      },
    },
  ]
}
