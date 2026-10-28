/** Títulos curtos para pedidos delegados: usados no nome da conversa privada e no cartão de delegações do chat. */

const LABEL = /^(?:contexto|context|tarefa|task|objetivo|goal|pedido|missão)\s*:\s*/i
const TASK_MARKER = /(?:^|[\s.;])(?:tarefa|task|objetivo|goal|missão)\s*:\s*([^\n]+)/i

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

/** Linha "Tarefa:"/"Objetivo:" quando existe; senão a primeira frase, sem rótulos como "Contexto:". */
export function delegationTitle(task: string, max = 80): string {
  const marked = TASK_MARKER.exec(task)?.[1]
  const line = (marked ?? task.split(/\r?\n/).map(item => item.replace(/^[\s#>*-]+/, '').trim()).find(Boolean) ?? '').replace(LABEL, '').trim()
  const sentence = (line.split(/(?<=[.!?])\s+/)[0] ?? '').replace(/[.:;,]+$/, '').trim()
  return clip(sentence || 'Pedido', max)
}

/** "Examen · revisar o fluxo de login", até ~50 caracteres. */
export function delegatedConversationName(recipientName: string, task: string): string {
  const prefix = `${recipientName} · `
  return prefix + delegationTitle(task, Math.max(12, 50 - prefix.length))
}

/** Conversas antigas se chamavam "Pedido: Examen · Contexto: …"; exibe no formato novo sem renomear o banco. */
export function conversationDisplayName(name: string): string {
  const legacy = /^Pedido: (.+?) · ([\s\S]+)$/.exec(name)
  return legacy ? delegatedConversationName(legacy[1]!, legacy[2]!) : name
}
