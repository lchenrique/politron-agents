import type { Mission, MissionBudget, MissionStep, MissionUsage } from '../../shared/v9'

/**
 * Orçamento e relatório de missões autônomas (missão noturna e rotinas).
 *
 * De onde vem o consumo:
 * - Codex: notificação `thread/tokenUsage/updated` do app-server (campo `last` de cada chamada ao modelo); só tokens, sem custo.
 * - Claude (Agent SDK): mensagem `result` de cada turno, com `usage` e `total_cost_usd`.
 * - OpenCode (API OpenAI-compatível): pacote `usage` do fim do stream, pedido com `stream_options.include_usage`; custo só se o provedor enviar.
 * - Pi (RPC): `message_end` de cada mensagem do assistente traz `message.usage` (input, output, cacheRead, cacheWrite, cost.total), uma por chamada ao modelo.
 * - Motores por CLI sem interface de consumo não informam nada; contam só para o limite de duração.
 */

export type UsageDelta = { inputTokens: number; outputTokens: number; costUsd: number }
export const BUDGET_STOP_PREFIX = 'Orçamento esgotado'
export const BUDGET_WARN_RATIO = 0.8

const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

/** Aceita só limites positivos; tudo vazio vira sem orçamento. */
export function sanitizeBudget(value: unknown): MissionBudget | undefined {
  const input = record(value)
  const budget: MissionBudget = {}
  if (num(input.maxCostUsd)) budget.maxCostUsd = Math.min(num(input.maxCostUsd), 10_000)
  if (num(input.maxTokens)) budget.maxTokens = Math.round(Math.min(num(input.maxTokens), 1e10))
  if (num(input.maxMinutes)) budget.maxMinutes = Math.round(Math.min(num(input.maxMinutes), 7 * 24 * 60))
  return Object.keys(budget).length ? budget : undefined
}

/** Uma tarefa por linha; ignora linhas vazias e marcadores de lista. */
export function parseTasks(value: unknown): string[] {
  const lines = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : []
  return lines.filter((line): line is string => typeof line === 'string')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim().slice(0, 300)).filter(Boolean).slice(0, 30)
}

export function taskGoal(instructions: string, tasks: string[]): string {
  if (!tasks.length) return instructions
  return `${instructions}\n\nTarefas, nesta ordem:\n${tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}\n\nExecute cada tarefa em sequência ou delegue com ask_agent. Ao terminar cada uma, marque o passo como done (ou blocked, se falhou) com mission_update e uma nota curta do resultado ou do motivo da falha. Uma falha não impede as próximas tarefas.`
}

export function claudeUsage(message: unknown): UsageDelta {
  const value = record(message), usage = record(value.usage)
  return { inputTokens: num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens), outputTokens: num(usage.output_tokens), costUsd: num(value.total_cost_usd) }
}

/** `usage` do AssistantMessage do pi-ai (evento RPC `message_end`); custo vem calculado pelo Pi a partir da tabela do modelo. */
export function piUsage(message: unknown): UsageDelta {
  const usage = record(record(message).usage)
  return { inputTokens: num(usage.input) + num(usage.cacheRead) + num(usage.cacheWrite), outputTokens: num(usage.output), costUsd: num(record(usage.cost).total) }
}

/** Pacote final do stream OpenAI-compatível do OpenCode (`usage`); custo só se o provedor mandar `usage.cost`. */
export function openCodeUsage(packet: unknown): UsageDelta {
  const usage = record(record(packet).usage)
  return { inputTokens: num(usage.prompt_tokens), outputTokens: num(usage.completion_tokens), costUsd: num(usage.cost) }
}

/** Normaliza os eventos de consumo dos motores; null quando o evento não traz uso. */
export function usageFromRuntimeEvent(event: unknown): { threadId: string; turnId?: string; usage: UsageDelta } | null {
  const value = record(event), params = record(value.params)
  if (typeof params.threadId !== 'string') return null
  const turnId = typeof params.turnId === 'string' ? params.turnId : undefined
  if (value.method === 'turn/usage') {
    const usage = record(params.usage)
    return { threadId: params.threadId, turnId, usage: { inputTokens: num(usage.inputTokens), outputTokens: num(usage.outputTokens), costUsd: num(usage.costUsd) } }
  }
  if (value.method === 'thread/tokenUsage/updated') {
    const last = record(record(params.tokenUsage).last)
    return { threadId: params.threadId, turnId, usage: { inputTokens: num(last.inputTokens), outputTokens: num(last.outputTokens), costUsd: 0 } }
  }
  return null
}

export function addUsage(current: MissionUsage | undefined, delta: UsageDelta): MissionUsage {
  const base = current || { inputTokens: 0, outputTokens: 0, costUsd: 0, reports: 0 }
  return { inputTokens: base.inputTokens + delta.inputTokens, outputTokens: base.outputTokens + delta.outputTokens, costUsd: base.costUsd + delta.costUsd, reports: base.reports + 1 }
}

