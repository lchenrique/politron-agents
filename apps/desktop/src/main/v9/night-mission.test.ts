// @vitest-environment node
import type { ServiceInternals, RunContext } from './test-support'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'
import type { MissionEngine } from './missions'

const resources: { service: AppService; root: string }[] = []
afterEach(() => { for (const { service, root } of resources.splice(0)) { service.dispose(); rmSync(root, { recursive: true, force: true }) } })

type Internals = ServiceInternals & { missions: MissionEngine; onRuntimeEvent(event: unknown, runtime: unknown): Promise<void> }
const fakeRuntime = {}

/** Turnos simulados com o runtime falso: cada turno recebe o contexto real e pode chamar ferramentas e emitir consumo. */
function setup(turns: ((context: RunContext, broker: Internals) => Promise<void>)[]) {
  const root = mkdtempSync(join(tmpdir(), 'boobot-night-'))
  const service = new AppService(join(root, 'profile')); resources.push({ service, root })
  const chief = service.saveAgent({ name: 'Atlas', role: 'chief', instructions: 'Coordene.', canWrite: true, approvalMode: 'automatic' })
  const workspace = service.store.saveWorkspace({ name: 'Produto', path: root })
  const broker = service as unknown as Internals
  const inputs: string[] = []
  vi.spyOn(broker, 'execute').mockImplementation(async (context: RunContext) => {
    inputs.push(context.run.input)
    context.run.threadId = `thread-${inputs.length}`; context.runtime = fakeRuntime as never
    broker.contexts.set(context.run.id, context)
    const turn = turns[inputs.length - 1]
    try { if (turn) await turn(context, broker); await broker.finish(context, 'completed', `turno ${inputs.length}`) }
    catch (error) { await broker.finish(context, 'failed', String(error)) }
    finally { broker.contexts.delete(context.run.id) }
  })
  return { service, chief, workspace, broker, inputs }
}
const call = (broker: Internals, context: unknown, name: string, args: Record<string, unknown>) => broker.callTool(context, name, args)
const usage = (broker: Internals, context: RunContext, inputTokens: number, costUsd = 0) =>
  broker.onRuntimeEvent({ method: 'turn/usage', params: { threadId: context.run.threadId, turnId: 'x', usage: { inputTokens, outputTokens: 0, costUsd } } }, fakeRuntime)

