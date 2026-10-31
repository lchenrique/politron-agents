import type { ServiceInternals, RunContext } from './test-support'
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
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
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
  const chief = service.saveAgent({ name: 'Chief', alias: 'chief', role: 'chief', instructions: 'Coordene a equipe.', runtime, canWrite: false })
  const workspace = service.store.saveWorkspace({ name: 'Projeto' })
  const conversation = service.store.saveConversation({ workspaceId: workspace.id, agentIds: [chief.id] })
  const names = (agent: Agent = chief) => ((service as unknown as { tools: (context: unknown) => { name: string }[] }).tools({ agent, run: { workspaceId: workspace.id } })).map(tool => tool.name)
  const propose = (name: string, args: Record<string, unknown>) => (service as unknown as { callTool: (context: unknown, name: string, args: Record<string, unknown>) => Promise<unknown> }).callTool({ agent: chief, run: { id: 'chief-run', ancestry: [chief.id], workspaceId: workspace.id, workspacePath: workspace.path }, conversation }, name, args)
  return { service, chief, workspace, conversation, names, propose }
}

function spyOnApproval(service: AppService) {
  const approvalService = service as unknown as {
    requestApproval: (context: unknown, kind: string, details: unknown, forceAsk?: boolean) => Promise<boolean>
  }
  return vi.spyOn(approvalService, 'requestApproval')
}

describe('delegação no workspace correto', () => {
  it('mantém a pasta e o workspace da conversa original no Boo delegado', async () => {
    const { service, chief, workspace } = setup()
    const worker = service.saveAgent({ name: 'Revisor', alias: 'revisor', instructions: 'Revise código.' })
    const conversation = service.store.saveConversation({ name: 'Projeto', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    vi.spyOn(service as unknown as ServiceInternals, 'execute').mockImplementation(async (context: RunContext) => {
      service.store.putRun({ ...context.run, status: 'completed' })
      service.store.putMessage({ ...context.message, status: 'completed', text: 'Revisão concluída.' })
    })
    const parent = { agent: chief, conversation, run: { id: 'run-original', rootId: 'run-original', ancestry: [], workspaceId: workspace.id, workspacePath: workspace.path } }
    const result = await (service as unknown as ServiceInternals).delegate(parent, worker, 'Revise o projeto.', 'run-original:revisor')
    expect(result).toBe('Revisão concluída.')
    const delegated = service.store.delegationByKey('run-original:revisor')!
    expect(service.store.conversation(delegated.targetConversationId).workspaceId).toBe(workspace.id)
    expect(service.store.runs().find(run => run.id === delegated.childRunId)).toMatchObject({ workspaceId: workspace.id, workspacePath: workspace.path })
  })
})

describe('edição direta de Boos pelo Chief', () => {
  it('troca motor e modelo de um Boo sem pedir aprovação e sem alterar permissões', async () => {
    const { service, workspace, names, propose, conversation } = setup()
    const worker = service.saveAgent({ name: 'Frontend', alias: 'front', instructions: 'Trabalhe no frontend.', runtime: 'codex', model: 'gpt-5', canWrite: false })
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefEditAgents: true } })
    const approval = spyOnApproval(service)
    expect(names()).toEqual(expect.arrayContaining(['agent_update', 'self_update']))
    expect(names()).not.toContain('propose_agent_model')
    expect(await propose('agent_update', { agent: '@front', runtime: 'claude', model: 'claude-sonnet-4-6', instructions: 'Cuide da interface.' })).toContain('atualizado')
    expect(approval).not.toHaveBeenCalled()
    expect(service.store.agent(worker.id)).toMatchObject({ runtime: 'claude', model: 'claude-sonnet-4-6', instructions: 'Cuide da interface.', canWrite: false, computerUse: false, role: 'agent', name: 'Frontend' })
    expect(service.store.history(conversation.id).some(message => message.role === 'activity' && message.text.startsWith('Sistema · Atualizou o Boo Frontend'))).toBe(true)
  })
  it('não promove Boo a Chief, não mexe em permissões nem edita a si mesmo por agent_update', async () => {
    const { service, workspace, propose } = setup()
    const worker = service.saveAgent({ name: 'Frontend', alias: 'front', instructions: 'Trabalhe.' })
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefEditAgents: true } })
    await expect(propose('agent_update', { agent: 'front', role: 'chief' })).rejects.toThrow(/não editáveis/)
    await expect(propose('agent_update', { agent: 'front', canWrite: true })).rejects.toThrow(/não editáveis/)
    await expect(propose('agent_update', { agent: '@chief', description: 'x' })).rejects.toThrow(/self_update/)
    expect(service.store.agent(worker.id).role).toBe('agent')
  })
  it('respeita a permissão do projeto para editar Boos', async () => {
    const { service, workspace, propose } = setup()
    service.saveAgent({ name: 'Frontend', alias: 'front', instructions: 'Trabalhe.' })
    service.store.saveWorkspace({ id: workspace.id, permissions })
    await expect(propose('agent_update', { agent: 'front', model: 'x' })).rejects.toThrow(/não pode editar Boos/)
  })
})

