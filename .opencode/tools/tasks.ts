import { tool } from "@opencode-ai/plugin"

const taskStatusSchema = tool.schema.enum([
  "backlog",
  "triage",
  "ready",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
] as const)

type ToolContext = {
  agent?: string
  directory?: string
  worktree?: string
  sessionID?: string
}

async function callBridge(path: string, payload: Record<string, unknown>) {
  const baseUrl = process.env.POLITRON_TASK_TOOL_URL
  const token = process.env.POLITRON_TASK_TOOL_TOKEN

  if (!baseUrl || !token) {
    throw new Error("Task tool bridge is not configured in this session")
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-politron-task-token": token,
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json()) as { ok?: boolean; error?: string }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Task tool request failed (${response.status})`)
  }

  return data
}

function withRuntimeContext(args: Record<string, unknown>, context: ToolContext) {
  return {
    ...args,
    agentName: typeof args.agentName === "string" && args.agentName.trim() ? args.agentName : context.agent,
    directory: context.directory,
    worktree: context.worktree,
    sessionID: context.sessionID,
  }
}

export const list = tool({
  description: "Lista tasks do board do time atual ou de um time específico",
  args: {
    teamId: tool.schema.string().optional().describe("ID do time"),
    teamName: tool.schema.string().optional().describe("Nome do time quando o ID não for conhecido"),
    agentName: tool.schema.string().optional().describe("Filtrar por agente responsável"),
    status: taskStatusSchema.or(tool.schema.array(taskStatusSchema)).optional().describe("Filtrar por status"),
    limit: tool.schema.number().int().positive().max(100).optional().describe("Quantidade máxima de tasks"),
  },
  async execute(args, context) {
    return callBridge("/tasks/list", withRuntimeContext(args, context))
  },
})

export const get = tool({
  description: "Obtém os detalhes de uma task específica do board",
  args: {
    taskId: tool.schema.string().describe("ID da task"),
  },
  async execute(args) {
    return callBridge("/tasks/get", args)
  },
})

export const ensure = tool({
  description: "Cria uma task no board sem duplicar; se já existir uma equivalente aberta, reaproveita",
  args: {
    teamId: tool.schema.string().optional().describe("ID do time"),
    teamName: tool.schema.string().optional().describe("Nome do time"),
    agentId: tool.schema.string().optional().describe("ID do agente responsável"),
    agentName: tool.schema.string().optional().describe("Nome, role ou slug do agente responsável"),
    title: tool.schema.string().optional().describe("Título curto da issue"),
    description: tool.schema.string().describe("Descrição completa da issue"),
    requesterAgentId: tool.schema.string().optional().describe("ID do solicitante"),
    requesterAgentName: tool.schema.string().optional().describe("Nome do solicitante"),
    createdByAgentId: tool.schema.string().optional().describe("ID de quem registrou a issue"),
    createdByAgentName: tool.schema.string().optional().describe("Nome de quem registrou a issue"),
    responsibleAgentRole: tool.schema.string().optional().describe("Role do responsável"),
    priority: tool.schema.string().optional().describe("Prioridade textual"),
    context: tool.schema.string().optional().describe("Contexto adicional"),
    acceptanceCriteria: tool.schema.array(tool.schema.string()).optional().describe("Critérios de aceite"),
    files: tool.schema.array(tool.schema.string()).optional().describe("Arquivos relacionados"),
    dependsOn: tool.schema.array(tool.schema.string()).optional().describe("IDs de tasks dependentes"),
    branchName: tool.schema.string().optional().describe("Branch associada"),
    status: taskStatusSchema.optional().describe("Status inicial"),
    observations: tool.schema.string().optional().describe("Observações extras"),
  },
  async execute(args, context) {
    return callBridge("/tasks/ensure", withRuntimeContext(args, context))
  },
})

export const dedupe = tool({
  description: "Quando houver tasks repetidas ou redundantes, mantém a mais recente e cancela as mais antigas",
  args: {
    teamId: tool.schema.string().optional().describe("ID do time"),
    teamName: tool.schema.string().optional().describe("Nome do time"),
    agentId: tool.schema.string().optional().describe("ID do agente responsável"),
    agentName: tool.schema.string().optional().describe("Nome, role ou slug do agente responsável"),
    title: tool.schema.string().optional().describe("Título da issue redundante"),
    description: tool.schema.string().describe("Descrição da issue redundante"),
    files: tool.schema.array(tool.schema.string()).optional().describe("Arquivos relacionados"),
    preserveInProgress: tool.schema.boolean().optional().describe("Se true, não cancela task em execução"),
  },
  async execute(args, context) {
    return callBridge("/tasks/dedupe", withRuntimeContext(args, context))
  },
})

export const update = tool({
  description: "Atualiza status ou observações de uma task do board",
  args: {
    taskId: tool.schema.string().describe("ID da task"),
    status: taskStatusSchema.optional().describe("Novo status da task"),
    agentId: tool.schema.string().optional().describe("ID do agente que está atualizando"),
    agentName: tool.schema.string().optional().describe("Nome do agente que está atualizando"),
    note: tool.schema.string().optional().describe("Nota de histórico"),
    blockedReason: tool.schema.string().optional().describe("Motivo do bloqueio"),
    result: tool.schema.string().optional().describe("Resultado parcial ou final"),
    observations: tool.schema.string().optional().describe("Observações complementares"),
  },
  async execute(args, context) {
    return callBridge("/tasks/update", withRuntimeContext(args, context))
  },
})

export const start = tool({
  description: "Marca uma task pronta como em execução no board",
  args: {
    taskId: tool.schema.string().describe("ID da task"),
  },
  async execute(args) {
    return callBridge("/tasks/start", args)
  },
})

export const complete = tool({
  description: "Conclui a execução de uma task e move para revisão no board",
  args: {
    taskId: tool.schema.string().describe("ID da task"),
  },
  async execute(args) {
    return callBridge("/tasks/complete", args)
  },
})

export const remove = tool({
  description: "Remove logicamente uma task do board, marcando-a como cancelada",
  args: {
    taskId: tool.schema.string().describe("ID da task"),
    agentId: tool.schema.string().optional().describe("ID do agente que está cancelando"),
    agentName: tool.schema.string().optional().describe("Nome do agente que está cancelando"),
    note: tool.schema.string().optional().describe("Motivo do cancelamento"),
    observations: tool.schema.string().optional().describe("Observações adicionais"),
  },
  async execute(args, context) {
    return callBridge("/tasks/remove", withRuntimeContext(args, context))
  },
})
