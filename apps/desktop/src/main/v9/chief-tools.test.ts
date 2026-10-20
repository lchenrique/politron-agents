import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from './workspace'
import type { Agent } from '../../shared/v9'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return 'thread-test' }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

const permissions = { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit' as const, computerUse: 'inherit' as const }
const services: AppService[] = []
const directories: string[] = []
afterEach(() => {
  for (const service of services.splice(0)) service.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function setup(runtime: Agent['runtime'] = 'codex') {
  const directory = mkdtempSync(join(tmpdir(), 'politron-chief-tools-'))
  directories.push(directory)
  const service = new AppService(directory, new FakeRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  const chief = service.saveAgent({ name: 'Chief', alias: 'chief', role: 'chief', instructions: 'Coordene a equipe.', runtime })
  const workspace = service.store.saveWorkspace({ name: 'Projeto' })
  const names = (agent: Agent = chief) => ((service as unknown as { tools: (context: unknown) => { name: string }[] }).tools({ agent, run: { workspaceId: workspace.id } })).map(tool => tool.name)
  const propose = (name: string, args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent: chief, run: { workspaceId: workspace.id, workspacePath: workspace.path } }, name, args)
  return { service, chief, workspace, names, propose }
}

describe('delegação no workspace correto', () => {
  it('mantém a pasta e o workspace da conversa original no Boo delegado', async () => {
    const { service, chief, workspace } = setup()
    const worker = service.saveAgent({ name: 'Revisor', alias: 'revisor', instructions: 'Revise código.' })
    const conversation = service.store.saveConversation({ name: 'Projeto', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    vi.spyOn(service as any, 'execute').mockImplementation(async (context: any) => {
      service.store.putRun({ ...context.run, status: 'completed' })
      service.store.putMessage({ ...context.message, status: 'completed', text: 'Revisão concluída.' })
    })
    const parent = { agent: chief, conversation, run: { id: 'run-original', rootId: 'run-original', ancestry: [], workspaceId: workspace.id, workspacePath: workspace.path } }
    const result = await (service as any).delegate(parent, worker, 'Revise o projeto.', 'run-original:revisor')
    expect(result).toBe('Revisão concluída.')
    const delegated = service.store.delegationByKey('run-original:revisor')!
    expect(service.store.conversation(delegated.targetConversationId).workspaceId).toBe(workspace.id)
    expect(service.store.runs().find(run => run.id === delegated.childRunId)).toMatchObject({ workspaceId: workspace.id, workspacePath: workspace.path })
  })
})

describe('troca segura de runtime pelo Chief', () => {
  it('permite trocar o Boo da equipe para Claude com aprovação, sem alterar permissões', async () => {
    const { service, chief, workspace, names } = setup()
    const worker = service.saveAgent({ name: 'Frontend', alias: 'front', instructions: 'Trabalhe no frontend.', runtime: 'codex', model: 'gpt-5' })
    service.store.saveWorkspace({ id: workspace.id, defaultAgentIds: [worker.id], permissions: { ...permissions, chiefEditAgents: true } })
    const conversation = service.store.saveConversation({ name: 'Chief', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    const context = { agent: chief, run: { workspaceId: workspace.id, workspacePath: workspace.path }, conversation }
    const call = (service as any).callTool.bind(service)
    const approval = vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    expect(names()).toContain('propose_agent_model')
    const result = await call(context, 'propose_agent_model', { agent: '@front', runtime: 'claude', model: 'claude-sonnet-4-6' })
    expect(result).toContain('claude')
    expect(approval).toHaveBeenCalledWith(context, 'agent-change', expect.any(Object), true)
    expect(service.store.agent(worker.id)).toMatchObject({ runtime: 'claude', model: 'claude-sonnet-4-6', canWrite: false, computerUse: false, name: 'Frontend' })
  })
  it('não altera modelo se a aprovação for negada', async () => {
    const { service, chief, workspace } = setup()
    const worker = service.saveAgent({ name: 'Frontend', alias: 'front', instructions: 'Trabalhe.' })
    service.store.saveWorkspace({ id: workspace.id, defaultAgentIds: [worker.id], permissions: { ...permissions, chiefEditAgents: true } })
    const conversation = service.store.saveConversation({ name: 'Chief', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    vi.spyOn(service as any, 'requestApproval').mockResolvedValue(false)
    const result = await (service as any).callTool({ agent: chief, run: { workspaceId: workspace.id, workspacePath: workspace.path }, conversation }, 'propose_agent_model', { agent: 'front', runtime: 'claude' })
    expect(result).toContain('não aprovada')
    expect(service.store.agent(worker.id).runtime).toBe('codex')
  })
})

describe('autoedição do Chief', () => {
  it('expõe ferramenta própria e exige aprovação para editar seu perfil, sem abrir permissões', async () => {
    const { service, chief, names, propose } = setup()
    expect(names()).toContain('propose_self_profile')
    const approval = vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    const result = await propose('propose_self_profile', { description: 'Líder estratégico', instructions: 'Coordene com clareza.', color: '#abcdef', pitsShape: 'drop', pitsAccessory: 'glasses' })
    expect(result).toContain('Perfil de')
    expect(approval).toHaveBeenCalledOnce()
    expect(approval.mock.calls[0][1]).toBe('agent-change')
    expect(approval.mock.calls[0][3]).toBe(true)
    expect(service.store.agent(chief.id)).toMatchObject({ role: 'chief', alias: 'chief', instructions: 'Coordene com clareza.', description: 'Líder estratégico', color: '#abcdef', pitsShape: 'drop', pitsAccessory: 'glasses', canWrite: false, computerUse: false })
  })
  it('mantém a identidade intacta quando o usuário nega e rejeita troca de motor', async () => {
    const { service, chief, propose } = setup()
    vi.spyOn(service as any, 'requestApproval').mockResolvedValue(false)
    expect(await propose('propose_self_profile', { name: 'Hórus' })).toMatch(/não aprovou/)
    expect(service.store.agent(chief.id).name).toBe('Chief')
    await expect(propose('propose_self_profile', { runtime: 'claude' })).rejects.toThrow(/sensível/)
    expect(service.store.agent(chief.id).runtime).toBe('codex')
  })
})

describe('permissões independentes do Chief', () => {
  it('exibe as ferramentas do Chief, mas nega criar agente sem permissão', async () => {
    const { service, workspace, names, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefManageTeam: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_team', 'propose_agent', 'propose_session']))
    await expect(propose('propose_agent', { operation: 'create', name: 'Teste', instructions: 'Trabalhe.' })).rejects.toThrow(/não pode criar agentes/)
    await expect(propose('propose_session', { name: 'Nova sessão', agents: [] })).rejects.toThrow(/não pode criar sessões/)
  })

  it('exibe proposta de sessão, mas aplica permissões na execução', async () => {
    const { service, workspace, names, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateSessions: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_team', 'propose_agent', 'propose_session']))
    await expect(propose('propose_team', { agents: [] })).rejects.toThrow(/não pode alterar a equipe/)
    await expect(propose('propose_agent', { operation: 'create', name: 'Teste', instructions: 'Trabalhe.' })).rejects.toThrow(/não pode criar agentes/)
  })

  it('não oferece ferramentas do Chief a agentes normais', () => {
    const { service, workspace, chief, names } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true } })
    expect(names()).toEqual(expect.arrayContaining(['propose_agent', 'propose_team', 'propose_session']))
    expect(names({ ...chief, role: 'agent' })).not.toEqual(expect.arrayContaining(['propose_agent', 'propose_team', 'propose_session']))
  })
})

describe('visibilidade de agentes pelo group_members', () => {
  it('Chief enxerga todo o catálogo, mesmo agentes de fora desta conversa e workspace', async () => {
    const { service, chief, propose } = setup()
    service.saveAgent({ name: 'Nina Frontend', alias: 'nina', instructions: 'Cuide do frontend.' })
    service.saveAgent({ name: 'Verati', alias: 'verati', instructions: 'Minecraft.' })
    const members = await propose('group_members', {}) as { alias: string }[]
    expect(members.map(member => member.alias)).toEqual(expect.arrayContaining(['@' + chief.alias, '@nina', '@verati']))
  })

  it('o Chief sabe quais Boos estão ocupados antes de propor temporários', async () => {
    const { service, workspace, propose } = setup()
    service.saveAgent({ name: 'Hermes', instructions: 'Integre sistemas.', description: 'Integrações e APIs' })
    service.saveAgent({ name: 'Argos', instructions: 'Faça testes.', description: 'Testes', temporary: true, temporaryStatus: 'working', temporaryWorkspaceId: workspace.id })
    const members = await propose('group_members', {}) as { name: string; description: string; availability: string; temporary: boolean }[]
    expect(members.find(item => item.name === 'Hermes')).toMatchObject({ description: 'Integrações e APIs', temporary: false, availability: 'available' })
    expect(members.find(item => item.name === 'Argos')).toMatchObject({ description: 'Testes', temporary: true, availability: 'busy' })
  })

  it('agente comum continua vendo só a conversa e a equipe padrão do workspace', async () => {
    const { service, workspace, chief, names } = setup()
    const nina = service.saveAgent({ name: 'Nina Frontend', alias: 'nina', instructions: 'Cuide do frontend.' })
    service.saveAgent({ name: 'Verati', alias: 'verati', instructions: 'Minecraft.' })
    const callAsAgent = (name: string, args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent: { ...chief, role: 'agent' }, run: { workspaceId: workspace.id, workspacePath: workspace.path }, conversation: { agentIds: [nina.id] } }, name, args)
    expect(names({ ...chief, role: 'agent' })).toContain('group_members')
    const members = await callAsAgent('group_members', {}) as { alias: string }[]
    expect(members.map(member => member.alias)).toEqual(['@nina'])
  })
})

describe('Boos temporários do Chief', () => {
  it('invalida aprovação pendente quando o motor falha, impedindo criação tardia', async () => {
    const { service, chief, workspace } = setup('antigravity')
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true } })
    const conversation = service.store.saveConversation({ name: 'Chief', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    const controller = new AbortController()
    const message = { id: 'timeout-message', conversationId: conversation.id, agentId: chief.id, author: chief.name, role: 'assistant' as const, text: '', status: 'running' as const, runId: 'timeout-run', createdAt: new Date().toISOString() }
    const run = { id: 'timeout-run', status: 'running', workspaceId: workspace.id, workspacePath: workspace.path, conversationId: conversation.id, agentId: chief.id, messageId: message.id }
    const context = { agent: chief, run, message, conversation, signal: controller.signal }
    service.store.putMessage(message)
    ;(service as any).active.set(run.id, controller)
    const pending = (service as any).callTool(context, 'propose_boos', { agents: [{ instructions: 'Revise interfaces.' }] })
    const approval = service.store.approvals().find(item => item.runId === run.id)!
    expect(approval.status).toBe('pending')
    await (service as any).finish(context, 'failed', 'O motor encerrou.')
    expect(service.store.approval(approval.id)?.status).toBe('interrupted')
    await expect(service.respondApproval(approval.id, true)).rejects.toThrow('não está mais pendente')
    expect(String(await pending)).toContain('negada')
    expect(service.store.agents().filter(item => item.role !== 'chief')).toHaveLength(0)
  })

  it.each(['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const)('propõe equipe com aprovação e preserva escopo em qualquer motor: %s', async runtime => {
    const { service, workspace, propose, names } = setup(runtime)
    expect(names()).toEqual(expect.arrayContaining(['group_members', 'propose_boos', 'propose_team', 'ask_agent']))
    const approval = vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    const reply = await propose('propose_boos', { agents: [
      { description: 'Arquitetura do projeto', instructions: 'Planeje a arquitetura.' },
      { description: 'Implementação frontend', instructions: 'Implemente o frontend.' },
      { name: 'Nox', description: 'Revisão de qualidade', instructions: 'Revise o código.', temporary: false },
    ] })
    expect(String(reply)).toContain('Atena')
    expect(String(reply)).toContain('Hefesto')
    expect(String(reply)).toContain('Nox')
    expect(approval).toHaveBeenCalledTimes(1)
    const created = service.store.agents().filter(item => item.name !== 'Chief')
    expect(created.map(item => item.name)).toEqual(expect.arrayContaining(['Atena', 'Hefesto', 'Nox']))
    expect(new Set(created.map(item => item.color)).size).toBe(3)
    expect(created.find(item => item.name === 'Atena')).toMatchObject({ temporary: false, canWrite: false, computerUse: false })
    expect(created.find(item => item.name === 'Atena')?.temporaryWorkspaceId).toBeUndefined()
    expect(created.find(item => item.name === 'Hefesto')?.temporary).toBe(false)
    expect(created.find(item => item.name === 'Nox')?.temporary).toBe(false)
    const members = await propose('group_members', {}) as { alias: string }[]
    expect(members.some(item => item.alias === '@atena')).toBe(true)
  })


  it('pedido de equipe mantém permanência, exceto membros explicitamente temporários', async () => {
    const { service, propose } = setup()
    const approval = vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    await propose('propose_boos', { purpose: 'team', agents: [
      { name: 'Nox', instructions: 'Coordene o produto.' },
      { name: 'Íris', instructions: 'Cuide de suporte.', temporary: true },
    ] })
    expect(service.store.agents().find(item => item.name === 'Nox')?.temporary).toBe(false)
    expect(service.store.agents().find(item => item.name === 'Íris')).toMatchObject({ temporary: true, temporaryStatus: 'available' })
    const proposal = JSON.parse((approval.mock.calls[0][2] as { proposal: string }).proposal)
    expect(proposal.purpose).toBe('team')
  })

  it('o Chief pode propor espontaneamente reforços temporários para uma lacuna numa tarefa', async () => {
    const { service, workspace, propose, names } = setup()
    const approval = vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    expect(names()).toContain('propose_boos')
    await propose('propose_boos', { purpose: 'task', agents: [
      { description: 'Testes e qualidade', instructions: 'Valide os testes.' },
      { description: 'Documentação técnica', instructions: 'Documente a API.' },
    ] })
    const extras = service.store.agents().filter(item => item.role !== 'chief')
    expect(extras).toHaveLength(2)
    expect(extras.every(item => item.temporary && item.temporaryStatus === 'available' && item.temporaryWorkspaceId === workspace.id)).toBe(true)
    expect(approval).toHaveBeenCalledTimes(1)
    const proposal = JSON.parse((approval.mock.calls[0][2] as { proposal: string }).proposal)
    expect(proposal.purpose).toBe('task')
  })

  it('rejeita finalidade inválida', async () => {
    const { propose } = setup()
    await expect(propose('propose_boos', { purpose: 'unknown', agents: [{ instructions: 'Pesquise' }] })).rejects.toThrow(/Finalidade inválida/)
  })

  it.each(['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const)('não cria Boos com proposta negada em qualquer motor: %s', async runtime => {
    const { service, propose } = setup(runtime)
    vi.spyOn(service as any, 'requestApproval').mockResolvedValue(false)
    const reply = await propose('propose_boos', { agents: [{ instructions: 'Pesquise.' }] })
    expect(String(reply)).toMatch(/negada/)
    expect(service.store.agents().filter(item => item.role !== 'chief')).toHaveLength(0)
  })

  it('aposenta Boo temporário após delegação sem apagar registro e histórico de identidade', async () => {
    const { service, chief, workspace, propose } = setup()
    vi.spyOn(service as any, 'requestApproval').mockResolvedValue(true)
    await propose('propose_boos', { purpose: 'task', agents: [{ name: 'Thoth', instructions: 'Pesquise.' }] })
    const boo = service.store.agents().find(item => item.name === 'Thoth')!
    const conversation = service.store.saveConversation({ name: 'Chief', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    vi.spyOn(service as any, 'delegate').mockResolvedValue('Pesquisa concluída.')
    const call = (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool.bind(service)
    const response = await call({
      agent: chief,
      run: { id: 'parent', rootId: 'parent', ancestry: [], workspaceId: workspace.id, workspacePath: workspace.path },
      conversation,
    }, 'ask_agent', { agent: boo.alias, task: 'Pesquise.' })
    expect(response).toBe('Pesquisa concluída.')
    expect(service.store.agent(boo.id)).toMatchObject({ temporary: true, temporaryStatus: 'retired' })
    expect(service.store.snapshot().agents.some(item => item.id === boo.id)).toBe(true)
    const members = await propose('group_members', {}) as { alias: string }[]
    expect(members.map(item => item.alias)).not.toContain('@thoth')
  })
})
