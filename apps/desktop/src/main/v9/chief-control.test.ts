// @vitest-environment node
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from './workspace'
import { projectFolderName } from './chief-control'
import type { Agent, Message, Mission, Run, StartMissionInput, WorkspaceEvent } from '../../shared/v9'

class FakeRuntime extends EventEmitter {
  async models() { return [] }
  async thread() { return { id: 'thread-test', history: 'empty' as const } }
  async request() { return { turn: { id: 'turn-test', status: 'inProgress' } } }
  respond() {}
  async interrupt() {}
  close() {}
}

type Broker = { callTool: (context: unknown, name: string, args: Record<string, unknown>, callId?: string) => Promise<string>; requestApproval: (...args: unknown[]) => Promise<boolean>; execute: (...args: unknown[]) => Promise<void> }
const broker = (service: AppService) => service as unknown as Broker

const roots: string[] = []
const services: AppService[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const service of services.splice(0)) service.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function setup(approvalMode: Agent['approvalMode'] = 'bypass') {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'boobot-chief-control-')))
  roots.push(root)
  const service = new AppService(join(root, 'profile'), new FakeRuntime() as unknown as ConstructorParameters<typeof AppService>[1])
  services.push(service)
  service.documentsDirectory = () => join(root, 'Documentos')
  const chief = service.saveAgent({ name: 'Atlas', alias: 'atlas', role: 'chief', instructions: 'Coordene.', approvalMode })
  const home = service.store.saveWorkspace({ name: 'Casa' })
  const conversation = service.saveConversation({ name: 'Atlas', workspaceId: home.id, agentIds: [chief.id] })
  const run: Run = { id: 'run-chief', rootId: 'run-chief', parentId: null, ancestry: [chief.id], conversationId: conversation.id, agentId: chief.id, status: 'running', threadId: null, turnId: null, messageId: 'reply', input: 'Pedido.', agent: chief, workspaceId: home.id, workspacePath: home.path, createdAt: new Date().toISOString() }
  const message: Message = { id: 'reply', conversationId: conversation.id, agentId: chief.id, author: chief.name, role: 'assistant', status: 'running', text: '', runId: run.id, createdAt: run.createdAt }
  service.store.putRun(run); service.store.putMessage(message)
  const context = { agent: chief, conversation, run, message, signal: new AbortController().signal }
  const call = (name: string, args: Record<string, unknown> = {}) => broker(service).callTool(context, name, args, `call-${name}`)
  const activities = () => service.store.history(conversation.id).filter(item => item.role === 'activity').map(item => item.text)
  return { root, service, chief, home, conversation, context, call, activities }
}

