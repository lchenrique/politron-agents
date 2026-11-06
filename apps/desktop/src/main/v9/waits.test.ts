// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({
  app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false },
}))
import { AppService } from './workspace'

const dirs: string[] = []
const services: AppService[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})
async function setup(planMode = false) {
  const root = mkdtempSync(join(tmpdir(), 'boobot-interaction-')); dirs.push(root)
  const service = new AppService(join(root, 'profile')); services.push(service)
  const agent = service.saveAgent({ name: 'QA Interactions', runtime: 'opencode',
    model: 'opencode/big-pickle', instructions: 'Atue como editor de testes.', canWrite: true, computerUse: true, approvalMode: 'bypass' })
  const workspace = await service.saveWorkspace({ name: 'QA', path: root,
    permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false,
      chiefCreateSessions: false, filesWrite: 'inherit', computerUse: 'inherit' } })
  const conversation = service.saveConversation({ name: 'QA', workspaceId: workspace.id, agentIds: [agent.id] })
  const abortController = new AbortController()
  const context = { run: { id: 'run-test', conversationId: conversation.id, agentId: agent.id, rootId: '', parentId: null,
    ancestry: [agent.id], status: 'running', threadId: null, turnId: null, messageId: 'message-test', input: 'Planeje',
    planMode, inputMessageId: undefined, agent, workspaceId: workspace.id, workspacePath: root, createdAt: new Date().toISOString() },
    agent, conversation, signal: abortController.signal,
    message: { id: 'message-test', conversationId: conversation.id, text: '', status: 'running', role: 'assistant', author: agent.name, agentId: agent.id, runId: 'run-test', createdAt: '' } }
  const broker = service as unknown as {
    tools(context: unknown): { name: string }[]
    callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown>
  }
  return { service, broker, context, abortController }
}
describe('esperas por evento (await_event)', () => {
  const daily = { kind: 'daily', time: '09:00', weekdays: [] } as never
  /** Impede que o run da missão rode de verdade (e termine depois do dispose). */
  const stubExecute = (service: AppService) => {
    const internals = service as unknown as { execute(context: { run: { id: string } }): Promise<void>; finish(context: unknown, status: string, text: string): Promise<void> }
    vi.spyOn(internals, 'execute').mockImplementation(async context => { await internals.finish(context, 'completed', 'ok') })
  }
  const routineOf = (service: AppService, agentId: string, workspaceId: string, name = 'Checar build') => service.saveRoutine({ name, instructions: 'Verifique o build.', agentId, workspaceId, trigger: daily })

  it('publica as ferramentas e exige ao menos uma rotina do Boo', async () => {
    const { broker, context } = await setup()
    expect(broker.tools(context).map(tool => tool.name)).toEqual(expect.arrayContaining(['await_event', 'list_waits', 'close_wait']))
    await expect(broker.callTool(context, 'await_event', { note: 'build' })).rejects.toThrow(/nenhuma rotina/)
  })

  it('registra, lista e fecha; fechar espera de outro Boo é recusado', async () => {
    const { service, broker, context } = await setup()
    routineOf(service, context.agent.id, context.run.workspaceId)
    const result = await broker.callTool(context, 'await_event', { note: 'deploy terminar' }) as string
    const [wait] = service.store.waits.open(context.agent.id)
    expect(result).toContain(wait.id)
    await expect(broker.callTool(context, 'list_waits', {})).resolves.toContain('deploy terminar')
    expect(() => service.store.waits.close(wait.id, 'outro-agente')).toThrow(/outro Boo/)
    await expect(broker.callTool(context, 'close_wait', { waitId: wait.id })).resolves.toBe('Espera fechada.')
    await expect(broker.callTool(context, 'list_waits', {})).resolves.toBe('Nenhuma espera aberta.')
    await expect(broker.callTool(context, 'close_wait', { waitId: wait.id })).rejects.toThrow(/já fechada/)
  })

  it('recusa acima do limite de 20 listando as abertas', async () => {
    const { service, broker, context } = await setup()
    routineOf(service, context.agent.id, context.run.workspaceId)
    for (let i = 0; i < 20; i++) await broker.callTool(context, 'await_event', { note: `espera ${i}` })
    await expect(broker.callTool(context, 'await_event', { note: 'a mais' })).rejects.toThrow(/limite 20[\s\S]*espera 0/)
  })

  it('a rotina acorda a espera e o pedido da missão traz o bloco; espera acordada não é pega de novo', async () => {
    const { service, broker, context } = await setup()
    const routine = routineOf(service, context.agent.id, context.run.workspaceId)
    await broker.callTool(context, 'await_event', { note: 'aguardar CI verde' })
    stubExecute(service)
    const mission = service.runRoutine(routine.id)
    expect(mission.goal).toContain('Esperas retomadas')
    expect(mission.goal).toContain('aguardar CI verde')
    const [wait] = service.store.waits.open(context.agent.id)
    expect(wait.wokenAt).not.toBeNull()
    expect(service.store.waits.wake(context.agent.id, routine.id, 'outro-run')).toEqual([])
  })

  it('espera de outra rotina não é acordada por esta', async () => {
    const { service, broker, context } = await setup()
    const a = routineOf(service, context.agent.id, context.run.workspaceId, 'A')
    const b = routineOf(service, context.agent.id, context.run.workspaceId, 'B')
    await broker.callTool(context, 'await_event', { note: 'só da B', routineId: b.id })
    stubExecute(service)
    expect(service.runRoutine(a.id).goal).not.toContain('Esperas retomadas')
    expect(service.store.waits.open(context.agent.id)[0].wokenAt).toBeNull()
  })

  it('await_event encerra a missão aberta da conversa', async () => {
    const { service, broker, context } = await setup()
    const routine = routineOf(service, context.agent.id, context.run.workspaceId)
    stubExecute(service)
    const mission = service.runRoutine(routine.id)
    const ctx = { ...context, conversation: { ...context.conversation, id: mission.conversationId } }
    await broker.callTool(ctx, 'await_event', { note: 'pausa' })
    expect(service.store.openMission(mission.conversationId)).toBeUndefined()
  })
})
