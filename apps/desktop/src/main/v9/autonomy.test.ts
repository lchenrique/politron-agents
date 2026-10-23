// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'
import { shouldAutoApprove } from './approval-policy'
import type { Agent, Message, Run } from '../../shared/v9'

const resources: { service: AppService; root: string }[] = []
afterEach(() => {
  for (const { service, root } of resources.splice(0)) { service.dispose(); rmSync(root, { recursive: true, force: true }) }
})
function setup(mode: Agent['approvalMode'] = 'bypass') {
  const root = mkdtempSync(join(tmpdir(), 'boobot-autonomy-'))
  const service = new AppService(join(root, 'profile')); resources.push({ service, root })
  const agent = service.saveAgent({ name: 'Atlas', role: 'chief', instructions: 'Coordene e conclua a tarefa.', canWrite: true, approvalMode: mode })
  const workspace = service.store.saveWorkspace({ name: 'Studio', path: root })
  const conversation = service.saveConversation({ name: 'LP', workspaceId: workspace.id, agentIds: [agent.id] })
  const run: Run = { id: 'run-chief', rootId: 'run-chief', parentId: null, ancestry: [agent.id], conversationId: conversation.id, agentId: agent.id, status: 'running', threadId: null, turnId: null, messageId: 'reply', input: 'Crie o time e implemente.', agent, workspaceId: workspace.id, workspacePath: root, createdAt: new Date().toISOString() }
  const message: Message = { id: 'reply', conversationId: conversation.id, agentId: agent.id, author: agent.name, role: 'assistant', status: 'running', text: '', runId: run.id, createdAt: run.createdAt }
  service.store.putRun(run); service.store.putMessage(message)
  const context = { agent, conversation, run, message, signal: new AbortController().signal }
  const broker = service as any
  return { root, service, workspace, context, broker }
}

describe('autonomia do Chief e acesso à pasta', () => {
  it('bypass cobre administração e delegação sem suprimir perguntas humanas', () => {
    for (const kind of ['command', 'write', 'browser', 'agent-change', 'delegation'] as const)
      expect(shouldAutoApprove('bypass', kind, true)).toBe(true)
    expect(shouldAutoApprove('bypass', 'question', true)).toBe(false)
    expect(shouldAutoApprove('bypass', 'plan', true)).toBe(false)
  })

  it('cria a equipe, inclui na conversa e delega escrita sem uma nova confirmação', async () => {
    const { service, workspace, context, broker, root } = setup()
    // Qualquer pedido indevido de confirmação deve falhar imediatamente, sem travar o teste.
    service.on('workspace-event', event => { if (event.type === 'approval' && event.approval.status === 'pending') void service.respondApproval(event.approval.id, false) })
    const reply = await broker.callTool(context, 'propose_boos', { purpose: 'team', agents: [{ name: 'Hermes', instructions: 'Implemente o frontend.' }] })
    const worker = service.store.agents().find(agent => agent.name === 'Hermes')!
    expect(reply).toContain('Hermes')
    expect(worker).toMatchObject({ canWrite: true, approvalMode: 'bypass', computerUse: false, temporary: false })
    expect(service.store.workspace(workspace.id).defaultAgentIds).toContain(worker.id)
    expect(service.store.conversation(context.conversation.id)).toMatchObject({ kind: 'group', agentIds: [context.agent.id, worker.id], leaderAgentId: context.agent.id, responseMode: 'leader' })
    vi.spyOn(broker, 'execute').mockImplementation(async (child: any) => {
      await broker.callTool(child, 'workspace_write', { path: 'index.html', content: '<h1>Criskelly</h1>' }, 'worker-write')
      service.store.putRun({ ...child.run, status: 'completed' })
      service.store.putMessage({ ...child.message, text: 'LP criada.', status: 'completed' })
    })
    await expect(broker.callTool(context, 'ask_agent', { agent: 'Hermes', task: 'Crie index.html.', mode: 'wait' }, 'delegate')).resolves.toContain('LP criada.')
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toContain('Criskelly')
    expect(service.store.delegations()).toHaveLength(1)
    expect(service.store.approvals()).toEqual([])
  })

  it('adiciona Boos existentes à conversa atual ao formar a equipe e mantém o Chief como líder', async () => {
    const { service, context, broker } = setup()
    const worker = service.saveAgent({ name: 'Brigid', instructions: 'Cuide do design.' })
    vi.spyOn(broker, 'requestApproval').mockResolvedValue(true)
    await broker.callTool(context, 'propose_team', { agents: [worker.alias] })
    expect(service.store.conversation(context.conversation.id)).toMatchObject({ agentIds: [context.agent.id, worker.id], kind: 'group', leaderAgentId: context.agent.id })
  })

  it('começa com escrita para agentes e Assistente, preservando uma negação explícita ao editar', () => {
    const { service } = setup()
    expect(service.store.agent('app-assistant').canWrite).toBe(true)
    const agent = service.saveAgent({ name: 'Novo', instructions: 'Implemente.' })
    expect(agent.canWrite).toBe(true)
    const reader = service.saveAgent({ name: 'Leitor', instructions: 'Revise.', canWrite: false })
    expect(service.saveAgent({ id: reader.id, name: reader.name, instructions: reader.instructions }).canWrite).toBe(false)
    expect(service.saveAgent({ id: agent.id, name: agent.name, instructions: agent.instructions }).canWrite).toBe(true)
  })

  it('não espera uma segunda autorização ao apresentar plano durante execução', async () => {
    const { context, broker } = setup()
    const reply = await broker.callTool(context, 'propose_plan', { title: 'Implementação', steps: ['Criar a página', 'Validar'] })
    expect(reply).toContain('Continue')
    expect(reply).not.toContain('Aguarde')
  })

  it('bypass respeita o bloqueio explícito do workspace e cancelamento', async () => {
    const { service, context, workspace, broker } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...workspace.permissions!, filesWrite: 'deny', chiefCreateAgents: false } })
    await expect(broker.callTool(context, 'workspace_write', { path: 'x', content: 'x' })).rejects.toThrow(/bloqueia/)
    await expect(broker.callTool(context, 'propose_boos', { agents: [{ instructions: 'Implemente.' }] })).rejects.toThrow(/não pode criar/)
    const aborted = { ...context, signal: AbortSignal.abort() }
    await expect(broker.requestApproval(aborted, 'command', { command: 'echo teste' }, true)).resolves.toBe(false)
  })

  it('reverte a criação inteira se o time ultrapassar o limite da conversa', async () => {
    const { service, context, broker, workspace } = setup()
    const workers = Array.from({ length: 9 }, (_, index) => service.saveAgent({ name: `Membro ${index}`, instructions: 'Revise.' }))
    context.conversation = service.saveConversation({ id: context.conversation.id, agentIds: [context.agent.id, ...workers.map(agent => agent.id)], kind: 'group' })
    await expect(broker.callTool(context, 'propose_boos', { agents: [{ name: 'Excedente', instructions: 'Implemente.' }] })).rejects.toThrow(/dez participantes/)
    expect(service.store.agents().some(agent => agent.name === 'Excedente')).toBe(false)
    expect(service.store.workspace(workspace.id).defaultAgentIds).toEqual([])
    expect(service.store.conversation(context.conversation.id).agentIds).toHaveLength(10)
  })
})