describe('Chief vê tudo (só leitura)', () => {
  it('lista projetos com sessões, time, execuções e rotinas, e lê o panorama e o histórico de outro projeto', async () => {
    const { service, call, home } = setup()
    const nina = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Frontend.' })
    const other = service.store.saveWorkspace({ name: 'Loja', defaultAgentIds: [nina.id] })
    const session = service.saveConversation({ name: 'Checkout', workspaceId: other.id, agentIds: [nina.id] })
    service.store.putMessage({ id: 'm1', conversationId: session.id, agentId: null, author: 'Você', role: 'user', status: 'completed', text: 'Corrija o checkout.', runId: null, createdAt: new Date().toISOString() })
    service.store.putRun({ id: 'run-nina', rootId: 'run-nina', parentId: null, ancestry: [nina.id], conversationId: session.id, agentId: nina.id, status: 'running', threadId: null, turnId: null, messageId: 'm1', input: 'Corrija o checkout.', agent: nina, workspaceId: other.id, workspacePath: other.path, createdAt: new Date().toISOString() })
    service.store.putApproval({ id: 'ap1', runId: 'run-nina', conversationId: session.id, agentId: nina.id, kind: 'write', details: { path: 'src/checkout.ts' }, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null })
    service.saveRoutine({ name: 'Revisão diária', instructions: 'Revise.', agentId: nina.id, workspaceId: other.id, trigger: { kind: 'daily', time: '09:00', weekdays: [] } })

    const list = JSON.parse(await call('project_list'))
    expect(list.projects.find((item: { id: string }) => item.id === other.id)).toMatchObject({ name: 'Loja', sessions: 1, team: ['Nina'], activeRuns: 1, routines: 1 })
    expect(list.projects.some((item: { id: string }) => item.id === home.id)).toBe(true)

    const overview = JSON.parse(await call('project_overview', { project_id: other.id }))
    expect(overview.sessions[0]).toMatchObject({ id: session.id, name: 'Checkout', agents: ['Nina'], lastMessage: 'Você: Corrija o checkout.' })
    expect(overview.working[0]).toMatchObject({ agent: 'Nina', status: 'running', task: 'Corrija o checkout.' })
    expect(overview.pendingApprovals[0]).toMatchObject({ id: 'ap1', kind: 'write', agent: 'Nina', action: 'src/checkout.ts' })
    expect(overview.routines[0]).toMatchObject({ name: 'Revisão diária', agent: 'Nina' })

    const history = JSON.parse(await call('session_history', { conversation_id: session.id, limit: 5 }))
    expect(history.messages).toEqual([expect.objectContaining({ author: 'Você', text: 'Corrija o checkout.' })])
    await expect(call('session_history', { conversation_id: session.id, limit: 500 })).rejects.toThrow(/limit/)
    expect(JSON.parse(await call('routine_list'))[0]).toMatchObject({ name: 'Revisão diária', workspaceId: other.id })
  })

  it('ferramentas de leitura valem no modo plano; ações não', async () => {
    const { context, service } = setup()
    const planning = { ...context, run: { ...context.run, planMode: true } }
    const callTool = broker(service).callTool.bind(service)
    expect(JSON.parse(await callTool(planning, 'project_list', {})).projects.length).toBeGreaterThan(0)
    await expect(callTool(planning, 'project_create', { name: 'X' })).rejects.toThrow(/Modo plano/)
  })
})

