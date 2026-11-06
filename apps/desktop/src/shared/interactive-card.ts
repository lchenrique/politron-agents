/**
 * Contrato dos cartões interativos que um Boo mostra no chat (desktop) ou num canal de texto (Telegram).
 * Todo cartão tem uma versão em texto (`cardFallbackText`) para canais sem botões.
 */
export type CardOption = { id: string; label: string; description?: string }

export type CardField = {
  id: string; label: string; placeholder?: string; required?: boolean
  /** Campo secreto: o valor vai só ao agente e nunca entra no histórico, no log nem no resumo do cartão. */
  secret?: boolean
}

type CardBase = { id: string; title: string; text?: string; /** ISO 8601; depois disso o cartão não aceita resposta. */ expiresAt?: string }

export type InteractiveCard = CardBase & (
  | { kind: 'confirm'; confirmLabel?: string; cancelLabel?: string }
  | { kind: 'quick-replies'; options: CardOption[] }
  | { kind: 'choice'; options: CardOption[]; multiple?: boolean; min?: number; max?: number }
  | { kind: 'form'; fields: CardField[]; submitLabel?: string }
)

export type CardAnswer =
  | { status: 'answered'; values: Record<string, string | boolean | string[]> }
  | { status: 'dismissed' }
  | { status: 'expired' }

export const CARD_LIMITS = { options: 12, fields: 6, text: 2000, label: 80 } as const

export function isCardExpired(card: Pick<CardBase, 'expiresAt'>, now = Date.now()): boolean {
  if (!card.expiresAt) return false
  const at = Date.parse(card.expiresAt)
  return Number.isFinite(at) && at <= now
}

/** Valida a forma do cartão vinda do agente (fronteira não confiável). Devolve o motivo da recusa ou null. */
export function validateCard(card: InteractiveCard): string | null {
  if (!card.id || !card.title.trim()) return 'Cartão precisa de id e título.'
  if (card.title.length > CARD_LIMITS.label * 2 || (card.text?.length ?? 0) > CARD_LIMITS.text) return 'Título ou texto longo demais.'
  if (card.kind === 'quick-replies' || card.kind === 'choice') {
    if (!card.options.length || card.options.length > CARD_LIMITS.options) return `Use de 1 a ${CARD_LIMITS.options} opções.`
    const ids = new Set(card.options.map(option => option.id))
    if (ids.size !== card.options.length || card.options.some(option => !option.id || !option.label.trim() || option.label.length > CARD_LIMITS.label)) return 'Opções com id repetido, vazio ou rótulo inválido.'
  }
  if (card.kind === 'choice' && card.multiple) {
    const { min = 0, max = card.options.length } = card
    if (min < 0 || max < min || max > card.options.length) return 'Limites de seleção inválidos.'
  }
  if (card.kind === 'form') {
    if (!card.fields.length || card.fields.length > CARD_LIMITS.fields) return `Use de 1 a ${CARD_LIMITS.fields} campos.`
    const ids = new Set(card.fields.map(field => field.id))
    if (ids.size !== card.fields.length || card.fields.some(field => !field.id || !field.label.trim())) return 'Campos com id repetido ou vazio.'
  }
  return null
}

/** Confere se a resposta cabe no cartão; devolve o motivo da recusa ou null. */
export function validateAnswer(card: InteractiveCard, answer: CardAnswer, now = Date.now()): string | null {
  if (answer.status !== 'answered') return null
  if (isCardExpired(card, now)) return 'Cartão expirado.'
  const { values } = answer
  if (card.kind === 'confirm') return typeof values.confirmed === 'boolean' ? null : 'Resposta de confirmação inválida.'
  if (card.kind === 'quick-replies') return card.options.some(option => option.id === values.choice) ? null : 'Opção inexistente.'
  if (card.kind === 'choice') {
    const chosen = card.multiple ? values.choices : [values.choice]
    if (!Array.isArray(chosen) || chosen.some(id => !card.options.some(option => option.id === id))) return 'Opção inexistente.'
    const min = card.multiple ? card.min ?? 0 : 1, max = card.multiple ? card.max ?? card.options.length : 1
    return chosen.length >= min && chosen.length <= max ? null : `Escolha de ${min} a ${max} opções.`
  }
  for (const field of card.fields) {
    const value = values[field.id]
    if (field.required && (typeof value !== 'string' || !value.trim())) return `Preencha "${field.label}".`
    if (value !== undefined && typeof value !== 'string') return `Valor inválido em "${field.label}".`
  }
  return null
}

/** Texto simples do cartão, com as opções numeradas, para canais sem botões. */
export function cardFallbackText(card: InteractiveCard): string {
  const lines = [card.title, ...(card.text ? [card.text] : [])]
  if (card.kind === 'confirm') lines.push(`Responda "sim" para ${card.confirmLabel || 'confirmar'} ou "não" para ${card.cancelLabel || 'cancelar'}.`)
  if (card.kind === 'quick-replies' || card.kind === 'choice') {
    card.options.forEach((option, index) => lines.push(`${index + 1}. ${option.label}${option.description ? `: ${option.description}` : ''}`))
    lines.push(card.kind === 'choice' && card.multiple ? 'Responda com os números separados por vírgula.' : 'Responda com o número da opção.')
  }
  if (card.kind === 'form') {
    card.fields.forEach(field => lines.push(`- ${field.label}${field.required ? ' (obrigatório)' : ''}${field.secret ? ' (secreto, não será exibido)' : ''}`))
    lines.push('Responda uma linha por campo, no formato "campo: valor".')
  }
  return lines.join('\n')
}

/** Resumo da resposta para o histórico: campos secretos nunca aparecem. */
export function redactAnswer(card: InteractiveCard, answer: CardAnswer): string {
  if (answer.status !== 'answered') return answer.status === 'dismissed' ? 'Dispensado' : 'Expirado'
  const { values } = answer
  if (card.kind === 'confirm') return values.confirmed ? 'Confirmado' : 'Cancelado'
  if (card.kind === 'quick-replies') return card.options.find(option => option.id === values.choice)?.label ?? '—'
  if (card.kind === 'choice') {
    const ids = card.multiple ? (values.choices as string[]) : [values.choice as string]
    return card.options.filter(option => ids.includes(option.id)).map(option => option.label).join(', ') || '—'
  }
  return card.fields.map(field => `${field.label}: ${field.secret ? '••••' : String(values[field.id] ?? '')}`).join('; ')
}
