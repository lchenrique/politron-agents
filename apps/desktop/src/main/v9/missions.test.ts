// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

const resources: { service: AppService; root: string }[] = []
afterEach(() => { for (const { service, root } of resources.splice(0)) { service.dispose(); rmSync(root, { recursive: true, force: true }) } })

/** Turnos simulados: cada função recebe o contexto real do run e chama ferramentas reais do Boobot. */
function setup(turns: ((context: any, broker: any) => Promise<void>)[]) {
  const root = mkdtempSync(join(tmpdir(), 'boobot-missions-'))
  const service = new AppService(join(root, 'profile')); resources.push({ service, root })
  const chief = service.saveAgent({ name: 'Atlas', role: 'chief', instructions: 'Coordene.', canWrite: true, approvalMode: 'automatic' })
  const workspace = service.store.saveWorkspace({ name: 'Produto', path: root })
  const broker = service as any
  const inputs: string[] = []
  vi.spyOn(broker, 'execute').mockImplementation(async (context: any) => {
    inputs.push(context.run.input)
    broker.contexts.set(context.run.id, context)
    const turn = turns[inputs.length - 1]
    try { if (turn) await turn(context, broker); await broker.finish(context, 'completed', `turno ${inputs.length}`) }
    catch (error) { await broker.finish(context, 'failed', String(error)) }
    finally { broker.contexts.delete(context.run.id) }
  })
  return { service, chief, workspace, broker, inputs }
}
const call = (broker: any, context: any, name: string, args: Record<string, unknown>) => broker.callTool(context, name, args)

describe('missões autônomas', () => {
  it('continua os turnos sozinho até o agente concluir com evidência', async () => {
    const { service, workspace, broker, inputs } = setup([
      async (context, b) => { await call(b, context, 'mission_update', { steps: [{ title: 'Pesquisar mercado', status: 'done' }, { title: 'Montar plano de lançamento', status: 'doing' }], note: 'Pesquisa salva em notas.md' }) },
      async (context, b) => { await call(b, context, 'mission_complete', { result: 'Plano entregue em plano.md; 3 concorrentes analisados.' }) },
    ])
    const mission = service.startMission({ goal: 'Preciso lançar um novo produto.', workspaceId: workspace.id })
    expect(mission.ownerAgentId).toBe(service.store.agents().find(agent => agent.role === 'chief')!.id)
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('completed'), { timeout: 15_000, interval: 100 })
    const done = service.store.mission(mission.id)!
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain('Comece agora')
    expect(inputs[1]).toContain('[x] Pesquisar mercado')
    expect(done.result).toContain('plano.md')
    expect(done.steps.every(step => step.status === 'done')).toBe(true)
    expect(service.store.history(mission.conversationId).some(message => message.role === 'user' && message.text === 'Preciso lançar um novo produto.')).toBe(true)
  }, 20_000)

  it('não entra em laço sem progresso e retoma quando o usuário responde', async () => {
    const { service, workspace, broker, inputs } = setup([
      async () => undefined,
      async () => undefined,
      async (context, b) => { await call(b, context, 'mission_complete', { result: 'Feito com a orientação.' }) },
    ])
    const mission = service.startMission({ goal: 'Descubra por que o projeto não funciona.', workspaceId: workspace.id })
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('waiting'), { timeout: 15_000, interval: 100 })
    expect(service.store.mission(mission.id)!.question).toMatch(/progresso/)
    await service.missionAction(mission.id, 'reply', 'Olhe o build primeiro.')
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('completed'), { timeout: 15_000, interval: 100 })
    expect(inputs[2]).toContain('Resposta do usuário: Olhe o build primeiro.')
    void broker
  }, 25_000)

  it('pausa ao bloquear por decisão e o chat também retoma a missão', async () => {
    const { service, workspace, inputs } = setup([
      async (context, b) => { await call(b, context, 'mission_block', { question: 'Qual público-alvo?', options: ['B2B', 'B2C'] }) },
      async (context, b) => { await call(b, context, 'mission_complete', { result: 'Segmentado para B2C.' }) },
    ])
    const mission = service.startMission({ goal: 'Pesquise o mercado.', workspaceId: workspace.id })
    await vi.waitFor(() => expect(service.store.mission(mission.id)).toMatchObject({ status: 'waiting', options: ['B2B', 'B2C'] }), { timeout: 10_000, interval: 100 })
    await service.send(mission.conversationId, 'B2C')
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('completed'), { timeout: 10_000, interval: 100 })
    expect(inputs).toHaveLength(2)
  }, 20_000)

  it('abre missão pela ferramenta do chat, mas não a partir de tarefa delegada', async () => {
    const { service, workspace, chief, broker } = setup([])
    const conversation = service.saveConversation({ workspaceId: workspace.id, agentIds: [chief.id] })
    const run = { id: 'r1', parentId: null, conversationId: conversation.id, workspaceId: workspace.id, workspacePath: workspace.path, planMode: false, ancestry: [chief.id] }
    const context = { agent: chief, conversation, run, message: { id: 'm' } }
    await expect(call(broker, context, 'mission_start', { goal: 'Organize o lançamento', steps: ['Pesquisar', 'Executar'] })).resolves.toContain('aberta')
    expect(service.store.openMission(conversation.id)!.steps.map(step => step.title)).toEqual(['Pesquisar', 'Executar'])
    await expect(call(broker, context, 'mission_start', { goal: 'Outra' })).resolves.toContain('Já existe')
    await expect(call(broker, { ...context, run: { ...run, parentId: 'pai' } }, 'mission_start', { goal: 'x' })).rejects.toThrow(/delegada/)
  })
})