describe('tarefas do board pelo Chief', () => {
  it('exige aprovação antes de criar o cartão ou iniciar a missão; aprovação cria um cartão ligado à execução e ao revisor', async () => {
    const { service, call, conversation } = setup('bypass')
    vi.spyOn(service.missions, 'start').mockImplementation((input: StartMissionInput, missionId?: string) => {
      const conversation = service.store.conversation(input.conversationId!)
      const now = new Date().toISOString()
      const mission: Mission = { id: missionId || 'mission-test', title: input.title || 'Board test', goal: input.goal, workspaceId: conversation.workspaceId, conversationId: conversation.id, ownerAgentId: input.agentId!, routineId: null, model: null, status: 'active', steps: [], updates: [], question: null, options: [], result: null, turns: 0, maxTurns: 8, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: now, updatedAt: now, completedAt: null }
      service.store.putMission(mission)
      return mission
    })
    const worker = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Execute tarefas.' })
    const reviewer = service.saveAgent({ name: 'Bia', alias: 'bia', instructions: 'Revise tarefas.' })
    const team = service.saveBoardTeam({ name: 'Engenharia', agentIds: [worker.id, reviewer.id] })
    const resolveApproval = (approved: boolean) => {
      const handler = (event: WorkspaceEvent) => {
      if (event.type === 'approval' && event.approval.status === 'pending') void service.respondApproval(event.approval.id, approved)
      }
      service.on('workspace-event', handler)
      return () => service.off('workspace-event', handler)
    }
    const input = { title: 'Validar login', description: 'Verifique o fluxo de autenticação.', acceptance_criteria: 'Login inválido retorna 401.', kind: 'general', team_id: team.id, assignee: worker.id, reviewer: reviewer.id }
    const deniedListener = resolveApproval(false)
    await expect(call('board_task_create', input)).resolves.toContain('não aprovou')
    deniedListener(); expect(service.boardSnapshot().tasks).toHaveLength(0); expect(service.boardSnapshot().missions).toHaveLength(0)

    const approvedListener = resolveApproval(true)
    const created = JSON.parse(await call('board_task_create', input))
    approvedListener()
    expect(created).toMatchObject({ title: 'Validar login', status: 'doing', worker: 'Nina', reviewer: 'Bia' })
    const saved = service.boardSnapshot()
    expect(saved.tasks).toHaveLength(1)
    expect(saved.tasks[0]).toMatchObject({ id: created.taskId, source: 'chief', originConversationId: conversation.id, status: 'doing', assigneeAgentId: worker.id, reviewerAgentId: reviewer.id })
    expect(saved.missions.map(link => link.role)).toEqual(['worker'])

    const workerMission = service.store.mission(created.missionId)!
    const completedWorker: Mission = { ...workerMission, status: 'completed', result: 'Implementação pronta.' }
    service.store.putMission(completedWorker)
    await service.board.onMissionUpdated(completedWorker)
    const reviewerId = service.boardSnapshot().missions.find(link => link.taskId === created.taskId && link.role === 'reviewer')!.missionId
    const reviewerMission = service.store.mission(reviewerId)!
    const completedReview: Mission = { ...reviewerMission, status: 'completed', result: 'Critérios atendidos.' }
    service.store.putMission(completedReview)
    await service.board.onMissionUpdated(completedReview)
    service.board.approveReview(created.taskId)
    expect(service.store.history(conversation.id).some(item => item.role === 'activity' && item.text.includes('foi aprovada e concluída'))).toBe(true)
  })

  it('mantém a conversa do revisor somente para leitura, inclusive no broker', async () => {
    const { service, context, home } = setup()
    vi.spyOn(service.missions, 'start').mockImplementation((input: StartMissionInput, missionId?: string) => {
      const conversation = service.store.conversation(input.conversationId!)
      const now = new Date().toISOString()
      const mission: Mission = { id: missionId || 'mission-test', title: input.title || 'Board test', goal: input.goal, workspaceId: conversation.workspaceId, conversationId: conversation.id, ownerAgentId: input.agentId!, routineId: null, model: null, status: 'active', steps: [], updates: [], question: null, options: [], result: null, turns: 0, maxTurns: 8, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: now, updatedAt: now, completedAt: null }
      service.store.putMission(mission)
      return mission
    })
    const worker = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Execute tarefas.' })
    const reviewer = service.saveAgent({ name: 'Bia', alias: 'bia', instructions: 'Revise tarefas.' })
    const team = service.saveBoardTeam({ name: 'Engenharia', agentIds: [worker.id, reviewer.id] })
    const task = service.createBoardTask({ title: 'Validar login', description: 'Revise o código.', acceptanceCriteria: 'Login inválido retorna 401.', kind: 'general', teamId: team.id })
    await service.assignBoardTask(task.id, worker.id, reviewer.id)

    const workerLink = service.boardSnapshot().missions.find(link => link.taskId === task.id && link.role === 'worker')!
    const completed = { ...service.store.mission(workerLink.missionId)!, status: 'completed' as const, result: 'Implementação concluída.' }
    service.store.putMission(completed)
    await service.board.onMissionUpdated(completed)

    const reviewerLink = service.boardSnapshot().missions.find(link => link.taskId === task.id && link.role === 'reviewer')!
    const reviewerMission = service.store.mission(reviewerLink.missionId)!
    const reviewerConversation = service.store.conversation(reviewerMission.conversationId)
    const reviewerContext = { ...context, agent: reviewer, conversation: reviewerConversation, run: { ...context.run, workspaceId: reviewerMission.workspaceId, workspacePath: home.path, conversationId: reviewerConversation.id } }
    const app = service as unknown as { tools: (context: unknown) => { name: string }[] }
    const names = app.tools(reviewerContext).map(item => item.name)
    expect(names).toContain('workspace_read')
    expect(names).not.toEqual(expect.arrayContaining(['workspace_write', 'workspace_run_command', 'ask_agent', 'board_task_create']))
    await expect(broker(service).callTool(reviewerContext, 'workspace_write', { path: 'README.md', content: 'change' })).rejects.toThrow(/revisão do board é somente leitura/)
  })
})

