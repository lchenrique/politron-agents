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
})