describe('rotinas', () => {
  it('dispara pela agenda, reaproveita a conversa e não duplica enquanto há missão aberta', async () => {
    const { service, workspace, chief } = setup([async (context, b) => { await call(b, context, 'mission_block', { question: 'Posso corrigir o lint?' }) }])
    const routine = service.saveRoutine({ name: 'Revisão diária', instructions: 'Verifique build e testes.', workspaceId: workspace.id, trigger: { kind: 'daily', time: '09:00', weekdays: [] } })
    expect(routine).toMatchObject({ agentId: chief.id, enabled: true, maxTurns: 8 })
    expect(new Date(routine.nextRunAt!).getHours()).toBe(9)
    service.store.putRoutine({ ...routine, nextRunAt: new Date(Date.now() - 1000).toISOString() })
    service.missions.tickRoutines()
    const fired = service.store.routine(routine.id)
    expect(fired.lastMissionId).toBeTruthy()
    expect(fired.nextRunAt! > new Date().toISOString()).toBe(true)
    const mission = service.store.mission(fired.lastMissionId!)!
    expect(mission).toMatchObject({ routineId: routine.id, maxTurns: 8, conversationId: fired.conversationId })
    await vi.waitFor(() => expect(service.store.mission(mission.id)!.status).toBe('waiting'), { timeout: 10_000, interval: 100 })
    expect(() => service.runRoutine(routine.id)).toThrow(/em andamento/)
    await service.missionAction(mission.id, 'cancel')
    const second = service.runRoutine(routine.id)
    expect(second.conversationId).toBe(fired.conversationId)
  }, 20_000)

  it('o Chief cria rotina pela ferramenta respeitando o gatilho', async () => {
    const { service, workspace, chief, broker } = setup([])
    const conversation = service.saveConversation({ workspaceId: workspace.id, agentIds: [chief.id] })
    const context = { agent: chief, conversation, run: { id: 'r', parentId: null, conversationId: conversation.id, workspaceId: workspace.id, workspacePath: workspace.path, planMode: false, ancestry: [chief.id] }, message: { id: 'm' }, signal: new AbortController().signal }
    await expect(call(broker, context, 'routine_create', { name: 'Acompanhar projetos', instructions: 'Revise e corrija o que puder.', schedule: 'daily', time: '08:30', weekdays: [1, 2, 3, 4, 5] })).resolves.toContain('Dias úteis às 08:30')
    expect(service.store.routines()).toHaveLength(1)
    await expect(call(broker, context, 'routine_create', { name: 'x', instructions: 'y', schedule: 'interval', minutes: 1 })).rejects.toThrow(/15 minutos/)
  })
})
