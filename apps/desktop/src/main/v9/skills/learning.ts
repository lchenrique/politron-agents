import { basename } from 'node:path'
import type { SkillInfo } from '../../../shared/skills'

/** Mínimo de chamadas de ferramenta do Boobot para uma execução contar como trabalho relevante. */
export const REFLECTION_MIN_TOOL_CALLS = 5

/**
 * Revisão de aprendizado no fim da execução: só em execução de topo concluída, fora do modo plano,
 * que ainda não gravou skill e teve trabalho relevante (5+ ferramentas, ou um erro de ferramenta corrigido depois).
 * Sub-execuções delegadas ficam de fora: atrasariam o resultado que o Boo pai está esperando.
 */
export function shouldReflect(input: { status: string; planMode: boolean; delegated: boolean; toolCalls: number; recoveredFromError: boolean; savedSkill: boolean; queuedWork?: boolean }): boolean {
  // Com mensagem esperando na fila, a revisão opcional não pode segurar a vaga do agente.
  if (input.status !== 'completed' || input.planMode || input.delegated || input.savedSkill || input.queuedWork) return false
  return input.toolCalls >= REFLECTION_MIN_TOOL_CALLS || input.recoveredFromError
}

// Skills da função do Boo (Marketplace) vêm antes de todas: são o motivo de ele existir.
const ORDER: Record<SkillInfo['source'], number> = { marketplace: -1, learned: 0, custom: 1, claude: 2, codex: 3 }
const oneLine = (value: string, max: number) => { const line = value.replace(/\s+/g, ' ').trim(); return line.length > max ? `${line.slice(0, max - 1)}…` : line }

/** Lista curta (até 30 itens, ~3 mil caracteres) para o prompt; aprendidas primeiro, com o slug que save_skill usa no update. */
export function skillsPromptBlock(skills: SkillInfo[], maxItems = 30, maxChars = 3000): string {
  if (!skills.length) return ''
  const header = 'Skills disponíveis (leia com read_skill pelo nome antes de seguir; list_skills mostra todas):'
  const lines = [header]
  let size = header.length
  for (const skill of [...skills].sort((a, b) => ORDER[a.source] - ORDER[b.source]).slice(0, maxItems)) {
    const line = `- ${oneLine(skill.name, 60)}${skill.source === 'learned' ? ` (slug ${basename(skill.path)})` : ''}: ${oneLine(skill.description, 110)}`
    if (size + 1 + line.length > maxChars) break
    lines.push(line); size += 1 + line.length
  }
  return lines.join('\n')
}

/** Turno interno e curto pedido ao próprio agente na mesma thread; o texto da resposta não vai para o chat. */
export function reflectionPrompt(skillsBlock: string): string {
  return `[Revisão interna do Boobot, invisível ao usuário] A tarefa acabou. Algum procedimento desta execução vai se repetir e merece virar skill, ou corrige uma skill existente? ${skillsBlock || 'Ainda não há skills.'}
Se sim, chame save_skill uma vez (create; ou update com o mesmo slug de uma aprendida), com descrição objetiva de quando usar e passos concretos, sem segredos nem dados pessoais. Se não, responda só "nada a aprender". Não faça mais nada.`
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/, /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bAIza[0-9A-Za-z_-]{35}\b/,
]
export const containsSecret = (value: string) => SECRET_PATTERNS.some(pattern => pattern.test(value))
