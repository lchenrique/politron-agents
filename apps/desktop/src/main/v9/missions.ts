import { randomUUID } from 'node:crypto'
import { ASSISTANT_ID, type Agent, type Mission, type MissionAction, type Routine, type Run, type StartMissionInput, type WorkspaceEvent } from '../../shared/v9'
import { DEFAULT_MISSION_TURNS, DEFAULT_ROUTINE_TURNS, decideAfterTurn, missionBrief, nextRoutineRun, normalizeSteps, validateTrigger } from '../../shared/missions'
import type { WorkspaceStore } from './store'

const ACTIVE_RUN = ['queued', 'running', 'waiting']
const text = (value: unknown, label: string, max: number) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: informe um texto de até ${max} caracteres.`); return value.trim() }

export interface MissionHost {
  store: WorkspaceStore
  send(conversationId: string, input: string, model: string | undefined, agentId: string): Promise<void>
  stop(conversationId: string): Promise<void>
  post(conversationId: string, role: 'user' | 'activity', agentId: string | null, text: string): void
  emit(event: WorkspaceEvent): void
  notify(conversationId: string, title: string, body: string): void
}
export type MissionToolContext = { conversationId: string; agentId: string; runId: string; parentRunId: string | null; workspaceId: string }

/**
 * Mantém objetivos vivos entre turnos: depois de cada turno do responsável decide continuar,
 * esperar delegações, pedir decisão ou encerrar. Também dispara rotinas agendadas e por evento.
 */
export class MissionEngine {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly evaluatedRuns = new Map<string, string>()
  private readonly scheduler: ReturnType<typeof setInterval>
  private disposed = false
  constructor(private readonly host: MissionHost) {
    this.scheduler = setInterval(() => void this.tickRoutines(), 30_000)
    this.scheduler.unref?.()
  }
  private get store() { return this.host.store }
  private save(mission: Mission): Mission {
    const next = { ...mission, updates: mission.updates.slice(-100), updatedAt: new Date().toISOString() }
    this.store.putMission(next); this.host.emit({ type: 'mission', mission: next }); return next
  }
  private note(mission: Mission, kind: Mission['updates'][number]['kind'], value: string, agentId: string | null = null): Mission {
    return { ...mission, updates: [...mission.updates, { at: new Date().toISOString(), agentId, kind, text: value.slice(0, 2000) }] }
  }
  private ownerOf(agentId: string | undefined): Agent {
    if (agentId) return this.store.agent(agentId)
    return this.store.agents().find(agent => agent.role === 'chief' && agent.temporaryStatus !== 'retired') || this.store.agent(ASSISTANT_ID)
  }

  start(input: StartMissionInput & { routineId?: string | null }, missionId?: string): Mission {
    const goal = text(input.goal, 'Objetivo', 20000)
    const owner = this.ownerOf(input.agentId)
    let conversation = input.conversationId ? this.store.conversation(input.conversationId) : undefined
    if (conversation && this.store.openMission(conversation.id)) throw new Error('Esta conversa já tem uma missão em andamento. Conclua, cancele ou responda a ela primeiro.')
    const title = (input.title?.trim() || goal.replace(/\s+/g, ' ')).slice(0, 80)
    if (!conversation) {
      const agentIds = owner.id === ASSISTANT_ID ? [] : [owner.id]
      conversation = this.store.saveConversation({ name: title, kind: 'direct', agentIds, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) })
    }
    if (owner.id !== ASSISTANT_ID && !conversation.agentIds.includes(owner.id)) throw new Error(`${owner.name} não participa desta conversa.`)
    const maxTurns = Math.max(1, Math.min(100, Math.round(input.maxTurns ?? DEFAULT_MISSION_TURNS)))
    const now = new Date().toISOString()
    const mission = this.save({ id: missionId || randomUUID(), title, goal, workspaceId: conversation.workspaceId, conversationId: conversation.id, ownerAgentId: owner.id,
      routineId: input.routineId ?? null, model: input.model || null, status: 'active', steps: [], updates: [{ at: now, agentId: null, kind: 'system', text: `Missão atribuída a ${owner.name}.` }],
      question: null, options: [], result: null, turns: 0, maxTurns, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: now, updatedAt: now, completedAt: null })
    this.host.emit({ type: 'changed' })
    this.host.post(conversation.id, 'user', null, goal)
    this.continueMission(mission, 'Comece agora: registre um plano curto com mission_update e execute o primeiro passo neste mesmo turno.')
    return mission
  }

  private continueMission(mission: Mission, extra: string) {
    if (this.disposed) return
    const delegations = this.store.delegations().filter(item => item.sourceConversationId === mission.conversationId).slice(-8)
      .map(item => ({ id: item.id, agent: (() => { try { return this.store.agent(item.recipientAgentId).name } catch { return item.recipientAgentId } })(), status: item.status }))
    void this.host.send(mission.conversationId, missionBrief(mission, extra, delegations), mission.model || undefined, mission.ownerAgentId).catch(error => {
      const current = this.store.mission(mission.id)
      if (!current || current.status !== 'active') return
      const failed = this.note({ ...current, status: 'failed', failures: current.failures + 1 }, 'error', `Não foi possível iniciar o turno: ${error instanceof Error ? error.message : String(error)}`)
      this.save(failed); this.host.post(mission.conversationId, 'activity', null, `Missão falhou ao iniciar: ${failed.updates.at(-1)?.text}`)
    })
  }

  /** Chamado ao fim de cada execução; agrupa eventos próximos e avalia uma vez. */
  onRunFinished(run: Run) { const mission = this.store.openMission(run.conversationId); if (mission) this.schedule(mission.id) }
  onDelegationFinished(sourceConversationId: string) { const mission = this.store.openMission(sourceConversationId); if (mission) this.schedule(mission.id) }
  onUserMessage(conversationId: string, value: string) {
    const mission = this.store.openMission(conversationId)
    if (!mission || mission.status === 'active') return
    this.save(this.note({ ...mission, status: 'active', question: null, options: [], idleTurns: 0, failures: 0 }, 'decision', `Usuário: ${value}`))
  }
  private schedule(missionId: string, delay = 1_200) {
    clearTimeout(this.timers.get(missionId))
    const timer = setTimeout(() => { this.timers.delete(missionId); this.evaluate(missionId) }, delay)
    timer.unref?.(); this.timers.set(missionId, timer)
  }
  private busy(conversationId: string) {
    return this.store.runs().some(run => run.conversationId === conversationId && ACTIVE_RUN.includes(run.status))
      || this.store.delegations().some(item => item.sourceConversationId === conversationId && ACTIVE_RUN.includes(item.status))
  }
  evaluate(missionId: string) {
    const mission = this.store.mission(missionId)
    if (!mission || mission.status !== 'active' || this.disposed || this.busy(mission.conversationId)) return
    const last = this.store.runs().filter(run => run.conversationId === mission.conversationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!last || this.evaluatedRuns.get(mission.id) === last.id) return
    this.evaluatedRuns.set(mission.id, last.id)
    const progressed = (!!mission.lastProgressAt && mission.lastProgressAt >= last.createdAt)
      || this.store.fileChangesForRun(last.id).some(change => change.status === 'applied')
      || this.store.commandEvidenceForRun(last.id).length > 0
      || this.store.delegations().some(item => item.parentRunId === last.id)
    const error = last.status === 'failed' ? this.store.message(last.messageId)?.text : undefined
    const decision = decideAfterTurn(mission, { status: last.status, error, progressed })
    if (decision.action === 'wait') return
    const counted = { ...mission, turns: mission.turns + (last.status === 'interrupted' ? 0 : 1), idleTurns: progressed ? 0 : mission.idleTurns + 1, failures: last.status === 'failed' ? mission.failures + 1 : 0 }
    if (decision.action === 'continue') {
      const saved = this.save(decision.note ? this.note(counted, 'error', decision.note) : counted)
      const timer = setTimeout(() => { const current = this.store.mission(saved.id); if (current?.status === 'active' && !this.busy(current.conversationId)) this.continueMission(current, decision.note) }, decision.delayMs)
      timer.unref?.()
      return
    }
    const saved = this.save(this.note({ ...counted, status: decision.status, question: decision.question ?? null, options: decision.status === 'waiting' ? ['Continuar'] : [] }, decision.kind, decision.note))
    this.host.post(saved.conversationId, 'activity', null, `${decision.note}${decision.question ? `\n${decision.question}` : ''}`)
    if (decision.status === 'waiting' || decision.status === 'failed') this.host.notify(saved.conversationId, decision.status === 'failed' ? 'Missão falhou' : 'O Chief precisa de você', `${saved.title}: ${decision.question || decision.note}`)
  }

  async action(missionId: string, action: MissionAction, value = ''): Promise<Mission> {
    const mission = this.store.mission(missionId)
    if (!mission) throw new Error('Missão não encontrada.')
    const reply = typeof value === 'string' ? value.trim().slice(0, 4000) : ''
    if (action === 'pause' || action === 'cancel') {
      if (!['active', 'waiting', 'paused'].includes(mission.status)) throw new Error('Esta missão já terminou.')
      const saved = this.save(this.note({ ...mission, status: action === 'pause' ? 'paused' : 'cancelled', completedAt: action === 'cancel' ? new Date().toISOString() : null }, 'system', action === 'pause' ? 'Pausada pelo usuário.' : 'Cancelada pelo usuário.'))
      await this.host.stop(mission.conversationId)
      return saved
    }
    if (action === 'resume' || action === 'reply' || action === 'extend') {
      if (!['waiting', 'paused', 'failed'].includes(mission.status)) throw new Error('Esta missão não está aguardando você.')
      if (action === 'reply' && !reply) throw new Error('Escreva a resposta para o Chief.')
      const budget = action === 'extend' || mission.turns >= mission.maxTurns ? mission.maxTurns + DEFAULT_MISSION_TURNS / 2 : mission.maxTurns
      const resumed = this.save(this.note({ ...mission, status: 'active', question: null, options: [], idleTurns: 0, failures: 0, maxTurns: budget }, 'decision', reply ? `Usuário: ${reply}` : 'Retomada pelo usuário.'))
      if (reply) this.host.post(mission.conversationId, 'user', null, reply)
      if (!this.busy(resumed.conversationId)) this.continueMission(resumed, reply ? `Resposta do usuário: ${reply}` : 'O usuário pediu para retomar. Confira o estado atual e continue.')
      return resumed
    }
    throw new Error('Ação de missão inválida.')
  }

  /** Ferramentas mission_* chamadas pelos agentes durante um turno. */
  tool(context: MissionToolContext, name: string, args: Record<string, unknown>): string {
    if (name === 'mission_start') {
      if (context.parentRunId) throw new Error('Você está executando uma tarefa delegada. Conclua-a e responda ao solicitante; quem coordena abre missões.')
      const existing = this.store.openMission(context.conversationId)
      if (existing) return `Já existe a missão ${existing.id} (${existing.title}) nesta conversa. Use mission_update para registrar o plano e o progresso.`
      const now = new Date().toISOString()
      const steps = args.steps === undefined ? [] : normalizeSteps(args.steps)
      const goal = text(args.goal, 'Objetivo', 20000)
      const mission = this.save({ id: randomUUID(), title: text(args.title ?? goal.slice(0, 80), 'Título', 120), goal, workspaceId: context.workspaceId, conversationId: context.conversationId,
        ownerAgentId: context.agentId, routineId: null, model: null, status: 'active', steps, updates: [{ at: now, agentId: context.agentId, kind: 'system', text: 'Missão aberta a partir da conversa.' }],
        question: null, options: [], result: null, turns: 0, maxTurns: Math.max(1, Math.min(100, Number(args.max_turns) || DEFAULT_MISSION_TURNS)), idleTurns: 0, failures: 0, lastProgressAt: now, createdAt: now, updatedAt: now, completedAt: null })
      this.host.emit({ type: 'changed' })
      return `Missão ${mission.id} aberta. Execute o primeiro passo agora. O Boobot continuará seus turnos automaticamente até mission_complete ou mission_block.`
    }
    const mission = this.store.openMission(context.conversationId)
    if (!mission) throw new Error('Não há missão aberta nesta conversa. Use mission_start para transformar o pedido em missão.')
    const now = new Date().toISOString()
    if (name === 'mission_update') {
      if (args.steps === undefined && args.note === undefined) throw new Error('Envie steps e/ou note.')
      const steps = args.steps !== undefined ? normalizeSteps(args.steps, mission.steps) : mission.steps
      // Só mudança real no plano conta como progresso; nota de "aguardando" não reinicia o ciclo da missão.
      const planChanged = JSON.stringify(steps.map(step => [step.title, step.status])) !== JSON.stringify(mission.steps.map(step => [step.title, step.status]))
      let next: Mission = { ...mission, steps, ...(planChanged ? { lastProgressAt: now } : {}) }
      if (args.note !== undefined) next = this.note(next, 'progress', text(args.note, 'Nota', 2000), context.agentId)
      this.save(next)
      return 'Progresso registrado. Continue executando.'
    }
    if (name === 'mission_complete') {
      const result = text(args.result, 'Resultado', 12000)
      const steps = mission.steps.map(step => step.status === 'doing' ? { ...step, status: 'done' as const } : step)
      const saved = this.save(this.note({ ...mission, steps, status: 'completed', result, question: null, options: [], completedAt: now, lastProgressAt: now }, 'result', 'Missão concluída.', context.agentId))
      this.host.notify(saved.conversationId, 'Missão concluída', saved.title)
      return 'Missão marcada como concluída. Encerre com um resumo curto para o usuário.'
    }
    if (name === 'mission_block') {
      const question = text(args.question, 'Pergunta', 1000)
      const options = Array.isArray(args.options) ? args.options.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, 6).map(item => item.trim().slice(0, 100)) : []
      const saved = this.save(this.note({ ...mission, status: 'waiting', question, options }, 'decision', `Aguardando decisão: ${question}`, context.agentId))
      this.host.notify(saved.conversationId, 'O Chief precisa de você', `${saved.title}: ${question}`)
      return 'Missão aguardando a decisão do usuário. Encerre o turno com um resumo curto do estado atual; a missão continua quando ele responder.'
    }
    throw new Error(`Ferramenta desconhecida: ${name}`)
  }

  saveRoutine(input: Partial<Routine>): Routine {
    const previous = input.id ? this.store.routine(input.id) : undefined
    const name = text(input.name ?? previous?.name, 'Nome', 80)
    const instructions = text(input.instructions ?? previous?.instructions, 'O que fazer', 8000)
    const agentId = this.ownerOf(input.agentId ?? previous?.agentId).id
    const workspace = input.workspaceId ?? previous?.workspaceId ?? this.store.workspaces().find(item => !item.archived && item.kind === 'free' && item.name === 'Livre')?.id
    if (!workspace || this.store.workspace(workspace).archived) throw new Error('Escolha um projeto ativo para a rotina.')
    const trigger = validateTrigger(input.trigger ?? previous?.trigger)
    const enabled = input.enabled ?? previous?.enabled ?? true
    if (typeof enabled !== 'boolean') throw new Error('Estado da rotina inválido.')
    const maxTurns = Math.max(1, Math.min(50, Math.round(Number(input.maxTurns ?? previous?.maxTurns ?? DEFAULT_ROUTINE_TURNS)) || DEFAULT_ROUTINE_TURNS))
    const now = new Date().toISOString()
    const triggerChanged = JSON.stringify(trigger) !== JSON.stringify(previous?.trigger)
    const value: Routine = { id: previous?.id || randomUUID(), name, instructions, agentId, workspaceId: workspace, trigger, enabled, maxTurns,
      model: input.model === undefined ? previous?.model ?? null : input.model || null,
      conversationId: workspace === previous?.workspaceId && agentId === previous?.agentId ? previous.conversationId : null,
      lastRunAt: previous?.lastRunAt ?? null, nextRunAt: triggerChanged || !previous?.nextRunAt ? nextRoutineRun(trigger, new Date()) : previous.nextRunAt,
      lastMissionId: previous?.lastMissionId ?? null, createdAt: previous?.createdAt || now, updatedAt: now }
    this.store.putRoutine(value); this.host.emit({ type: 'changed' }); return value
  }
  deleteRoutine(id: string) { this.store.routine(id); this.store.deleteRoutine(id); this.host.emit({ type: 'changed' }) }
  runRoutine(id: string, reason = 'execução manual'): Mission {
    const routine = this.store.routine(id)
    let conversationId = routine.conversationId
    try { if (conversationId && this.store.conversation(conversationId).archived) conversationId = null } catch { conversationId = null }
    if (conversationId && this.store.openMission(conversationId)) throw new Error(`A rotina ${routine.name} ainda tem uma missão em andamento.`)
    if (!conversationId) conversationId = this.store.saveConversation({ name: `Rotina: ${routine.name}`, kind: 'direct', agentIds: routine.agentId === ASSISTANT_ID ? [] : [routine.agentId], workspaceId: routine.workspaceId }).id
    const now = new Date()
    this.store.putRoutine({ ...routine, conversationId, lastRunAt: now.toISOString(), nextRunAt: nextRoutineRun(routine.trigger, now), updatedAt: now.toISOString() })
    const mission = this.start({ goal: `${routine.instructions}\n\n(Rotina "${routine.name}", disparada por ${reason} em ${now.toLocaleString('pt-BR')}. Compare com as execuções anteriores desta conversa e entregue um resumo objetivo do que verificou, corrigiu e do que precisa da decisão do usuário.)`,
      title: `${routine.name} · ${now.toLocaleDateString('pt-BR')}`, conversationId, agentId: routine.agentId, maxTurns: routine.maxTurns, model: routine.model, routineId: routine.id })
    this.store.putRoutine({ ...this.store.routine(routine.id), lastMissionId: mission.id })
    this.host.emit({ type: 'changed' })
    return mission
  }
  private tryRoutine(routine: Routine, reason: string) {
    try { this.runRoutine(routine.id, reason) }
    catch (error) {
      // Evita repetir a cada 30 s quando a rotina anterior ainda está aberta.
      this.store.putRoutine({ ...routine, nextRunAt: nextRoutineRun(routine.trigger, new Date()), updatedAt: new Date().toISOString() })
      console.warn('[Rotinas]', routine.name, error instanceof Error ? error.message : error)
    }
  }
  tickRoutines(now = new Date()) {
    if (this.disposed) return
    for (const routine of this.store.routines()) if (routine.enabled && routine.nextRunAt && routine.nextRunAt <= now.toISOString()) this.tryRoutine(routine, 'agenda')
  }
  onProjectChanged(workspaceId: string) {
    const cooldown = new Date(Date.now() - 30 * 60_000).toISOString()
    for (const routine of this.store.routines()) {
      if (!routine.enabled || routine.workspaceId !== workspaceId || routine.trigger.kind !== 'event' || routine.trigger.event !== 'project-changed') continue
      if (routine.lastRunAt && routine.lastRunAt > cooldown) continue
      if (routine.conversationId && this.store.openMission(routine.conversationId)) continue
      this.tryRoutine(routine, 'alteração no projeto')
    }
  }
  /** Após reiniciar: missões ativas retomam e rotinas de abertura disparam. */
  resumeAfterRestart() {
    for (const mission of this.store.missions(500).filter(item => item.status === 'active'))
      this.continueMission(this.save(this.note(mission, 'system', 'Retomada após reinício do Boobot.')), 'O Boobot foi reiniciado e o turno anterior foi interrompido. Confira o estado real (arquivos, comandos, delegações) e continue do ponto em que parou.')
    for (const routine of this.store.routines()) if (routine.enabled && routine.trigger.kind === 'event' && routine.trigger.event === 'app-start') this.tryRoutine(routine, 'abertura do Boobot')
    this.tickRoutines()
  }
  dispose() { this.disposed = true; clearInterval(this.scheduler); for (const timer of this.timers.values()) clearTimeout(timer) }
}
