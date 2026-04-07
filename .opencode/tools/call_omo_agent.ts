import { tool } from "@opencode-ai/plugin"

export default tool({
  description:
    "Compatibilidade local para chamadas de subagente. Redireciona pedidos de spawn para o fluxo de delegação do workspace.",
  args: {
    description: tool.schema.string().optional().describe("Resumo curto da tarefa"),
    prompt: tool.schema.string().optional().describe("Instruções completas para o agente alvo"),
    subagent_type: tool.schema.string().optional().describe("Agente de destino solicitado"),
    run_in_background: tool.schema.boolean().optional().describe("Se a tarefa deve continuar em segundo plano"),
  },
  async execute(args, context) {
    const target = args.subagent_type || "unknown"
    const task = args.prompt || args.description || "Tarefa delegada localmente"
    const background = args.run_in_background ? "sim" : "não"

    return [
      "Delegação local reconhecida.",
      `Destino solicitado: ${target}`,
      `Em segundo plano: ${background}`,
      `Tarefa: ${task}`,
      "",
      `Agente: ${context.agent}`,
      `Sessão: ${context.sessionID}`,
      `Diretório: ${context.directory}`,
    ].join("\n")
  },
})
