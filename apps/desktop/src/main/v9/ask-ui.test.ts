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
describe('ask_ui: cartões interativos dos Boos', () => {
  const form = { id: 'f', kind: 'form', title: 'Acesso', fields: [{ id: 'user', label: 'Usuário', required: true }, { id: 'pass', label: 'Senha', secret: true }] }
  const pending = (service: AppService) => service.store.approvals().find(item => item.kind === 'question' && item.details.card)!

  it('publica a ferramenta e devolve ao agente o JSON da resposta', async () => {
    const { service, broker, context } = await setup()
    expect(broker.tools(context).map(tool => tool.name)).toContain('ask_ui')
    const task = broker.callTool(context, 'ask_ui', { card: { id: 'k', kind: 'confirm', title: 'Publicar?' } })
    expect(pending(service).status).toBe('pending')
    await service.answerCard(pending(service).id, { status: 'answered', values: { confirmed: true } })
    await expect(task).resolves.toBe(JSON.stringify({ status: 'answered', values: { confirmed: true } }))
    expect(pending(service).details.answer).toBe('Confirmado')
  })

  it('campo secreto vai só ao agente: o histórico guarda o resumo mascarado', async () => {
    const { service, broker, context } = await setup()
    const task = broker.callTool(context, 'ask_ui', { card: form })
    await service.answerCard(pending(service).id, { status: 'answered', values: { user: 'ana', pass: 'segredo123' } })
    await expect(task).resolves.toContain('segredo123')
    const stored = JSON.stringify(service.store.approvals())
    expect(stored).not.toContain('segredo123')
    expect(pending(service).details.answer).toBe('Usuário: ana; Senha: ••••')
  })

  it('recusa cartão inválido, resposta inválida e segunda resposta', async () => {
    const { service, broker, context } = await setup()
    await expect(broker.callTool(context, 'ask_ui', { card: { id: 'x', kind: 'choice', title: 'Quais?', options: [] } })).rejects.toThrow(/Cartão inválido/)
    await expect(broker.callTool(context, 'ask_ui', {})).rejects.toThrow(/Cartão ausente/)
    const task = broker.callTool(context, 'ask_ui', { card: form })
    const id = pending(service).id
    await expect(service.answerCard(id, { status: 'answered', values: { pass: 'x' } })).rejects.toThrow(/Usuário/)
    expect(pending(service).status).toBe('pending')
    await service.answerCard(id, { status: 'dismissed' })
    await expect(task).resolves.toBe(JSON.stringify({ status: 'dismissed' }))
    await expect(service.answerCard(id, { status: 'dismissed' })).rejects.toThrow(/não está pendente/)
  })

  it('expira pelo prazo e devolve status expired', async () => {
    const { service, broker, context } = await setup()
    const task = broker.callTool(context, 'ask_ui', { card: { id: 'e', kind: 'confirm', title: 'Ok?', expiresAt: new Date(Date.now() + 50).toISOString() } })
    await expect(task).resolves.toBe(JSON.stringify({ status: 'expired' }))
    expect(pending(service).status).toBe('denied')
    expect(pending(service).details.answer).toBe('Expirado')
  })

  it('interrupção do turno fecha o cartão pendente', async () => {
    const { service, broker, context, abortController } = await setup()
    const task = broker.callTool(context, 'ask_ui', { card: { id: 'a', kind: 'confirm', title: 'Ok?' } })
    abortController.abort()
    await expect(task).rejects.toThrow(/interrompido/)
    expect(pending(service).status).toBe('interrupted')
  })
})
