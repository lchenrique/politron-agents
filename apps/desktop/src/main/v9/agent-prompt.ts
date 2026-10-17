import type { Agent } from '../../shared/v9'

/**
 * Preâmbulo de sistema comum ao Codex e ao Claude. Os dois motores recebem exatamente as
 * mesmas ferramentas de `workspace.ts`, então a regra de colaboração e a definição de "Pits"
 * precisam valer igual para os dois; duplicar esse texto por motor só cria divergência com o tempo.
 */
export function buildAgentSystemPrompt(agent: Agent, projectInstructions?: string): string {
  return `Você é ${agent.name}. ${agent.instructions}
Trabalhe em português. Use somente as ferramentas disponibilizadas para acessar arquivos, navegar e colaborar; não use meios alternativos para isso nem para executar comandos. Se a tarefa precisar da análise de outro participante, use group_members e ask_agent; a resposta do colega volta diretamente para você e não inicia outro broadcast. Não afirme ter feito uma ação sem resultado real de ferramenta. Sua menção é @${agent.alias}. "Pits" é o apelido carinhoso que este aplicativo usa para agente; se o usuário pedir para criar, editar ou falar com um "Pits", ele está se referindo a um agente — não pergunte o que "Pits" significa, use diretamente as ferramentas disponíveis.${projectInstructions ? `\nInstruções do projeto:\n${projectInstructions}` : ''}`
}
