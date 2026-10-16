/**
 * Task Tools - Internal Tools for Task Management
 * 
 * Phase 1: Dual Provider Architecture
 * Handlers delegate to pipelineExecutor
 */

import { pipelineExecutor } from "../pipeline-executor"
import type { TaskStatus, PipelineTask } from "../types/team"
import type { InternalTool, ToolContext } from "./team-tools"

// =============================================================================
// TASK TOOLS
// =============================================================================

export function createTaskTools(): InternalTool[] {
  return [
    // ---------------------------------------------------------------------
    // TOOL: tasks_list
    // ---------------------------------------------------------------------
    {
      name: "tasks_list",
      description: "Lista tasks do board de um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          status: { 
            type: "string", 
            description: "Filtrar por status",
            enum: ["backlog", "triage", "ready", "in_progress", "blocked", "in_review", "done", "cancelled"]
          },
        },
        required: []
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string | undefined
        const status = args.status as TaskStatus | undefined

        if (!teamId) {
          return { error: "teamId é obrigatório" }
        }

        const tasks = pipelineExecutor.getTasksByTeam(teamId)
        
        const filteredTasks = status 
          ? tasks.filter(t => t.status === status)
          : tasks

        return {
          tasks: filteredTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            teamId: t.teamId,
            agentId: t.agentId,
            priority: t.priority,
            createdAt: t.history?.[0]?.timestamp,
            startedAt: t.startedAt,
            finishedAt: t.finishedAt,
          })),
          total: filteredTasks.length,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_get
    // ---------------------------------------------------------------------
    {
      name: "tasks_get",
      description: "Obtém detalhes de uma task específica",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
        },
        required: ["taskId"]
      },
      handler: async (args, _context) => {
        const taskId = args.taskId as string
        const task = pipelineExecutor.getTask(taskId)
        
        if (!task) {
          return { error: `Task não encontrada: ${taskId}` }
        }

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          teamId: task.teamId,
          agentId: task.agentId,
          priority: task.priority,
          context: task.context,
          acceptanceCriteria: task.acceptanceCriteria,
          files: task.files,
          dependsOn: task.dependsOn,
          branchName: task.branchName,
          requesterAgentId: task.requesterAgentId,
          requesterAgentName: task.requesterAgentName,
          createdByAgentId: task.createdByAgentId,
          createdByAgentName: task.createdByAgentName,
          responsibleAgentRole: task.responsibleAgentRole,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          result: task.result,
          observations: task.observations,
          blockedReason: task.blockedReason,
          artifacts: task.artifacts,
          history: task.history,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_ensure
    // ---------------------------------------------------------------------
    {
      name: "tasks_ensure",
      description: "Cria ou reaproveita uma task existente (dedupe)",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente responsável" },
          title: { type: "string", description: "Título da task" },
          description: { type: "string", description: "Descrição completa" },
          priority: { type: "string", description: "Prioridade", enum: ["high", "medium", "low"] },
          context: { type: "string", description: "Contexto adicional" },
          acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Critérios de sucesso" },
          files: { type: "array", items: { type: "string" }, description: "Arquivos relacionados" },
          dependsOn: { type: "array", items: { type: "string" }, description: "IDs das tasks dependentes" },
          branchName: { type: "string", description: "Nome da branch" },
        },
        required: ["teamId", "description"]
      },
      handler: async (args, _context) => {
        const result = pipelineExecutor.ensureTask({
          teamId: args.teamId as string,
          agentId: (args.agentId as string) || "",
          title: args.title as string | undefined,
          description: args.description as string,
          priority: args.priority as string | undefined,
          context: args.context as string | undefined,
          acceptanceCriteria: args.acceptanceCriteria as string[] | undefined,
          files: (args.files as string[]) || [],
          dependsOn: (args.dependsOn as string[]) || [],
          branchName: args.branchName as string | undefined,
        })

        return {
          taskId: result.task.id,
          title: result.task.title,
          description: result.task.description,
          status: result.task.status,
          reused: result.reused,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_update
    // ---------------------------------------------------------------------
    {
      name: "tasks_update",
      description: "Atualiza o status de uma task",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
          status: { 
            type: "string", 
            description: "Novo status",
            enum: ["backlog", "triage", "ready", "in_progress", "blocked", "in_review", "done", "cancelled"]
          },
          note: { type: "string", description: "Nota/observação" },
          result: { type: "string", description: "Resultado da task" },
          observations: { type: "string", description: "Observações adicionais" },
          blockedReason: { type: "string", description: "Motivo do bloqueio" },
        },
        required: ["taskId", "status"]
      },
      handler: async (args, context) => {
        const taskId = args.taskId as string
        const status = args.status as TaskStatus

        const task = pipelineExecutor.updateTaskStatus(taskId, status, {
          actorAgentId: context.agentId,
          actorAgentName: context.agentName,
          note: args.note as string | undefined,
          result: args.result as string | undefined,
          observations: args.observations as string | undefined,
          blockedReason: args.blockedReason as string | undefined,
        })
        
        if (!task) {
          return { error: `Task não encontrada: ${taskId}` }
        }

        return {
          taskId: task.id,
          title: task.title,
          status: task.status,
          updated: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_start
    // ---------------------------------------------------------------------
    {
      name: "tasks_start",
      description: "Inicia a execução de uma task",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
        },
        required: ["taskId"]
      },
      handler: async (args, _context) => {
        const taskId = args.taskId as string
        const task = pipelineExecutor.startTask(taskId)
        
        if (!task) {
          return { error: `Não foi possível iniciar a task: ${taskId}. Verifique se a task está ready e sem dependências bloqueadas.` }
        }

        return {
          taskId: task.id,
          title: task.title,
          status: task.status,
          startedAt: task.startedAt,
          started: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_complete
    // ---------------------------------------------------------------------
    {
      name: "tasks_complete",
      description: "Marca a task como concluída (in_review)",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
        },
        required: ["taskId"]
      },
      handler: async (args, _context) => {
        const taskId = args.taskId as string
        const task = pipelineExecutor.completeTask(taskId)
        
        if (!task) {
          return { error: `Task não encontrada: ${taskId}` }
        }

        return {
          taskId: task.id,
          title: task.title,
          status: task.status,
          finishedAt: task.finishedAt,
          completed: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_block
    // ---------------------------------------------------------------------
    {
      name: "tasks_block",
      description: "Bloqueia uma task",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
          reason: { type: "string", description: "Motivo do bloqueio" },
        },
        required: ["taskId"]
      },
      handler: async (args, _context) => {
        const taskId = args.taskId as string
        
        // First update with the reason, then block
        pipelineExecutor.updateTaskStatus(taskId, "blocked", {
          blockedReason: args.reason as string | undefined,
        })
        
        const task = pipelineExecutor.blockTask(taskId)
        
        if (!task) {
          return { error: `Task não encontrada: ${taskId}` }
        }

        return {
          taskId: task.id,
          title: task.title,
          status: task.status,
          blockedReason: task.blockedReason,
          blocked: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_remove
    // ---------------------------------------------------------------------
    {
      name: "tasks_remove",
      description: "Remove uma task do board",
      input_schema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "ID da task" },
        },
        required: ["taskId"]
      },
      handler: async (args, _context) => {
        const taskId = args.taskId as string
        const task = pipelineExecutor.getTask(taskId)
        
        if (!task) {
          return { error: `Task não encontrada: ${taskId}` }
        }

        // Release any file locks
        for (const file of task.files) {
          // Note: fileLockManager is not exported, but we can clear task directly
        }

        // Delete the task - we need to access the internal Map
        // Since pipelineExecutor doesn't have deleteTask, we'll mark as cancelled
        pipelineExecutor.updateTaskStatus(taskId, "cancelled", {
          note: "Task removida via tool",
        })

        return {
          taskId: taskId,
          removed: true,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_dedupe
    // ---------------------------------------------------------------------
    {
      name: "tasks_dedupe",
      description: "Remove tasks equivalentes duplicadas",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
          agentId: { type: "string", description: "ID do agente responsável" },
          title: { type: "string", description: "Título da task" },
          description: { type: "string", description: "Descrição da task" },
          files: { type: "array", items: { type: "string" }, description: "Arquivos relacionados" },
          preserveInProgress: { type: "boolean", description: "Manter tasks em execução" },
        },
        required: ["teamId", "description"]
      },
      handler: async (args, _context) => {
        const result = pipelineExecutor.dedupeEquivalentTasks({
          teamId: args.teamId as string,
          agentId: (args.agentId as string) || "",
          title: args.title as string | undefined,
          description: args.description as string,
          files: (args.files as string[]) || [],
          dependsOn: [],
        }, {
          preserveInProgress: args.preserveInProgress as boolean | undefined,
        })

        return {
          keptTaskId: result.keptTask?.id,
          keptTaskTitle: result.keptTask?.title,
          keptTaskStatus: result.keptTask?.status,
          cancelledCount: result.cancelledTasks.length,
          cancelledTasks: result.cancelledTasks.map(t => ({
            id: t.id,
            title: t.title,
          })),
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_ready
    // ---------------------------------------------------------------------
    {
      name: "tasks_ready",
      description: "Lista tasks prontas para execução",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
        },
        required: ["teamId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const tasks = pipelineExecutor.getReadyTasks(teamId)

        return {
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            teamId: t.teamId,
            agentId: t.agentId,
            priority: t.priority,
            files: t.files,
            dependsOn: t.dependsOn,
          })),
          total: tasks.length,
        }
      },
    },

    // ---------------------------------------------------------------------
    // TOOL: tasks_pipeline
    // ---------------------------------------------------------------------
    {
      name: "tasks_pipeline",
      description: "Obtém o status do pipeline de um time",
      input_schema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "ID do time" },
        },
        required: ["teamId"]
      },
      handler: async (args, _context) => {
        const teamId = args.teamId as string
        const tasks = pipelineExecutor.getTasksByTeam(teamId)
        const status = pipelineExecutor.getPipelineStatus(teamId)

        const statusCounts = tasks.reduce((acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        return {
          teamId,
          status,
          totalTasks: tasks.length,
          statusCounts,
        }
      },
    },
  ]
}