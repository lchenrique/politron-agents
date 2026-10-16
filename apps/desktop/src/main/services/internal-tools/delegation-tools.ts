/**
 * Delegation Tools - Internal Tools for Delegation
 * 
 * Phase 1: Dual Provider Architecture
 * Handlers delegate to teamStore, pipelineExecutor, and emit events
 */

import { teamStore } from "../team-store"
import { pipelineExecutor } from "../pipeline-executor"
import { ceoCommandExecutor } from "../ceo-command-executor"
import type { InternalTool, ToolContext } from "./team-tools"

// =============================================================================
// DELEGATION TOOLS
// =============================================================================

export function createDelegationTools(): InternalTool[] {
  return [
    // ---------------------------------------------------------------------
    // TOOL: delegate_to_agent
    // ---------------------------------------------------------------------
    {
      name: "delegate_to_agent",
      description: "Delega uma tarefa diretamente para um agente específico",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente destino" },
          task: { type: "string", description: "Descrição da tarefa" },
          files: { type: "array", items: { type: "string" }, description: "Arquivos relacionados" },
          branchName: { type: "string", description: "Nome da branch" },
          priority: { type: "string", description: "Prioridade", enum: ["high", "medium", "low"] },
        },
        required: ["teamId", "agentId", "task"]
      },
      handler: async (args, context) => {
        const teamId = args.teamId as string
        const agentId = args.agentId as string
        const taskDescription = args.task as string

        const team = teamStore.getTeam(teamId)
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        const targetAgent = team.agents.find(a => a.id === agentId)
        if (!targetAgent) {
          return { error: `Agente não encontrado no time: ${agentId}` }
        }

        const delegatedEvents: Array<{ task?: { id: string; title?: string; status?: string } }> = []
        ceoCommandExecutor.once("task:delegated", (event: { task?: { id: string; title?: string; status?: string } }) => {
          delegatedEvents.push(event)
        })

        await ceoCommandExecutor.execute(
          {
            type: "DELEGATE",
            payload: {
              team: team.name,
              agentId,
              task: taskDescription,
              files: (args.files as string[]) || [],
              branchName: args.branchName as string | undefined,
              priority: args.priority as string | undefined,
            },
            raw: `delegate ${taskDescription} to ${targetAgent.name}`,
          },
          {
            agentId: context.agentId,
            teamId,
            role: context.role,
            agentSlug: context.agentSlug,
          }
        )

        const delegatedTask = delegatedEvents.at(-1)?.task

        return {
          taskId: delegatedTask?.id,
          title: delegatedTask?.title,
          status: delegatedTask?.status,
          delegatedTo: {
            agentId: targetAgent.id,
            agentName: targetAgent.name,
            agentSlug: targetAgent.catalogSlug,
          },
          delegated: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: delegate_to_board
    // ---------------------------------------------------------------------
    {
      name: "delegate_to_board",
      description: "Cria uma task no board para delegação",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente responsável (opcional, será usado o Tech Lead se não informado)" },
          title: { type: "string", description: "Título da task" },
          description: { type: "string", description: "Descrição completa" },
          files: { type: "array", items: { type: "string" }, description: "Arquivos relacionados" },
          dependsOn: { type: "array", items: { type: "string" }, description: "IDs das tasks dependentes" },
          branchName: { type: "string", description: "Nome da branch" },
          priority: { type: "string", description: "Prioridade", enum: ["high", "medium", "low"] },
          context: { type: "string", description: "Contexto adicional" },
          acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Critérios de sucesso" },
        },
        required: ["teamId", "description"]
      },
      handler: async (args, context) => {
        const teamId = args.teamId as string

        const team = teamStore.getTeam(teamId)
        if (!team) {
          return { error: `Time não encontrado: ${teamId}` }
        }

        // Determine agent - use provided or fallback to tech lead or first agent
        let agentId = args.agentId as string | undefined
        if (!agentId) {
          agentId = team.techLeadAgentId || team.agents[0]?.id
        }

        if (!agentId) {
          return { error: `Nenhum agente disponível no time: ${teamId}` }
        }

        const result = pipelineExecutor.ensureTask({
          teamId,
          agentId,
          title: args.title as string | undefined,
          description: args.description as string,
          files: (args.files as string[]) || [],
          dependsOn: (args.dependsOn as string[]) || [],
          branchName: args.branchName as string | undefined,
          priority: args.priority as string | undefined,
          context: args.context as string | undefined,
          acceptanceCriteria: args.acceptanceCriteria as string[] | undefined,
          requesterAgentId: context.agentId,
          requesterAgentName: context.agentName,
        })

        // Emit handoff event
        const emitter = new EventEmitter()
        emitter.emit("task:delegated", {
          team,
          task: result.task,
          fromAgentId: context.agentId,
          fromAgentName: context.agentName,
        })

        return {
          taskId: result.task.id,
          title: result.task.title,
          status: result.task.status,
          teamId: team.id,
          teamName: team.name,
          reused: result.reused,
          created: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: delegate_create_team
    // ---------------------------------------------------------------------
    {
      name: "delegate_create_team",
      description: "Cria um novo time e opcionalmente contrata agentes",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do time" },
          projectPath: { type: "string", description: "Caminho do projeto" },
          projectName: { type: "string", description: "Nome do projeto (opcional)" },
          projectColor: { type: "string", description: "Cor do projeto em formato HSL (opcional)" },
          templateId: { type: "string", description: "ID do template de time (opcional)" },
          agents: { 
            type: "array", 
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                slug: { type: "string" },
              },
              required: ["name"]
            },
            description: "Agentes a contratar (opcional)" 
          },
          setTechLead: { type: "string", description: "Nome ou ID do agente que será Tech Lead (opcional)" },
        },
        required: ["name", "projectPath"]
      },
      handler: async (args, context) => {
        // Create the team
        const team = teamStore.createTeam({
          name: args.name as string,
          projectPath: args.projectPath as string,
          projectName: args.projectName as string | undefined,
          projectColor: args.projectColor as string | undefined,
          templateId: args.templateId as string | undefined,
        })

        const hiredAgents: Array<{ id: string; name: string; role: string; slug: string }> = []

        // If agents are provided, hire them
        const agentsInput = args.agents as Array<{ name: string; role?: string; slug?: string }> | undefined
        if (agentsInput && agentsInput.length > 0) {
          for (const agentInput of agentsInput) {
            const agentId = crypto.randomUUID()
            const agent = {
              id: agentId,
              name: agentInput.name,
              role: agentInput.role || "team-agent",
              catalogSlug: agentInput.slug || agentInput.name.toLowerCase().replace(/\s+/g, "-"),
              systemPromptPath: "",
              status: "idle" as const,
              color: "hsl(239 84% 67%)",
              currentFiles: [] as string[],
              hiredAt: new Date().toISOString(),
            }
            teamStore.addAgentToTeam(team.id, agent)
            hiredAgents.push({
              id: agent.id,
              name: agent.name,
              role: agent.role,
              slug: agent.catalogSlug,
            })
          }
        }

        // Set tech lead if specified
        const techLeadInput = args.setTechLead as string | undefined
        if (techLeadInput) {
          // Try to find by ID first, then by name
          const techLeadAgent = team.agents.find(a => a.id === techLeadInput || a.name.toLowerCase() === techLeadInput.toLowerCase())
          if (techLeadAgent) {
            teamStore.setTechLead(team.id, techLeadAgent.id)
          }
        }

        // If no tech lead set and we have agents, set first one as tech lead
        if (!team.techLeadAgentId && team.agents.length > 0) {
          teamStore.setTechLead(team.id, team.agents[0].id)
        }

        const finalTeam = teamStore.getTeam(team.id)

        return {
          teamId: team.id,
          name: team.name,
          projectPath: team.projectPath,
          status: team.status,
          techLeadAgentId: finalTeam?.techLeadAgentId,
          agents: hiredAgents,
          created: true,
        }
      },
    },
  ]
}