describe('autoedição do Chief', () => {
  it('self_update grava descrição, instruções, aparência e modelo direto, sem papel nem permissões', async () => {
    const { service, chief, names, propose } = setup()
    expect(names()).not.toContain('propose_self_profile')
    const approval = spyOnApproval(service)
    const result = await propose('self_update', { description: 'Líder estratégico', instructions: 'Coordene com clareza.', color: '#abcdef', pitsShape: 'drop', model: 'gpt-5.5', effort: 'high' })
    expect(result).toContain('Perfil de')
    expect(approval).not.toHaveBeenCalled()
    expect(service.store.agent(chief.id)).toMatchObject({ role: 'chief', alias: 'chief', instructions: 'Coordene com clareza.', description: 'Líder estratégico', color: '#abcdef', pitsShape: 'drop', model: 'gpt-5.5', effort: 'high', canWrite: false, computerUse: false })
  })
  it('recusa papel e permissões na autoedição', async () => {
    const { service, chief, propose } = setup()
    await expect(propose('self_update', { role: 'agent' })).rejects.toThrow(/sensível/)
    await expect(propose('self_update', { canWrite: true })).rejects.toThrow(/sensível/)
    await expect(propose('propose_self_profile', { name: 'Hórus' })).rejects.toThrow(/age direto/)
    expect(service.store.agent(chief.id)).toMatchObject({ role: 'chief', canWrite: false, name: 'Chief' })
  })
  it('Boo comum continua com propose_self_profile e aprovação', async () => {
    const { service, workspace, names } = setup()
    const worker = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Revise.' })
    expect(names(worker)).toContain('propose_self_profile')
    expect(names(worker)).not.toContain('self_update')
    const approval = spyOnApproval(service).mockResolvedValue(true)
    const conversation = service.store.saveConversation({ workspaceId: workspace.id, agentIds: [worker.id] })
    await (service as unknown as ServiceInternals).callTool({ agent: worker, run: { id: 'w', workspaceId: workspace.id, workspacePath: workspace.path }, conversation }, 'propose_self_profile', { description: 'Revisora' })
    expect(approval).toHaveBeenCalledOnce()
    expect(service.store.agent(worker.id).description).toBe('Revisora')
  })
})