const usd = (value: number) => `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const int = (value: number) => Math.round(value).toLocaleString('pt-BR')
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** Maior fração consumida entre custo, tokens e duração; 'exceeded' a partir de 100%, 'warn' a partir de 80%. */
export function budgetCheck(mission: Pick<Mission, 'budget' | 'usage' | 'createdAt'>, now = new Date()): { level: 'ok' | 'warn' | 'exceeded'; reason: string } {
  const budget = mission.budget
  if (!budget) return { level: 'ok', reason: '' }
  const usage = mission.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0, reports: 0 }
  const elapsed = now.getTime() - new Date(mission.createdAt).getTime()
  const parts = [
    budget.maxCostUsd ? { ratio: usage.costUsd / budget.maxCostUsd, text: `custo ${usd(usage.costUsd)} de ${usd(budget.maxCostUsd)}` } : null,
    budget.maxTokens ? { ratio: (usage.inputTokens + usage.outputTokens) / budget.maxTokens, text: `${int(usage.inputTokens + usage.outputTokens)} de ${int(budget.maxTokens)} tokens` } : null,
    budget.maxMinutes ? { ratio: elapsed / (budget.maxMinutes * 60_000), text: `duração ${duration(elapsed)} de ${duration(budget.maxMinutes * 60_000)}` } : null,
  ].filter((item): item is { ratio: number; text: string } => !!item).sort((a, b) => b.ratio - a.ratio)
  const top = parts[0]
  if (!top || top.ratio < BUDGET_WARN_RATIO) return { level: 'ok', reason: top?.text || '' }
  return { level: top.ratio >= 1 ? 'exceeded' : 'warn', reason: top.text }
}

const STEP_LINE: Record<MissionStep['status'], string> = { done: '[feito]', blocked: '[falhou]', doing: '[incompleta]', pending: '[não iniciada]', skipped: '[ignorada]' }
const STATUS: Partial<Record<Mission['status'], string>> = { completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', waiting: 'Aguardando você' }

/** Relatório final: tarefas, falhas com motivo, arquivos alterados e consumo informado. */
export function buildMissionReport(mission: Mission, files: string[], now = new Date()): string {
  // Só a última falha conta: uma missão retomada com orçamento maior não é mais "interrompida pelo orçamento".
  const stoppedByBudget = mission.status === 'failed' && !!mission.updates.filter(update => update.kind === 'error').at(-1)?.text.startsWith(BUDGET_STOP_PREFIX)
  const status = stoppedByBudget ? 'Interrompida pelo orçamento' : STATUS[mission.status] || mission.status
  const lines = [`Relatório da missão "${mission.title}": ${status}.`, `Duração: ${duration(now.getTime() - new Date(mission.createdAt).getTime())} · turnos: ${mission.turns}.`]
  if (mission.steps.length) {
    lines.push('', 'Tarefas:')
    for (const step of mission.steps) lines.push(`- ${STEP_LINE[step.status]} ${step.title}${step.assignee ? ` (${step.assignee})` : ''}${step.note ? `: ${step.note}` : ''}`)
  }
  if (mission.result) lines.push('', `Resultado: ${mission.result}`)
  if (mission.status === 'waiting' && mission.question) lines.push('', `Pergunta pendente: ${mission.question}`)
  const failures = [...mission.steps.filter(step => step.status === 'blocked').map(step => `${step.title}: ${step.note || 'sem motivo registrado'}`),
    ...mission.updates.filter(update => update.kind === 'error').map(update => update.text)]
  if (['failed', 'cancelled'].includes(mission.status) && !failures.length) failures.push(mission.updates.at(-1)?.text || 'Encerrada sem motivo registrado.')
  if (failures.length) { lines.push('', 'Falhas:'); for (const failure of [...new Set(failures)].slice(-10)) lines.push(`- ${failure.slice(0, 400)}`) }
  lines.push('', files.length ? `Arquivos alterados (${files.length}):` : 'Arquivos alterados: nenhum registrado pelo Boobot.')
  for (const file of files.slice(0, 40)) lines.push(`- ${file}`)
  if (files.length > 40) lines.push(`- e mais ${files.length - 40}`)
  const usage = mission.usage
  lines.push('', usage?.reports
    ? `Consumo informado pelos motores: ${int(usage.inputTokens + usage.outputTokens)} tokens (entrada ${int(usage.inputTokens)}, saída ${int(usage.outputTokens)})${usage.costUsd ? ` · ${usd(usage.costUsd)}` : ' · custo não informado (Codex e OpenCode só informam tokens)'}.`
    : 'Consumo: os motores usados não informaram tokens nem custo.')
  if (mission.budget) {
    const check = budgetCheck(mission, now)
    lines.push(`Orçamento: ${describeBudget(mission.budget)}${check.reason ? ` (uso: ${check.reason})` : ''}.`)
  }
  return lines.join('\n')
}

export const describeBudget = (budget: MissionBudget) => [budget.maxCostUsd && usd(budget.maxCostUsd), budget.maxTokens && `${int(budget.maxTokens)} tokens`, budget.maxMinutes && duration(budget.maxMinutes * 60_000)].filter(Boolean).join(' · ')

/**
 * Novo orçamento para retomar uma missão parada por ele. Sem pedido explícito, cada limite vira o maior entre o limite e o já usado, mais metade do limite.
 * Limite pedido abaixo do consumo atual é recusado: a missão pararia de novo no próximo turno.
 */
export function raiseBudget(mission: Pick<Mission, 'budget' | 'usage' | 'createdAt'>, requested?: unknown, now = new Date()): MissionBudget {
  const current = mission.budget || {}, asked = sanitizeBudget(requested) || {}
  const usage = mission.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0, reports: 0 }
  const used: Required<MissionBudget> = { maxCostUsd: usage.costUsd, maxTokens: usage.inputTokens + usage.outputTokens, maxMinutes: (now.getTime() - new Date(mission.createdAt).getTime()) / 60_000 }
  const next: MissionBudget = {}
  for (const key of ['maxCostUsd', 'maxTokens', 'maxMinutes'] as const) {
    const limit = current[key], wanted = asked[key]
    if (wanted !== undefined) {
      if (wanted <= used[key]) throw new Error(`O novo limite (${key}) precisa ser maior que o já usado.`)
      next[key] = wanted
    } else if (limit) next[key] = key === 'maxCostUsd' ? Math.max(limit, used[key]) + limit / 2 : Math.ceil(Math.max(limit, used[key]) + limit / 2)
  }
  return next
}