describe('Chief age direto', () => {
  it('cria projeto em Documentos\\Boobot\\<nome> e com pasta existente, sem confirmação e com registro', async () => {
    const { root, service, call, activities } = setup()
    const approval = vi.spyOn(broker(service), 'requestApproval')
    const created = JSON.parse(await call('project_create', { name: 'Loja: nova?' }))
    expect(created.path).toBe(join(root, 'Documentos', 'Boobot', 'Loja nova'))
    expect(existsSync(created.path)).toBe(true)
    const folder = join(root, 'meu-site'); mkdirSync(folder)
    const existing = JSON.parse(await call('project_create', { name: 'Site', path: folder }))
    expect(service.store.workspace(existing.id)).toMatchObject({ name: 'Site', path: folder, kind: 'local' })
    await expect(call('project_create', { name: 'Repetido', path: folder })).rejects.toThrow(/já usa essa pasta/)
    expect(approval).not.toHaveBeenCalled()
    expect(activities()).toEqual(expect.arrayContaining(['Sistema · Criou o projeto Loja: nova?', 'Sistema · Criou o projeto Site']))
  })

  it('recusa caminho relativo, inexistente ou que contém ou fica dentro dos dados do app', async () => {
    const { root, call } = setup()
    await expect(call('project_create', { name: 'A', path: 'relativo' })).rejects.toThrow(/absoluto/)
    await expect(call('project_create', { name: 'A', path: join(root, 'nao-existe') })).rejects.toThrow(/pasta existente/)
    await expect(call('project_create', { name: 'A', path: join(root, 'profile') })).rejects.toThrow(/dados do Boobot/)
    await expect(call('project_create', { name: 'A', path: root })).rejects.toThrow(/dados do Boobot/)
    await expect(call('project_create', { name: 'x'.repeat(101) })).rejects.toThrow(/inválido/)
    expect(projectFolderName('con')).toBe('con-projeto')
    expect(projectFolderName('  ...  ')).toBe('Projeto')
  })

  it('cria sessão em outro projeto e envia mensagem que dispara uma execução lá, sem encadear', async () => {
    const { service, call, conversation, context, activities } = setup()
    const nina = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Frontend.' })
    const other = service.store.saveWorkspace({ name: 'Loja' })
    const session = JSON.parse(await call('session_create', { project_id: other.id, name: 'Checkout', agents: ['@nina'] }))
    expect(service.store.conversation(session.id)).toMatchObject({ workspaceId: other.id, name: 'Checkout', agentIds: [nina.id], kind: 'direct' })
    const execute = vi.spyOn(broker(service), 'execute').mockImplementation(async () => undefined)
    expect(await call('session_send', { conversation_id: session.id, text: 'Corrija o checkout.' })).toContain('Mensagem enviada')
    await vi.waitFor(() => expect(execute).toHaveBeenCalled())
    const started = execute.mock.calls[0]![0] as { run: Run; agent: Agent }
    expect(started.run).toMatchObject({ conversationId: session.id, workspaceId: other.id })
    expect(started.agent.id).toBe(nina.id)
    const sent = service.store.history(session.id).find(item => item.role === 'user')!
    expect(sent.text).toBe('Atlas (Chief): Corrija o checkout.')
    await expect(call('session_send', { conversation_id: conversation.id, text: 'Oi' })).rejects.toThrow(/sessão atual/)
    // Uma execução iniciada por mensagem do Chief não encadeia novos envios.
    const chained = { ...context, run: { ...context.run, inputMessageId: sent.id } }
    await expect(broker(service).callTool(chained, 'session_send', { conversation_id: session.id, text: 'De novo' })).rejects.toThrow(/encadear/)
    expect(activities()).toEqual(expect.arrayContaining(['Sistema · Criou a sessão Checkout em Loja', 'Sistema · Enviou mensagem para a sessão Checkout']))
  })

  it('define o time do projeto e de uma sessão, renomeia e reorganiza o sidebar', async () => {
    const { service, call, home, conversation, chief } = setup()
    const nina = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Frontend.' })
    const leo = service.saveAgent({ name: 'Leo', alias: 'leo', instructions: 'Backend.' })
    const other = service.store.saveWorkspace({ name: 'Loja' })
    await call('team_set', { project_id: other.id, agents: ['nina', '@leo'] })
    expect(service.store.workspace(other.id).defaultAgentIds).toEqual([nina.id, leo.id])
    await call('team_set', { conversation_id: conversation.id, agents: ['nina'] })
    expect(service.store.conversation(conversation.id)).toMatchObject({ agentIds: [chief.id, nina.id], kind: 'group', leaderAgentId: chief.id })
    await expect(call('team_set', { project_id: other.id, conversation_id: conversation.id, agents: [] })).rejects.toThrow(/só um/)
    await expect(call('team_set', { project_id: other.id, agents: ['ninguém'] })).rejects.toThrow(/não encontrado/)
    await call('project_update', { project_id: other.id, name: 'Loja 2' })
    expect(service.store.workspace(other.id).name).toBe('Loja 2')
    await call('session_update', { conversation_id: conversation.id, name: 'Central' })
    expect(service.store.conversation(conversation.id).name).toBe('Central')
    await call('sidebar_update', { layout: { projectOrder: [other.id, home.id], groups: [{ name: 'Clientes', workspaceIds: [other.id] }] } })
    expect(service.sidebarLayout()).toMatchObject({ projectOrder: [other.id, home.id], groups: [{ name: 'Clientes', workspaceIds: [other.id] }] })
  })

  it('cria Boos direto, sem segundo Chief, e edita rotinas e missões de outros projetos', async () => {
    const { service, call, chief } = setup()
    const approval = vi.spyOn(broker(service), 'requestApproval')
    await call('agent_create', { purpose: 'task', agents: [{ name: 'Thoth', instructions: 'Pesquise.', model: 'gpt-5.5' }] })
    expect(service.store.agents().find(item => item.name === 'Thoth')).toMatchObject({ role: 'agent', model: 'gpt-5.5', temporary: true })
    await expect(call('agent_create', { agents: [{ name: 'Outro', instructions: 'X', role: 'chief' }] })).resolves.toContain('Outro')
    expect(service.store.agents().filter(item => item.role === 'chief').map(item => item.id)).toEqual([chief.id])
    const other = service.store.saveWorkspace({ name: 'Loja' })
    const created = await call('routine_create', { name: 'Ronda', instructions: 'Verifique.', schedule: 'interval', minutes: 30, project_id: other.id })
    expect(created).toContain('Ronda')
    const routine = service.store.routines().find(item => item.name === 'Ronda')!
    expect(routine).toMatchObject({ workspaceId: other.id, agentId: chief.id, trigger: { kind: 'interval', minutes: 30 } })
    await call('routine_update', { routine_id: routine.id, enabled: false, name: 'Ronda noturna' })
    expect(service.store.routine(routine.id)).toMatchObject({ enabled: false, name: 'Ronda noturna', trigger: { kind: 'interval', minutes: 30 } })
    vi.spyOn(broker(service), 'execute').mockImplementation(async () => undefined)
    const mission = JSON.parse(await call('mission_create', { goal: 'Lançar a loja.', project_id: other.id }))
    expect(service.store.mission(mission.id)).toMatchObject({ workspaceId: other.id, ownerAgentId: chief.id })
    await call('mission_control', { mission_id: mission.id, action: 'pause' })
    expect(service.store.mission(mission.id)?.status).toBe('paused')
    expect(approval).not.toHaveBeenCalled()
  })
})