describe('permissões independentes do Chief', () => {
  it('exibe as ferramentas diretas do Chief, mas nega criar Boo ou sessão sem permissão do projeto', async () => {
    const { service, workspace, names, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefManageTeam: true } })
    expect(names()).toEqual(expect.arrayContaining(['team_set', 'agent_create', 'session_create']))
    expect(names()).not.toContain('propose_team')
    await expect(propose('agent_create', { agents: [{ name: 'Teste', instructions: 'Trabalhe.' }] })).rejects.toThrow(/não pode criar agentes/)
    await expect(propose('session_create', { project_id: workspace.id, name: 'Nova sessão' })).rejects.toThrow(/não pode criar sessões/)
  })

  it('aplica a permissão de equipe ao team_set', async () => {
    const { service, workspace, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateSessions: true } })
    await expect(propose('team_set', { project_id: workspace.id, agents: [] })).rejects.toThrow(/não pode alterar o time/)
  })

  it('não oferece ferramentas do Chief a agentes normais', () => {
    const { service, workspace, chief, names } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true } })
    expect(names()).toEqual(expect.arrayContaining(['agent_create', 'team_set', 'session_create', 'project_list', 'project_delete']))
    const normal = names({ ...chief, role: 'agent' })
    for (const name of ['agent_create', 'team_set', 'session_create', 'project_list', 'project_create', 'project_delete', 'settings_update', 'self_update', 'routine_create']) expect(normal).not.toContain(name)
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

  it('aplica o mesmo canDelegate ao catálogo e à execução de ask_agent', async () => {
    const { service, chief, workspace } = setup()
    const worker = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Revise o projeto.' })
    const outsider = service.saveAgent({ name: 'Verati', alias: 'verati', instructions: 'Outra equipe.' })
    service.store.saveWorkspace({ id: workspace.id, defaultAgentIds: [worker.id] })
    service.store.putRun({ id: 'worker-busy', agentId: worker.id, status: 'running' } as unknown as import('../../shared/v9').Run)
    const conversation = service.store.saveConversation({ name: 'Chief', workspaceId: workspace.id, agentIds: [chief.id] })
    const context = { agent: chief, conversation, run: { id: 'run-chief', ancestry: [chief.id], workspaceId: workspace.id, workspacePath: workspace.path } }
    const call = (name: string, args: Record<string, unknown>) => (service as unknown as ServiceInternals).callTool(context, name, args, 'call-' + name)
    const members = await call('group_members', {}) as { alias: string; canDelegate: boolean; reason?: string }[]
    expect(members.find(item => item.alias === '@nina')).toMatchObject({ canDelegate: true, availability: 'busy' })
    expect(members.find(item => item.alias === '@verati')).toMatchObject({ canDelegate: true })

    const approval = vi.spyOn(service as unknown as ServiceInternals, 'requestApproval')
    const delegate = vi.spyOn(service as unknown as ServiceInternals, 'delegate').mockResolvedValue('Tarefa concluída.')
    await expect(call('ask_agent', { agent: worker.alias, task: 'Revisão curta.' })).resolves.toBe('Tarefa concluída.')
    await expect(call('ask_agent', { agent: outsider.alias, task: 'Outra revisão.' })).resolves.toBe('Tarefa concluída.')
    expect(approval).not.toHaveBeenCalled()
    expect(delegate).toHaveBeenCalledWith(expect.objectContaining({ agent: chief }), worker, 'Revisão curta.', expect.any(String), true, undefined)
    // Quem recebe entra no time da conversa, com o Chief como líder; o pedido sai mesmo sem confirmação.
    expect(service.store.conversation(conversation.id)).toMatchObject({ kind: 'group', agentIds: [chief.id, worker.id, outsider.id], leaderAgentId: chief.id })
  })
})

