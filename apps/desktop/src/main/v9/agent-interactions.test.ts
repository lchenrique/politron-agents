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
  const context = { run: { id: 'run-test', workspaceId: workspace.id, workspacePath: root, planMode },
    agent, conversation, signal: new AbortController().signal,
    message: { id: 'message-test', conversationId: conversation.id, text: '', status: 'running', role: 'assistant', author: agent.name, agentId: agent.id, runId: 'run-test', createdAt: '' } }
  const broker = service as unknown as {
    tools(context: unknown): { name: string }[]
    callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown>
  }
  return { service, broker, context }
}
describe('Ferramentas de pergunta, plano e autonomia', () => {
  it('apresenta perguntas mesmo no bypass, retorna a resposta escolhida e registra a decisão', async () => {
    const { service, broker, context } = await setup()
    const task = broker.callTool(context, 'ask_user', { question: 'Qual framework?', options: ['React', 'Vue'] })
    const question = service.store.approvals().find(item => item.kind === 'question')
    expect(question?.status).toBe('pending')
    expect(question?.details.options).toEqual(['React', 'Vue'])
    await service.answerQuestion(question!.id, 'React')
    await expect(task).resolves.toBe('Resposta do usuário: React')
    expect(service.store.approval(question!.id)?.details.answer).toBe('React')
    await expect(service.answerQuestion(question!.id, 'Vue')).rejects.toThrow(/não está pendente/)
  })
  it('em modo plano não publica ferramentas de escrita/terminal e recusa chamadas forçadas', async () => {
    const { broker, context, service } = await setup(true)
    const tools = broker.tools(context).map(tool => tool.name)
    expect(tools).toContain('propose_plan')
    expect(tools).toContain('ask_user')
    expect(tools).toContain('workspace_read')
    expect(tools).not.toContain('workspace_write')
    expect(tools).not.toContain('workspace_run_command')
    await expect(broker.callTool(context, 'workspace_write', { path: 'x', content: 'y' })).rejects.toThrow(/Modo plano/)
    await expect(broker.callTool(context, 'propose_plan', { title: 'Plano', steps: ['Revisar', 'Testar'] })).resolves.toContain('Plano apresentado')
    expect(service.store.approvals().find(item => item.kind === 'plan')?.details.planSteps).toEqual(['Revisar','Testar'])
  })
  it('usa apenas a view compartilhada e respeita a permissão atual do agente', async () => {
    const { service, broker, context } = await setup()
    const observe = vi.fn(async () => ({ text: 'página visível' }))
    service.setPlatformBrowser({ observeForAgent: observe, acquireForAgent: async () => undefined, sharingState: () => null, captureDocument: async () => 1, assertSharing: () => undefined, revokeSharing: () => undefined } as never)
    await expect(broker.callTool(context, 'browser_observe', {})).resolves.toEqual({ text: 'página visível' })
    expect(observe).toHaveBeenCalledWith({ workspaceId: context.conversation.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }, 1)
    service.saveAgent({ ...context.agent, computerUse: false })
    await expect(broker.callTool(context, 'browser_observe', {})).rejects.toThrow(/bloqueado/i)
    expect(observe).toHaveBeenCalledTimes(1)
  })
  const fakeBrowser = (over: Record<string, unknown> = {}) => ({
    observeForAgent: vi.fn(async () => ({ text: 'obs' })), openForAgent: vi.fn(async () => ({ text: 'aberto' })),
    acquireForAgent: vi.fn(async () => undefined), sharingState: () => null,
    captureDocument: async () => 1, assertSharing: () => undefined, revokeSharing: () => undefined, ...over,
  })
  it('browser_open sem compartilhamento prévio aprova, adquire com a URL e devolve a observação', async () => {
    const { service, broker, context } = await setup()
    const order: string[] = []
    const browser = fakeBrowser({ acquireForAgent: vi.fn(async () => { order.push('acquire') }) })
    service.setPlatformBrowser(browser as never)
    ;(service as unknown as { requestApproval: unknown }).requestApproval = async () => { order.push('approval'); return true }
    await expect(broker.callTool(context, 'browser_open', { url: 'https://example.com/' })).resolves.toEqual({ text: 'obs' })
    expect(browser.acquireForAgent).toHaveBeenCalledWith({ workspaceId: context.conversation.workspaceId, conversationId: context.conversation.id, agentId: context.agent.id }, 'https://example.com/')
    expect(order).toEqual(['approval', 'acquire'])
    expect(browser.openForAgent).not.toHaveBeenCalled()
  })
  it('browser_observe com navegador vazio orienta browser_open', async () => {
    const { service, broker, context } = await setup()
    service.setPlatformBrowser(fakeBrowser({ acquireForAgent: async () => { throw new Error('Nenhuma página aberta: use browser_open primeiro.') } }) as never)
    await expect(broker.callTool(context, 'browser_observe', {})).rejects.toThrow(/browser_open primeiro/)
  })
  it('navegador em uso por outro agente ativo rejeita; sem run ativo adquire', async () => {
    const { service, broker, context } = await setup()
    const other = { workspaceId: context.conversation.workspaceId, conversationId: context.conversation.id, agentId: 'outro-agente' }
    const browser = fakeBrowser({ sharingState: () => other })
    service.setPlatformBrowser(browser as never)
    await expect(broker.callTool(context, 'browser_observe', {})).resolves.toEqual({ text: 'obs' })
    const contexts = (service as unknown as { contexts: Map<string, unknown> }).contexts
    contexts.set('run-outro', { run: { status: 'running' }, conversation: context.conversation, agent: { id: 'outro-agente', name: 'Outro' }, signal: new AbortController().signal })
    await expect(broker.callTool(context, 'browser_observe', {})).rejects.toThrow(/navegador em uso por .* em /)
    contexts.delete('run-outro')
  })
  it('bypass oferece ferramentas habilitadas no agente e no workspace', async () => {
    const { broker, context } = await setup()
    expect(broker.tools(context).map(tool => tool.name)).toContain('workspace_write')
    expect(broker.tools(context).map(tool => tool.name)).toContain('browser_open')
  })
})