describe('Chief pede confirmação no que não tem volta', () => {
  it('excluir e arquivar perguntam sempre (mesmo no Bypass) e nada muda quando o usuário nega', async () => {
    const { service, call, activities } = setup('bypass')
    const nina = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Frontend.' })
    const other = service.store.saveWorkspace({ name: 'Loja' })
    const session = service.saveConversation({ name: 'Checkout', workspaceId: other.id, agentIds: [nina.id] })
    const routine = service.saveRoutine({ name: 'Ronda', instructions: 'Verifique.', agentId: nina.id, workspaceId: other.id, trigger: { kind: 'interval', minutes: 30 } })
    service.saveTerminalAccess(false)
    const pending: string[] = []
    service.on('workspace-event', event => { if (event.type === 'approval' && event.approval.status === 'pending') { pending.push(event.approval.details.action || ''); void service.respondApproval(event.approval.id, false, true) } })
    expect(await call('project_delete', { project_id: other.id })).toMatch(/não confirmou/)
    expect(await call('project_archive', { project_id: other.id })).toMatch(/não confirmou/)
    expect(await call('session_delete', { conversation_id: session.id })).toMatch(/não confirmou/)
    expect(await call('agent_delete', { agent: 'nina' })).toMatch(/não confirmou/)
    expect(await call('routine_delete', { routine_id: routine.id })).toMatch(/não confirmou/)
    expect(await call('settings_update', { terminal_enabled: true })).toMatch(/não confirmou/)
    expect(pending).toEqual(['Excluir o projeto Loja', 'Arquivar o projeto Loja', 'Excluir a sessão Checkout', 'Excluir o Boo Nina', 'Excluir a rotina Ronda', 'Ligar o terminal dos agentes'])
    expect(service.store.workspace(other.id).archived).toBe(false)
    expect(service.store.conversation(session.id).name).toBe('Checkout')
    expect(service.store.agent(nina.id).name).toBe('Nina')
    expect(service.store.routine(routine.id).name).toBe('Ronda')
    expect(service.store.terminalEnabled()).toBe(false)
    expect(activities()).toContain('Sistema · Cancelado pelo usuário: Excluir o projeto Loja')
  })

  it('aprovado, executa; desligar acesso é direto; navegador real em todas as conversas só se responde no desktop', async () => {
    const { service, call } = setup('bypass')
    const other = service.store.saveWorkspace({ name: 'Loja' })
    service.saveTerminalAccess(false)
    const asked: { desktopOnly?: boolean; kind: string }[] = []
    service.on('workspace-event', event => { if (event.type === 'approval' && event.approval.status === 'pending') { asked.push({ kind: event.approval.kind, desktopOnly: event.approval.details.desktopOnly }); void service.respondApproval(event.approval.id, true) } })
    expect(await call('settings_update', { terminal_enabled: true, external_browser_always: true })).toContain('ligou o terminal')
    expect(service.store.terminalEnabled()).toBe(true)
    expect(service.store.externalBrowserAlways()).toBe(true)
    expect(asked).toEqual([{ kind: 'agent-change', desktopOnly: undefined }, { kind: 'agent-change', desktopOnly: true }])
    expect(await call('settings_update', { terminal_enabled: false })).toContain('desligou')
    expect(asked).toHaveLength(2)
    await expect(call('settings_update', { theme: 'dark' })).rejects.toThrow(/terminal_enabled/)
    await call('project_delete', { project_id: other.id })
    expect(service.store.workspaces().some(item => item.id === other.id)).toBe(false)
  })

  it('recusa apagar a própria sessão ou o próprio projeto e a si mesmo', async () => {
    const { call, home, conversation } = setup()
    await expect(call('session_delete', { conversation_id: conversation.id })).rejects.toThrow(/sessão atual/)
    await expect(call('project_delete', { project_id: home.id })).rejects.toThrow(/projeto da sessão atual/)
    await expect(call('agent_delete', { agent: '@atlas' })).rejects.toThrow(/não pode ser excluído/)
  })
})

describe('Boo comum continua como antes', () => {
  it('não recebe nem executa as ferramentas do Chief', async () => {
    const { service, context } = setup()
    const nina = service.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'Frontend.' })
    const workerContext = { ...context, agent: nina }
    await expect(broker(service).callTool(workerContext, 'project_list', {})).rejects.toThrow(/Somente o Chief/)
    await expect(broker(service).callTool(workerContext, 'project_create', { name: 'X' })).rejects.toThrow(/Somente o Chief/)
  })
})