describe('Boos temporários do Chief', () => {
  it('não cria uma equipe parcialmente quando falta permissão para associá-la', async () => {
    const { service, workspace, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true, chiefManageTeam: false } })
    const approval = spyOnApproval(service).mockResolvedValue(true)

    await expect(propose('agent_create', { purpose: 'team', agents: [{ name: 'Nox', instructions: 'Revise a interface.' }] }))
      .rejects.toThrow(/Nenhum Boo foi criado.*Chief pode propor mudanças na equipe/)

    expect(approval).not.toHaveBeenCalled()
    expect(service.store.agents().filter(agent => agent.role !== 'chief')).toHaveLength(0)
    expect(service.store.workspace(workspace.id).defaultAgentIds).toEqual([])
  })

  it('permite um reforço temporário sem conceder gestão da equipe', async () => {
    const { service, workspace, propose } = setup()
    service.store.saveWorkspace({ id: workspace.id, permissions: { ...permissions, chiefCreateAgents: true, chiefManageTeam: false } })
    spyOnApproval(service).mockResolvedValue(true)

    await propose('agent_create', { purpose: 'task', agents: [{ name: 'Têmis', instructions: 'Valide os testes.' }] })

    expect(service.store.agents().find(agent => agent.name === 'Têmis')).toMatchObject({ temporary: true, temporaryStatus: 'available', temporaryWorkspaceId: workspace.id })
    expect(service.store.workspace(workspace.id).defaultAgentIds).toEqual([])
  })

  it.each(['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const)('cria equipe direto e preserva escopo em qualquer motor: %s', async runtime => {
    const { service, workspace, propose, names } = setup(runtime)
    expect(names()).toEqual(expect.arrayContaining(['group_members', 'agent_create', 'team_set', 'ask_agent']))
    const approval = vi.spyOn(service as unknown as ServiceInternals, 'requestApproval')
    const reply = await propose('agent_create', { agents: [
      { description: 'Arquitetura do projeto', instructions: 'Planeje a arquitetura.' },
      { description: 'Implementação frontend', instructions: 'Implemente o frontend.' },
      { name: 'Nox', description: 'Revisão de qualidade', instructions: 'Revise o código.', temporary: false },
    ] })
    expect(String(reply)).toContain('Atena')
    expect(String(reply)).toContain('Hefesto')
    expect(String(reply)).toContain('Nox')
    expect(approval).not.toHaveBeenCalled()
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
    await propose('agent_create', { purpose: 'team', agents: [
      { name: 'Nox', instructions: 'Coordene o produto.' },
      { name: 'Íris', instructions: 'Cuide de suporte.', temporary: true },
    ] })
    expect(service.store.agents().find(item => item.name === 'Nox')?.temporary).toBe(false)
    expect(service.store.agents().find(item => item.name === 'Íris')).toMatchObject({ temporary: true, temporaryStatus: 'available' })
  })

  it('o Chief pode criar espontaneamente reforços temporários para uma lacuna numa tarefa', async () => {
    const { service, workspace, propose, names } = setup()
    expect(names()).toContain('agent_create')
    await propose('agent_create', { purpose: 'task', agents: [
      { description: 'Testes e qualidade', instructions: 'Valide os testes.' },
      { description: 'Documentação técnica', instructions: 'Documente a API.' },
    ] })
    const extras = service.store.agents().filter(item => item.role !== 'chief')
    expect(extras).toHaveLength(2)
    expect(extras.every(item => item.temporary && item.temporaryStatus === 'available' && item.temporaryWorkspaceId === workspace.id)).toBe(true)
    expect(service.store.workspace(workspace.id).defaultAgentIds).toEqual([])
  })

  it('rejeita finalidade inválida', async () => {
    const { propose } = setup()
    await expect(propose('agent_create', { purpose: 'unknown', agents: [{ instructions: 'Pesquise' }] })).rejects.toThrow(/Finalidade inválida/)
  })

  it('aposenta Boo temporário após delegação sem apagar registro e histórico de identidade', async () => {
    const { service, chief, workspace, propose } = setup()
    vi.spyOn(service as unknown as ServiceInternals, 'requestApproval').mockResolvedValue(true)
    await propose('agent_create', { purpose: 'task', agents: [{ name: 'Thoth', instructions: 'Pesquise.' }] })
    const boo = service.store.agents().find(item => item.name === 'Thoth')!
    const conversation = service.store.saveConversation({ name: 'Chief', kind: 'direct', workspaceId: workspace.id, agentIds: [chief.id] })
    vi.spyOn(service as unknown as ServiceInternals, 'delegate').mockResolvedValue('Pesquisa concluída.')
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
