import type { Mission, MissionStep, RoutineTrigger, RunStatus } from './v9'

export const DEFAULT_MISSION_TURNS = 20
export const DEFAULT_ROUTINE_TURNS = 8
export const MAX_IDLE_TURNS = 2
export const MAX_FAILURES = 3
export const ACTIVE_MISSION: Mission['status'][] = ['active', 'waiting', 'paused']

export function validateTrigger(value: unknown): RoutineTrigger {
  const input = value as Partial<RoutineTrigger> | null
  if (input?.kind === 'daily') {
    const time = String((input as { time?: unknown }).time || '')
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Informe o horário no formato HH:MM.')
    const raw = (input as { weekdays?: unknown }).weekdays
    const weekdays = Array.isArray(raw) ? [...new Set(raw.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : []
    return { kind: 'daily', time, weekdays }
  }
  if (input?.kind === 'interval') {
    const minutes = Number((input as { minutes?: unknown }).minutes)
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 7 * 24 * 60) throw new Error('O intervalo precisa ficar entre 15 minutos e 7 dias.')
    return { kind: 'interval', minutes: Math.round(minutes) }
  }
  if (input?.kind === 'event' && ['app-start', 'project-changed'].includes(String((input as { event?: unknown }).event)))
    return { kind: 'event', event: (input as { event: 'app-start' | 'project-changed' }).event }
  throw new Error('Gatilho de rotina inválido.')
}

/** Próxima execução no fuso local; eventos não têm horário. */
export function nextRoutineRun(trigger: RoutineTrigger, from: Date): string | null {
  if (trigger.kind === 'interval') return new Date(from.getTime() + trigger.minutes * 60_000).toISOString()
  if (trigger.kind !== 'daily') return null
  const [hours, minutes] = trigger.time.split(':').map(Number)
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from)
    candidate.setDate(candidate.getDate() + offset)
    candidate.setHours(hours, minutes, 0, 0)
    if (candidate <= from) continue
    if (!trigger.weekdays.length || trigger.weekdays.includes(candidate.getDay())) return candidate.toISOString()
  }
  return null
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function describeTrigger(trigger: RoutineTrigger): string {
  if (trigger.kind === 'interval') return trigger.minutes % 60 === 0 ? `A cada ${trigger.minutes / 60} h` : `A cada ${trigger.minutes} min`
  if (trigger.kind === 'event') return trigger.event === 'app-start' ? 'Ao abrir o Boobot' : 'Quando o projeto mudar'
  const days = !trigger.weekdays.length || trigger.weekdays.length === 7 ? 'Todos os dias' : trigger.weekdays.join() === '1,2,3,4,5' ? 'Dias úteis' : trigger.weekdays.map(day => WEEKDAYS[day]).join(', ')
  return `${days} às ${trigger.time}`
}

export function normalizeSteps(value: unknown, previous: MissionStep[] = []): MissionStep[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Envie de 1 a 30 passos.')
  return value.map((item, index) => {
    const raw = typeof item === 'string' ? { title: item } : item as Record<string, unknown>
    const title = typeof raw?.title === 'string' ? raw.title.trim().slice(0, 300) : ''
    if (!title) throw new Error('Cada passo precisa de um título.')
    const status = ['pending', 'doing', 'done', 'blocked', 'skipped'].includes(String(raw.status)) ? raw.status as MissionStep['status'] : 'pending'
    const match = previous.find(step => step.title === title) || previous[index]
    return { id: match?.id || `s${index + 1}-${Date.now().toString(36)}`, title, status,
      ...(typeof raw.assignee === 'string' && raw.assignee.trim() ? { assignee: raw.assignee.trim().slice(0, 80) } : {}),
      ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim().slice(0, 500) } : {}) }
  })
}

export type MissionDecision =
  | { action: 'continue'; note: string; delayMs: number }
  | { action: 'wait' }
  | { action: 'set'; status: Mission['status']; question?: string; note: string; kind: 'system' | 'error' }

/** Decide o próximo passo depois que o responsável termina um turno; o chamador aplica contadores e persiste. */
export function decideAfterTurn(mission: Mission, outcome: { status: RunStatus; error?: string; progressed: boolean }): MissionDecision {
  if (mission.status !== 'active') return { action: 'wait' }
  if (outcome.status === 'interrupted') return { action: 'set', status: 'paused', note: 'Execução interrompida. A missão foi pausada; retome quando quiser.', kind: 'system' }
  if (outcome.status === 'failed') {
    if (mission.failures + 1 >= MAX_FAILURES) return { action: 'set', status: 'failed', note: `Falhou ${MAX_FAILURES} vezes seguidas: ${outcome.error || 'erro do motor'}`, kind: 'error' }
    return { action: 'continue', note: `A tentativa anterior falhou (${(outcome.error || 'erro do motor').slice(0, 400)}). Diagnostique a causa e tente outra abordagem.`, delayMs: 5_000 * (mission.failures + 1) }
  }
  if (mission.turns + 1 >= mission.maxTurns) return { action: 'set', status: 'waiting', question: `Usei o limite de ${mission.maxTurns} turnos desta missão. Devo continuar?`, note: 'Orçamento de turnos atingido.', kind: 'system' }
  if (!outcome.progressed && mission.idleTurns + 1 >= MAX_IDLE_TURNS) return { action: 'set', status: 'waiting', question: 'Não registrei progresso nas últimas tentativas. Como devo prosseguir?', note: 'Sem progresso verificável em turnos seguidos.', kind: 'system' }
  return { action: 'continue', note: '', delayMs: 1_500 }
}

const STEP_MARK: Record<MissionStep['status'], string> = { pending: '[ ]', doing: '[>]', done: '[x]', blocked: '[!]', skipped: '[-]' }

/** Briefing de cada turno autônomo: o motor injeta o estado persistido em vez de depender da memória da sessão. */
export function missionBrief(mission: Mission, extra: string, delegations: { id: string; agent: string; status: string }[] = []): string {
  const plan = mission.steps.length ? mission.steps.map((step, index) => `${index + 1}. ${STEP_MARK[step.status]} ${step.title}${step.assignee ? ` (${step.assignee})` : ''}${step.note ? ` — ${step.note}` : ''}`).join('\n') : '(sem plano registrado; registre os passos com mission_update)'
  const updates = mission.updates.slice(-6).map(update => `- ${update.text}`).join('\n')
  return `[MISSÃO ${mission.id} · turno ${mission.turns + 1}/${mission.maxTurns}]
Objetivo: ${mission.goal}
Plano:
${plan}${updates ? `\nÚltimas atualizações:\n${updates}` : ''}${delegations.length ? `\nDelegações desta conversa: ${delegations.map(item => `${item.id} → ${item.agent} (${item.status})`).join('; ')}` : ''}${extra ? `\n\n${extra}` : ''}

Protocolo de missão: execute agora o próximo passo usando as ferramentas reais. Não descreva o que pretende fazer sem fazer. Registre progresso com mission_update (passos e nota curta). Se só estiver aguardando Boos delegados, encerre o turno sem consultar status: você será acordado quando eles terminarem. Delegue partes independentes com ask_agent quando houver especialista. Valide o resultado (testes, leitura, evidência). Ao concluir e validar tudo, chame mission_complete com o resultado e as evidências. Se precisar de uma decisão real do usuário ou de acesso que não tem, chame mission_block com a pergunta. Não peça confirmação para passos dentro das suas permissões.`
}