describe('missão noturna', () => {
  it('dispara no horário, executa a lista e fixa o relatório na conversa', async () => {
    const { service, workspace, broker, inputs } = setup([
      async (context, b) => {
        await usage(b, context, 1200, 0.03)
        service.store.putFileChange({ id: 'f1', runId: context.run.id, messageId: context.message.id, toolCallId: 't1', agentId: context.agent.id, workspaceId: workspace.id, path: 'src/app.ts', status: 'applied', before: '', after: 'x', additions: 1, deletions: 0, truncated: false, binary: false, createdAt: new Date().toISOString() })
        const mission = service.store.openMission(context.conversation.id)!
        await call(b, context, 'mission_update', { steps: mission.steps.map((step, index) => index === 0 ? { title: step.title, status: 'done', note: 'testes verdes' } : { title: step.title, status: 'blocked', note: 'sem acesso ao npm' }) })
        await call(b, context, 'mission_complete', { result: 'Uma de duas tarefas feita.' })
      },
    ])
    const at = new Date(Date.now() + 60 * 60_000)
    const routine = service.saveRoutine({ name: 'Noite', instructions: '', tasks: ['Rodar testes', 'Publicar pacote'], workspaceId: workspace.id, trigger: { kind: 'once', at: at.toISOString() } })
    expect(routine.nextRunAt).toBe(at.toISOString())
    expect(routine.instructions).toMatch(/lista de tarefas/)

    broker.missions.tickRoutines(new Date(at.getTime() - 60_000))
    expect(inputs).toHaveLength(0)
    broker.missions.tickRoutines(new Date(at.getTime() + 1_000))
    const missionId = service.store.routine(routine.id).lastMissionId!
    expect(service.store.routine(routine.id).nextRunAt).toBeNull()
    expect(service.store.mission(missionId)!.steps.map(step => step.title)).toEqual(['Rodar testes', 'Publicar pacote'])

    await vi.waitFor(() => expect(service.store.mission(missionId)!.status).toBe('completed'), { timeout: 15_000, interval: 100 })
    const mission = service.store.mission(missionId)!
    expect(inputs[0]).toContain('1. Rodar testes')
    expect(mission.usage).toMatchObject({ inputTokens: 1200, costUsd: 0.03, reports: 1 })
    expect(mission.report).toContain('[feito] Rodar testes: testes verdes')
    expect(mission.report).toContain('Publicar pacote: sem acesso ao npm')
    expect(mission.report).toContain('- src/app.ts')
    expect(mission.report).toContain('US$ 0,03')
    expect(service.store.history(mission.conversationId).some(message => message.role === 'activity' && message.text.startsWith('Relatório da missão'))).toBe(true)

    broker.missions.tickRoutines(new Date(at.getTime() + 3_600_000))
    expect(inputs).toHaveLength(1)
  }, 20_000)

  it('avisa a 80% e para a missão ao estourar o orçamento de tokens', async () => {
    const { service, workspace, broker, inputs } = setup([
      async (context, b) => { await usage(b, context, 850); await call(b, context, 'mission_update', { note: 'parte 1', steps: [{ title: 'Tarefa', status: 'doing' }] }) },
      async (context, b) => { await usage(b, context, 300) },
      async (context, b) => { await call(b, context, 'mission_complete', { result: 'não deveria chegar aqui' }) },
    ])
    const routine = service.saveRoutine({ name: 'Com teto', instructions: 'Trabalhe.', tasks: ['Tarefa'], workspaceId: workspace.id, trigger: { kind: 'once', at: new Date().toISOString() }, budget: { maxTokens: 1000 } })
    const started = service.runRoutine(routine.id)
    expect(started.budget).toEqual({ maxTokens: 1000 })
    await vi.waitFor(() => expect(service.store.mission(started.id)!.status).toBe('failed'), { timeout: 15_000, interval: 100 })
    const mission = service.store.mission(started.id)!
    expect(mission.updates.some(update => update.text.startsWith('Aviso: 80% do orçamento'))).toBe(true)
    expect(mission.updates.at(-1)?.text).toMatch(/^Orçamento esgotado: 1\.150 de 1\.000 tokens/)
    expect(mission.report).toContain('Interrompida pelo orçamento')
    await new Promise(resolve => setTimeout(resolve, 2_000))
    expect(inputs).toHaveLength(2)
  }, 20_000)

  it('encerra pela duração máxima mesmo sem consumo informado', async () => {
    const { service, workspace, broker } = setup([async () => { await new Promise(resolve => setTimeout(resolve, 3_000)) }])
    const routine = service.saveRoutine({ name: 'Laço', instructions: 'Trabalhe.', workspaceId: workspace.id, trigger: { kind: 'once', at: new Date().toISOString() }, budget: { maxMinutes: 5 } })
    const started = service.runRoutine(routine.id)
    service.store.putMission({ ...service.store.mission(started.id)!, createdAt: new Date(Date.now() - 6 * 60_000).toISOString() })
    broker.missions.checkBudgets()
    const mission = service.store.mission(started.id)!
    expect(mission.status).toBe('failed')
    expect(mission.report).toMatch(/duração 6 min de 5 min/)
  }, 20_000)

  it('o Chief cria a missão noturna pela conversa: horário ou agora, tarefas e orçamento', async () => {
    const { service, chief, workspace, broker, inputs } = setup([async (context, b) => { await call(b, context, 'mission_complete', { result: 'ok' }) }])
    const conversation = service.saveConversation({ workspaceId: workspace.id, agentIds: [chief.id] })
    const context = { agent: chief, conversation, run: { id: 'r', parentId: null, conversationId: conversation.id, workspaceId: workspace.id, workspacePath: workspace.path, planMode: false, ancestry: [chief.id] }, message: { id: 'm' }, signal: new AbortController().signal }
    const at = '2099-01-01T23:00:00-03:00'
    await expect(call(broker, context, 'routine_create', { name: 'Noite', schedule: 'once', at, tasks: ['Atualizar deps', 'Rodar testes'], max_cost_usd: 2, max_tokens: 50000, max_minutes: 90 })).resolves.toContain('Uma vez')
    expect(service.store.routines().find(item => item.name === 'Noite')).toMatchObject({ trigger: { kind: 'once', at: '2099-01-02T02:00:00.000Z' }, nextRunAt: '2099-01-02T02:00:00.000Z',
      tasks: ['Atualizar deps', 'Rodar testes'], budget: { maxCostUsd: 2, maxTokens: 50000, maxMinutes: 90 } })
    expect(inputs).toHaveLength(0)

    await expect(call(broker, context, 'routine_create', { name: 'Já', schedule: 'once', at: 'now', tasks: ['Revisar PRs'], max_tokens: 1000 })).resolves.toMatch(/iniciada agora \(1 tarefa/)
    const routine = service.store.routines().find(item => item.name === 'Já')!
    const mission = service.store.mission(routine.lastMissionId!)!
    expect(mission).toMatchObject({ budget: { maxTokens: 1000 }, routineId: routine.id })
    expect(mission.steps.map(step => step.title)).toEqual(['Revisar PRs'])
    expect(routine.nextRunAt).toBeNull()
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('completed'), { timeout: 15_000, interval: 100 })
  }, 20_000)

  it('soma ao orçamento o consumo de delegações de delegações e para a árvore inteira', async () => {
    const { service, chief, workspace, broker } = setup([])
    const stop = vi.spyOn(broker as unknown as { stop(id: string): Promise<void> }, 'stop').mockResolvedValue(undefined)
    const [a, b, c] = ['Missão', 'Dev', 'QA'].map(name => service.saveConversation({ name, workspaceId: workspace.id, agentIds: [chief.id] }))
    const now = new Date().toISOString()
    service.store.putMission({ id: 'm1', title: 'Noite', goal: 'g', workspaceId: workspace.id, conversationId: a.id, ownerAgentId: chief.id, routineId: null, model: null, status: 'active', budget: { maxTokens: 1000 },
      steps: [], updates: [], question: null, options: [], result: null, turns: 1, maxTurns: 8, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: now, updatedAt: now, completedAt: null })
    const run = (id: string, conversationId: string, parentId: string | null) => service.store.putRun({ id, conversationId, agentId: chief.id, rootId: 'r0', parentId, ancestry: [chief.id], status: 'running', threadId: null, turnId: null,
      messageId: 'x', input: '', inputMessageId: 'x', agent: chief, workspaceId: workspace.id, workspacePath: workspace.path, createdAt: now } as never)
    run('r0', a.id, null); run('r1', b.id, 'r0'); run('r2', c.id, 'r1')
    const delegation = (id: string, source: string, target: string, parent: string, child: string) => service.store.putDelegation({ id, idempotencyKey: id, rootRunId: 'r0', parentRunId: parent, childRunId: child, sourceConversationId: source, targetConversationId: target, status: 'running' } as never)
    delegation('d1', a.id, b.id, 'r0', 'r1'); delegation('d2', b.id, c.id, 'r1', 'r2')

    broker.missions.onUsage(c.id, { inputTokens: 300, outputTokens: 0, costUsd: 0 }, 'r2')
    broker.missions.onUsage(b.id, { inputTokens: 200, outputTokens: 0, costUsd: 0 }, 'r1')
    expect(service.store.mission('m1')!.usage).toMatchObject({ inputTokens: 500, reports: 2 })
    broker.missions.onUsage(c.id, { inputTokens: 600, outputTokens: 0, costUsd: 0 }, 'r2')
    expect(service.store.mission('m1')!.status).toBe('failed')
    expect(stop.mock.calls.map(([id]) => id).sort()).toEqual([a.id, b.id, c.id].sort())
  })

  it('aumenta o orçamento e retoma a missão parada por ele', async () => {
    const { service, chief, workspace, broker, inputs } = setup([
      async (context, b) => { await usage(b, context, 1200) },
      async (context, b) => { await call(b, context, 'mission_complete', { result: 'Terminei depois do aumento.' }) },
    ])
    const routine = service.saveRoutine({ name: 'Teto', instructions: 'Trabalhe.', tasks: ['Tarefa'], workspaceId: workspace.id, trigger: { kind: 'once', at: new Date().toISOString() }, budget: { maxTokens: 1000 } })
    const started = service.runRoutine(routine.id)
    await vi.waitFor(() => expect(service.store.mission(started.id)!.status).toBe('failed'), { timeout: 15_000, interval: 100 })
    await expect(service.missionAction(started.id, 'raise_budget', JSON.stringify({ maxTokens: 1100 }))).rejects.toThrow(/maior que o já usado/)

    const other = service.saveConversation({ workspaceId: workspace.id, agentIds: [chief.id] })
    const context = { agent: chief, conversation: other, run: { id: 'r', parentId: null, conversationId: other.id, workspaceId: workspace.id, workspacePath: workspace.path, planMode: false, ancestry: [chief.id] }, message: { id: 'm' }, signal: new AbortController().signal }
    await expect(call(broker, context, 'mission_control', { mission_id: started.id, action: 'raise_budget', max_tokens: 5000 })).resolves.toContain('Aumentou o orçamento')
    expect(service.store.mission(started.id)!.budget).toEqual({ maxTokens: 5000 })
    await vi.waitFor(() => expect(service.store.mission(started.id)!.status).toBe('completed'), { timeout: 15_000, interval: 100 })
    const mission = service.store.mission(started.id)!
    expect(inputs).toHaveLength(2)
    expect(inputs[1]).toContain('aumentou o orçamento')
    expect(mission.updates.some(update => update.text.startsWith('Orçamento aumentado e missão retomada'))).toBe(true)
    expect(mission.report).not.toContain('Interrompida pelo orçamento')
  }, 25_000)
})
