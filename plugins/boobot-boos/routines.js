// Rotinas dos agentes: prompts que o DSH entrega na sessão "casa" do agente em horários definidos (serviço `schedule`).
// Regras puras: validam a entrada e montam o pedido do DSH. A criação no DSH e o disco ficam em index.js.
import { randomUUID } from 'node:crypto'

export const RULE_KINDS = ['daily', 'weekly', 'every', 'cron']
export const MAX_ROUTINES_PER_AGENT = 10

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const text = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Informe ${label.toLowerCase()}.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`${label} passa de ${max} caracteres.`)
  return trimmed
}

/** Normaliza a regra de horário. O fuso é obrigatório (o DSH exige um fuso IANA explícito). */
export function parseRule(rule, defaultZone) {
  if (!rule || !RULE_KINDS.includes(rule.kind)) throw new Error('Frequência inválida: use daily, weekly, every ou cron.')
  const timeZone = text(rule.timeZone ?? defaultZone, 'Fuso horário', 60)
  if (rule.kind === 'every') {
    const minutes = Number(rule.minutes)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) throw new Error('Intervalo inválido: informe minutos inteiros de 1 a 10080.')
    return { kind: 'every', minutes }
  }
  if (rule.kind === 'cron') return { kind: 'cron', expression: text(rule.expression, 'Expressão cron', 100), timeZone }
  if (typeof rule.time !== 'string' || !TIME.test(rule.time)) throw new Error('Horário inválido: use HH:mm.')
  if (rule.kind === 'daily') return { kind: 'daily', time: rule.time, timeZone }
  const weekdays = [...new Set(rule.weekdays ?? [])].sort()
  if (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Dias da semana inválidos: use números de 1 (segunda) a 7 (domingo).')
  return { kind: 'weekly', time: rule.time, timeZone, weekdays }
}

export function parseRoutine(input, defaultZone) {
  return { title: text(input.title, 'Título da rotina', 120), prompt: text(input.prompt, 'Instrução da rotina', 4000), rule: parseRule(input.rule, defaultZone) }
}

/** Pedido do serviço `schedule` do DSH (ScheduleCreateRequest) para uma rotina já validada. */
export function scheduleRequest({ title, prompt, rule }) {
  const base = { title, prompt }
  if (rule.kind === 'every') return { ...base, every_seconds: rule.minutes * 60 }
  if (rule.kind === 'cron') return { ...base, cron: { expression: rule.expression, time_zone: rule.timeZone } }
  if (rule.kind === 'daily') return { ...base, daily: { time: `${rule.time}:00`, time_zone: rule.timeZone } }
  return { ...base, weekly: { time: `${rule.time}:00`, time_zone: rule.timeZone, weekdays: rule.weekdays } }
}

/** Descrição curta da regra para a UI e para as tools. */
export function describeRule(rule) {
  const days = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
  if (rule.kind === 'every') return `a cada ${rule.minutes} min`
  if (rule.kind === 'cron') return `cron ${rule.expression} (${rule.timeZone})`
  if (rule.kind === 'daily') return `todo dia às ${rule.time} (${rule.timeZone})`
  return `${rule.weekdays.map(day => days[day]).join(', ')} às ${rule.time} (${rule.timeZone})`
}

export const routinesOf = (state, agentId) => state.routines.filter(routine => routine.agentId === agentId)

/** Registra uma rotina já criada no DSH. Limite por agente para a lista não crescer sem fim. */
export function addRoutine(state, agentId, parsed, scheduleId, sessionId, now = new Date().toISOString()) {
  if (routinesOf(state, agentId).length >= MAX_ROUTINES_PER_AGENT) throw new Error(`Cada agente tem no máximo ${MAX_ROUTINES_PER_AGENT} rotinas.`)
  const routine = { id: randomUUID(), agentId, ...parsed, scheduleId, sessionId, createdAt: now }
  return { state: { ...state, routines: [...state.routines, routine] }, routine }
}

export function removeRoutine(state, routineId) {
  const routine = state.routines.find(item => item.id === routineId)
  if (!routine) throw new Error('Rotina não encontrada.')
  return { state: { ...state, routines: state.routines.filter(item => item.id !== routineId) }, routine }
}

/** Sessão "casa" do agente: a conversa fixa onde as rotinas chegam e que o botão Conversar reabre. */
export const homeOf = (state, agentId) => state.homes[agentId]
export const setHome = (state, agentId, sessionId) => ({ ...state, homes: { ...state.homes, [agentId]: sessionId } })
