import { promises as fs, realpathSync } from 'node:fs'
import { basename, isAbsolute, join, relative } from 'node:path'
import { ASSISTANT_ID, type Agent, type Conversation, type Mission, type MissionAction, type Routine, type StartMissionInput, type Workspace } from '../../shared/v9'
import { describeTrigger, validateTrigger, ACTIVE_MISSION } from '../../shared/missions'
import { buildSelfProfileUpdate, SELF_PROFILE_FIELDS } from './boo-profile'
import { validProjectFolderName } from './git-workspaces'
import { canonicalDirectory, type WorkspaceStore } from './store'
import type { DynamicTool } from './codex'

/**
 * Controle total do Chief (Parte 3 da spec Chief 2.0): ver tudo, agir direto dentro do Boobot e pedir confirmação
 * (sempre, mesmo no Bypass) só no que apaga, arquiva ou amplia acesso externo.
 */
export const CHIEF_READ_TOOLS = new Set(['project_list', 'project_overview', 'session_history', 'mission_list', 'routine_list'])
const CHIEF_ACTION_TOOLS = ['project_create', 'project_update', 'session_create', 'session_update', 'session_send', 'team_set', 'agent_update', 'self_update',
  'routine_create', 'routine_update', 'mission_create', 'mission_control', 'sidebar_update']
const CHIEF_CONFIRM_TOOLS = ['project_archive', 'project_delete', 'session_delete', 'agent_delete', 'routine_delete', 'mission_cancel', 'settings_update']
export const CHIEF_TOOLS = new Set([...CHIEF_READ_TOOLS, ...CHIEF_ACTION_TOOLS, ...CHIEF_CONFIRM_TOOLS])

/** O que o AppService oferece ao Chief: os mesmos métodos que o usuário usa pela interface. */
export interface ChiefHost {
  store: WorkspaceStore
  documentsDirectory(): string
  saveWorkspace(input: Partial<Workspace> & { path?: string | null }): Promise<Workspace>
  archiveWorkspace(workspaceId: string, preserveDirtyWorktree?: boolean): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  saveConversation(input: Partial<Conversation>): Conversation
  deleteConversation(conversationId: string): Promise<void>
  saveAgent(input: Partial<Agent>): Agent
  deleteAgent(agentId: string): Promise<void>
  saveRoutine(input: Partial<Routine>): Routine
  deleteRoutine(routineId: string): void
  startMission(input: StartMissionInput): Mission
  missionAction(missionId: string, action: MissionAction, value?: string): Promise<Mission>
  saveSidebarLayout(input: unknown): unknown
  saveTerminalAccess(enabled: boolean): void
  saveExternalBrowserAlways(enabled: boolean): void
  /** Envia como mensagem da sessão e devolve o id da mensagem; não espera a resposta. */
  sendFromChief(conversationId: string, value: string, agentId?: string): Promise<string>
  /** Mensagens enviadas pelo Chief a outras sessões: uma execução iniciada por elas não encadeia novos envios. */
  chiefSentMessages: Set<string>
}

export interface ChiefCall {
  agent: Agent; conversationId: string; workspaceId: string; inputMessageId?: string
  /** requestApproval com alwaysAsk: pergunta mesmo no Bypass. */
  confirm: (action: string, task: string, desktopOnly?: boolean) => Promise<boolean>
  /** Linha de atividade na conversa do Chief. */
  record: (value: string) => void
}

const RUNTIMES = ['codex', 'claude', 'pi', 'opencode', 'antigravity'] as const
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const ACTIVE_RUN = ['queued', 'running', 'waiting']

const str = (value: unknown, max: number, label: string) => { if (typeof value !== 'string' || value.length > max) throw new Error(`${label} inválido.`); return value }
const optional = (value: unknown, max: number, label: string) => value === undefined ? undefined : str(value, max, label).trim()
const id = (value: unknown, label: string) => { const result = str(value, 100, label).trim(); if (!result) throw new Error(`${label} inválido.`); return result }
const clip = (value: unknown, max: number) => { const line = typeof value === 'string' ? value : ''; return line.length > max ? `${line.slice(0, max - 1)}…` : line }
const json = (value: unknown) => JSON.stringify(value)

function agentName(store: WorkspaceStore, agentId: string) { try { return store.agent(agentId).name } catch { return agentId } }
function findAgent(store: WorkspaceStore, value: unknown): Agent {
  const raw = str(value, 100, 'Boo').replace(/^@/, '').trim()
  const key = raw.toLocaleLowerCase('pt-BR')
  const agent = store.agents().find(item => item.temporaryStatus !== 'retired' && (item.id === raw || item.alias.toLocaleLowerCase('pt-BR') === key || item.name.toLocaleLowerCase('pt-BR') === key))
  if (!agent) throw new Error(`Boo não encontrado: ${raw}.`)
  return agent
}
function agentList(store: WorkspaceStore, value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error('Informe uma lista de até dez Boos.')
  return [...new Set(value.map(item => findAgent(store, item).id))]
}
function activeWorkspace(store: WorkspaceStore, value: unknown): Workspace {
  const workspace = store.workspace(id(value, 'Projeto'))
  if (workspace.archived) throw new Error('Este projeto está arquivado.')
  return workspace
}
const projectName = (workspace: Workspace) => workspace.name || basename(workspace.path)

/** Nome de pasta seguro no Windows a partir do nome do projeto. */
export function projectFolderName(name: string): string {
  let clean = [...name].filter(char => char.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)) clean = `${clean}-projeto`
  return validProjectFolderName(clean || 'Projeto')
}
const sameOrInside = (parent: string, child: string) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) }
/** A pasta do projeto não pode conter nem estar dentro dos dados do app (banco, credenciais). */
function assertOutsideAppData(directory: string, dataDirectory: string) {
  const data = realpathSync.native(dataDirectory)
  const [a, b] = process.platform === 'win32' ? [directory.toLowerCase(), data.toLowerCase()] : [directory, data]
  if (sameOrInside(b, a) || sameOrInside(a, b)) throw new Error('Essa pasta contém ou fica dentro dos dados do Boobot; escolha outra.')
}

function routineTrigger(args: Record<string, unknown>) {
  const schedule = String(args.schedule)
  return validateTrigger(schedule === 'daily' ? { kind: 'daily', time: args.time, weekdays: args.weekdays } : schedule === 'interval' ? { kind: 'interval', minutes: args.minutes } : { kind: 'event', event: schedule })
}

export function chiefToolDefinitions(tool: (name: string, description: string, properties: Record<string, unknown>, required: string[]) => DynamicTool, profileProperties: Record<string, unknown>, planning: boolean): DynamicTool[] {
  const projectId = { type: 'string', description: 'ID do projeto (de project_list).' }
  const sessionId = { type: 'string', description: 'ID da sessão (de project_overview).' }
  const agents = { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Nomes, @menções ou IDs dos Boos.' }
  const schedule = { schedule: { type: 'string', enum: ['daily', 'interval', 'app-start', 'project-changed'] }, time: { type: 'string', description: 'HH:MM para daily.' }, weekdays: { type: 'array', items: { type: 'number' }, description: '0=domingo até 6=sábado; vazio = todos.' }, minutes: { type: 'number', description: 'Para interval, mínimo 15.' } }
  const read = [
    tool('project_list', 'Lista todos os projetos ativos do Boobot: pasta, sessões, time padrão, execuções ativas, missões abertas e rotinas, mais a organização atual do sidebar. Só leitura.', {}, []),
    tool('project_overview', 'Panorama de um projeto: sessões com última atividade, quem está trabalhando em quê, aprovações pendentes, delegações ativas, missões e rotinas. Só leitura.', { project_id: projectId }, ['project_id']),
    tool('session_history', 'Lê as mensagens recentes de qualquer sessão de qualquer projeto. Só leitura.', { conversation_id: sessionId, limit: { type: 'number', description: 'Quantidade de mensagens (padrão 30, máximo 100).' } }, ['conversation_id']),
    tool('mission_list', 'Lista as missões de todos os projetos (ou de um projeto), com estado e sessão. Só leitura.', { project_id: projectId }, []),
    tool('routine_list', 'Lista as rotinas de todos os projetos, seus gatilhos e últimas execuções. Só leitura.', {}, []),
  ]
  if (planning) return read
  return [...read,
    tool('project_create', 'Cria um projeto. Com path (pasta existente, caminho absoluto indicado pelo usuário) usa essa pasta; sem path cria Documentos\\Boobot\\<nome>. Ação direta.', { name: { type: 'string' }, path: { type: 'string', description: 'Caminho absoluto de uma pasta existente (opcional).' } }, ['name']),
    tool('project_update', 'Renomeia um projeto ou troca as instruções do projeto. Ação direta.', { project_id: projectId, name: { type: 'string' }, instructions: { type: 'string' } }, ['project_id']),
    tool('session_create', 'Cria uma sessão em qualquer projeto. Sem agents, usa o time padrão do projeto (ou o Assistente). Ação direta.', { project_id: projectId, name: { type: 'string' }, agents }, ['project_id']),
    tool('session_update', 'Renomeia uma sessão. Ação direta.', { conversation_id: sessionId, name: { type: 'string' } }, ['conversation_id', 'name']),
    tool('session_send', 'Envia uma mensagem para outra sessão (de qualquer projeto) e inicia o trabalho lá, sem esperar a resposta; acompanhe com session_history. Não serve para a sessão atual. agent escolhe quem responde.', { conversation_id: sessionId, text: { type: 'string' }, agent: { type: 'string', description: 'Boo da sessão que deve responder (opcional).' } }, ['conversation_id', 'text']),
    tool('team_set', 'Define o time padrão de um projeto (project_id) ou os participantes de uma sessão (conversation_id). Informe só um dos dois. Ação direta.', { project_id: projectId, conversation_id: sessionId, agents }, ['agents']),
    tool('agent_update', 'Edita outro Boo: nome, menção, descrição, instruções, cor, motor, modelo e esforço. Não muda papel nem permissões. Para você mesmo, use self_update. Ação direta.', { agent: { type: 'string' }, name: { type: 'string' }, alias: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' }, color: { type: 'string', description: '#RRGGBB' }, runtime: { type: 'string', enum: [...RUNTIMES] }, model: { type: 'string', description: 'Identificador do modelo; vazio usa o padrão do motor.' }, effort: { type: 'string', enum: [...EFFORTS] } }, ['agent']),
    tool('self_update', 'Edita o seu próprio perfil: descrição, instruções, nome, aparência, motor, modelo e esforço. Não muda papel nem permissões. Vale nas próximas respostas. Ação direta.', { ...profileProperties, runtime: { type: 'string', enum: [...RUNTIMES] }, model: { type: 'string' }, effort: { type: 'string', enum: [...EFFORTS] } }, []),
    tool('routine_create', 'Cria uma rotina permanente em um projeto (padrão: o projeto atual): o Boobot dispara uma missão a cada execução, mesmo com o chat fechado. Use para acompanhamento recorrente, revisão diária, monitoramento ou reação a mudanças. Ação direta.', { name: { type: 'string' }, instructions: { type: 'string', description: 'O que verificar, o que pode corrigir sozinho e o que entregar no resumo.' }, ...schedule, project_id: projectId, agent: { type: 'string', description: 'Responsável; padrão é você.' }, max_turns: { type: 'number' } }, ['name', 'instructions', 'schedule']),
    tool('routine_update', 'Edita uma rotina: nome, instruções, gatilho, responsável, turnos ou ativa/desativa. Ação direta.', { routine_id: { type: 'string' }, name: { type: 'string' }, instructions: { type: 'string' }, ...schedule, agent: { type: 'string' }, enabled: { type: 'boolean' }, max_turns: { type: 'number' } }, ['routine_id']),
    tool('mission_create', 'Abre uma missão em uma sessão nova de qualquer projeto, com um responsável (padrão: você), e começa a executar. Ação direta.', { goal: { type: 'string' }, title: { type: 'string' }, project_id: projectId, agent: { type: 'string' }, max_turns: { type: 'number' } }, ['goal']),
    tool('mission_control', 'Pausa, retoma, responde ou estende uma missão de outra sessão. Cancelar é mission_cancel. Ação direta.', { mission_id: { type: 'string' }, action: { type: 'string', enum: ['pause', 'resume', 'reply', 'extend'] }, text: { type: 'string', description: 'Resposta, para reply.' } }, ['mission_id', 'action']),
    tool('sidebar_update', 'Muda a ordem e as pastas do sidebar. Envie só as chaves que mudam: projectOrder (IDs de projetos), groups ([{name, workspaceIds}]), sessionOrder ({projectId: [IDs de sessões]}), agentOrder (IDs de Boos). Ação direta.', { layout: { type: 'object' } }, ['layout']),
    tool('project_archive', 'Arquiva um projeto (a pasta no disco é mantida). Pede confirmação ao usuário.', { project_id: projectId }, ['project_id']),
    tool('project_delete', 'Exclui um projeto e todas as sessões e históricos dele no Boobot. Pede confirmação ao usuário.', { project_id: projectId }, ['project_id']),
    tool('session_delete', 'Exclui uma sessão e o histórico dela. Pede confirmação ao usuário.', { conversation_id: sessionId }, ['conversation_id']),
    tool('agent_delete', 'Exclui um Boo do catálogo. Pede confirmação ao usuário.', { agent: { type: 'string' } }, ['agent']),
    tool('routine_delete', 'Exclui uma rotina. Pede confirmação ao usuário.', { routine_id: { type: 'string' } }, ['routine_id']),
    tool('mission_cancel', 'Cancela uma missão de outra sessão. Pede confirmação ao usuário.', { mission_id: { type: 'string' } }, ['mission_id']),
    tool('settings_update', 'Liga ou desliga o terminal dos agentes e o uso do navegador real sem pedir a cada conversa. Desligar é direto; ligar amplia o acesso e pede confirmação ao usuário.', { terminal_enabled: { type: 'boolean' }, external_browser_always: { type: 'boolean' } }, []),
  ]
}

export async function runChiefTool(host: ChiefHost, call: ChiefCall, name: string, args: Record<string, unknown>): Promise<string> {
  const { store } = host
  if (call.agent.role !== 'chief') throw new Error('Somente o Chief tem esta ferramenta.')
  const confirmOrCancel = async (action: string, task: string, desktopOnly = false) => {
    if (await call.confirm(action, task, desktopOnly)) return true
    call.record(`Cancelado pelo usuário: ${action}`)
    return false
  }

  if (name === 'project_list') {
    const conversations = store.conversations(), runs = store.runs().filter(run => ACTIVE_RUN.includes(run.status))
    const missions = store.missions(200), routines = store.routines()
    return json({ projects: store.workspaces().filter(item => !item.archived).map(workspace => ({
      id: workspace.id, name: projectName(workspace), path: workspace.path, kind: workspace.kind, parentProjectId: workspace.parentWorkspaceId,
      sessions: conversations.filter(item => item.workspaceId === workspace.id && !item.archived).length,
      team: workspace.defaultAgentIds.map(agentId => agentName(store, agentId)),
      activeRuns: runs.filter(run => run.workspaceId === workspace.id).length,
      openMissions: missions.filter(mission => mission.workspaceId === workspace.id && ACTIVE_MISSION.includes(mission.status)).length,
      routines: routines.filter(routine => routine.workspaceId === workspace.id).length,
    })), sidebar: store.sidebarLayout() })
  }
  if (name === 'project_overview') {
    const workspace = store.workspace(id(args.project_id, 'Projeto'))
    const conversations = store.conversations().filter(item => item.workspaceId === workspace.id)
    const ids = new Set(conversations.map(item => item.id))
    return json({
      project: { id: workspace.id, name: projectName(workspace), path: workspace.path, archived: workspace.archived, team: workspace.defaultAgentIds.map(agentId => agentName(store, agentId)) },
      sessions: conversations.filter(item => !item.archived).map(conversation => {
        const last = store.historyPage(conversation.id, null, 1).messages[0]
        return { id: conversation.id, name: conversation.name, agents: conversation.agentIds.map(agentId => agentName(store, agentId)), lastActivity: last?.createdAt || conversation.createdAt, lastMessage: last ? `${last.author}: ${clip(last.text, 160)}` : '' }
      }),
      working: store.runs().filter(run => run.workspaceId === workspace.id && ACTIVE_RUN.includes(run.status)).map(run => ({ agent: run.agent.name, status: run.status, sessionId: run.conversationId, task: clip(run.input, 200) })),
      pendingApprovals: store.approvals().filter(item => item.status === 'pending' && ids.has(item.conversationId)).map(item => ({ id: item.id, kind: item.kind, agent: agentName(store, item.agentId), sessionId: item.conversationId, action: clip(item.details.action || item.details.command || item.details.path || item.details.question || '', 200) })),
      delegations: store.delegations().filter(item => ACTIVE_RUN.includes(item.status) && ids.has(item.sourceConversationId)).map(item => ({ id: item.id, from: agentName(store, item.requesterAgentId), to: agentName(store, item.recipientAgentId), status: item.status, task: clip(item.task, 200) })),
      missions: store.missions(200).filter(item => item.workspaceId === workspace.id).slice(0, 30).map(item => ({ id: item.id, title: item.title, status: item.status, sessionId: item.conversationId })),
      routines: store.routines().filter(item => item.workspaceId === workspace.id).map(item => ({ id: item.id, name: item.name, enabled: item.enabled, trigger: describeTrigger(item.trigger), agent: agentName(store, item.agentId) })),
    })
  }
  if (name === 'session_history') {
    const conversation = store.conversation(id(args.conversation_id, 'Sessão'))
    const limit = args.limit === undefined ? 30 : Number(args.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Use limit entre 1 e 100.')
    const page = store.historyPage(conversation.id, null, limit)
    return json({ session: { id: conversation.id, name: conversation.name, projectId: conversation.workspaceId }, hasMore: page.hasMore,
      messages: page.messages.map(message => ({ author: message.author, role: message.role, status: message.status, createdAt: message.createdAt, text: clip(message.text, 2000) })) })
  }
  if (name === 'mission_list') {
    const workspaceId = args.project_id === undefined ? undefined : id(args.project_id, 'Projeto')
    return json(store.missions(200).filter(item => !workspaceId || item.workspaceId === workspaceId).map(item => ({ id: item.id, title: item.title, status: item.status, projectId: item.workspaceId, sessionId: item.conversationId, owner: agentName(store, item.ownerAgentId), turns: item.turns, maxTurns: item.maxTurns })))
  }
  if (name === 'routine_list') return json(store.routines().map(routine => ({ id: routine.id, name: routine.name, enabled: routine.enabled, trigger: describeTrigger(routine.trigger), agentId: routine.agentId, agent: agentName(store, routine.agentId), workspaceId: routine.workspaceId, lastRunAt: routine.lastRunAt, nextRunAt: routine.nextRunAt })))

  if (name === 'project_create') {
    const projectTitle = str(args.name, 100, 'Nome do projeto').trim()
    if (!projectTitle) throw new Error('Informe o nome do projeto.')
    let directory: string
    if (args.path !== undefined && args.path !== '') {
      const raw = str(args.path, 1000, 'Caminho')
      if (!isAbsolute(raw)) throw new Error('Informe o caminho absoluto de uma pasta existente.')
      directory = canonicalDirectory(raw)!
    } else {
      const target = join(host.documentsDirectory(), 'Boobot', projectFolderName(projectTitle))
      await fs.mkdir(target, { recursive: true })
      directory = realpathSync.native(target)
    }
    assertOutsideAppData(directory, store.dataDirectory)
    const existing = store.workspaces().find(item => !item.archived && item.path === directory)
    if (existing) throw new Error(`O projeto ${projectName(existing)} já usa essa pasta (ID ${existing.id}).`)
    const workspace = await host.saveWorkspace({ name: projectTitle, path: directory })
    call.record(`Criou o projeto ${projectName(workspace)}`)
    return json({ id: workspace.id, name: projectName(workspace), path: workspace.path })
  }
  if (name === 'project_update') {
    const workspace = activeWorkspace(store, args.project_id)
    const nextName = optional(args.name, 100, 'Nome do projeto'), instructions = optional(args.instructions, 20000, 'Instruções')
    if (nextName === '') throw new Error('O nome do projeto não pode ficar vazio.')
    if (nextName === undefined && instructions === undefined) throw new Error('Informe name e/ou instructions.')
    const saved = await host.saveWorkspace({ id: workspace.id, ...(nextName !== undefined ? { name: nextName } : {}), ...(instructions !== undefined ? { instructions } : {}) })
    call.record(nextName !== undefined && nextName !== projectName(workspace) ? `Renomeou o projeto ${projectName(workspace)} para ${projectName(saved)}` : `Atualizou o projeto ${projectName(saved)}`)
    return `Projeto ${projectName(saved)} atualizado.`
  }
  if (name === 'session_create') {
    const workspace = activeWorkspace(store, args.project_id)
    if (!workspace.permissions?.chiefCreateSessions) throw new Error('O Chief não pode criar sessões neste projeto. Habilite "Chief pode propor novas sessões" nas permissões do projeto.')
    const sessionName = optional(args.name, 100, 'Nome da sessão')
    const agentIds = args.agents === undefined ? undefined : agentList(store, args.agents)
    const conversation = host.saveConversation({ workspaceId: workspace.id, ...(sessionName ? { name: sessionName } : {}), ...(agentIds ? { agentIds, kind: agentIds.length > 1 ? 'group' : 'direct' } : {}) })
    call.record(`Criou a sessão ${conversation.name} em ${projectName(workspace)}`)
    return json({ id: conversation.id, name: conversation.name, projectId: workspace.id, agents: conversation.agentIds.map(agentId => agentName(store, agentId)) })
  }
  if (name === 'session_update') {
    const conversation = store.conversation(id(args.conversation_id, 'Sessão'))
    const sessionName = str(args.name, 100, 'Nome da sessão').trim()
    if (!sessionName) throw new Error('Informe o novo nome da sessão.')
    const saved = host.saveConversation({ id: conversation.id, name: sessionName })
    call.record(`Renomeou a sessão ${conversation.name} para ${saved.name}`)
    return `Sessão renomeada para ${saved.name}.`
  }
  if (name === 'session_send') {
    const conversation = store.conversation(id(args.conversation_id, 'Sessão'))
    if (conversation.id === call.conversationId) throw new Error('Esta é a sessão atual; responda aqui mesmo em vez de enviar mensagem para ela.')
    if (call.inputMessageId && host.chiefSentMessages.has(call.inputMessageId)) throw new Error('Esta execução começou por uma mensagem enviada pelo Chief de outra sessão; responda aqui em vez de encadear novos envios.')
    const value = str(args.text, 20000, 'Mensagem').trim()
    if (!value) throw new Error('Informe a mensagem.')
    const recipient = args.agent === undefined ? undefined : findAgent(store, args.agent).id
    const messageId = await host.sendFromChief(conversation.id, `${call.agent.name} (Chief): ${value}`, recipient)
    host.chiefSentMessages.add(messageId)
    call.record(`Enviou mensagem para a sessão ${conversation.name}`)
    return `Mensagem enviada para ${conversation.name}. O trabalho começou lá; acompanhe com session_history (conversation_id ${conversation.id}).`
  }
  if (name === 'team_set') {
    if ((args.project_id === undefined) === (args.conversation_id === undefined)) throw new Error('Informe project_id ou conversation_id, só um dos dois.')
    let agentIds = agentList(store, args.agents)
    if (args.project_id !== undefined) {
      const workspace = activeWorkspace(store, args.project_id)
      if (!workspace.permissions?.chiefManageTeam) throw new Error('O Chief não pode alterar o time deste projeto. Habilite "Chief pode propor mudanças na equipe" nas permissões do projeto.')
      await host.saveWorkspace({ id: workspace.id, defaultAgentIds: agentIds })
      call.record(`Definiu o time de ${projectName(workspace)}: ${agentIds.map(agentId => agentName(store, agentId)).join(', ') || 'vazio'}`)
      return `Time padrão de ${projectName(workspace)} atualizado.`
    }
    const conversation = store.conversation(id(args.conversation_id, 'Sessão'))
    if (!store.workspace(conversation.workspaceId).permissions?.chiefManageTeam) throw new Error('O Chief não pode alterar o time deste projeto. Habilite "Chief pode propor mudanças na equipe" nas permissões do projeto.')
    // O Chief não sai da sessão em que está trabalhando.
    if (conversation.id === call.conversationId && !agentIds.includes(call.agent.id)) agentIds = [call.agent.id, ...agentIds].slice(0, 10)
    const group = agentIds.length > 1
    const saved = host.saveConversation({ id: conversation.id, agentIds, kind: group ? 'group' : 'direct', responseMode: group && conversation.kind === 'group' ? conversation.responseMode : 'leader',
      leaderAgentId: group ? (conversation.leaderAgentId && agentIds.includes(conversation.leaderAgentId) ? conversation.leaderAgentId : agentIds.includes(call.agent.id) ? call.agent.id : agentIds[0]) : null })
    call.record(`Definiu os participantes de ${saved.name}: ${saved.agentIds.map(agentId => agentName(store, agentId)).join(', ') || 'Assistente'}`)
    return `Participantes de ${saved.name} atualizados.`
  }
  if (name === 'agent_update') {
    if (!store.workspace(call.workspaceId).permissions?.chiefEditAgents) throw new Error('O Chief não pode editar Boos neste projeto. Habilite "Chief pode propor alterações de agentes" nas permissões do projeto.')
    const allowed = new Set(['agent', 'name', 'alias', 'description', 'instructions', 'color', 'runtime', 'model', 'effort'])
    const blocked = Object.keys(args).filter(key => !allowed.has(key))
    if (blocked.length) throw new Error(`Campos não editáveis pelo Chief: ${blocked.join(', ')}. Papel e permissões só pelo usuário.`)
    const target = findAgent(store, args.agent)
    if (target.id === call.agent.id) throw new Error('Para editar a si mesmo, use self_update.')
    if (target.id === ASSISTANT_ID) throw new Error('O Assistente padrão é configurado pelo usuário em Configurações.')
    const changes: Partial<Agent> = {}
    const nextName = optional(args.name, 80, 'Nome'), instructions = optional(args.instructions, 20000, 'Instruções')
    if (nextName === '' || instructions === '') throw new Error('Nome e instruções não podem ficar vazios.')
    if (nextName !== undefined) changes.name = nextName
    if (instructions !== undefined) changes.instructions = instructions
    if (args.alias !== undefined) changes.alias = str(args.alias, 80, 'Menção').replace(/^@/, '').trim()
    if (args.description !== undefined) changes.description = str(args.description, 500, 'Descrição').trim()
    if (args.color !== undefined) { const color = str(args.color, 7, 'Cor'); if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Use a cor no formato #RRGGBB.'); changes.color = color.toLowerCase() }
    Object.assign(changes, agentModelInput(args))
    if (!Object.keys(changes).length) throw new Error('Informe pelo menos um campo para alterar.')
    const saved = host.saveAgent({ ...store.agent(target.id), ...changes })
    call.record(`Atualizou o Boo ${saved.name} (${Object.keys(changes).join(', ')})`)
    return `Boo ${saved.name} atualizado.`
  }
  if (name === 'self_update') {
    if (call.agent.id === ASSISTANT_ID) throw new Error('O Assistente padrão não tem perfil cadastrado para autoedição.')
    const { runtime, model, effort, ...profile } = args
    const modelPart = agentModelInput({ runtime, model, effort })
    const current = store.agent(call.agent.id)
    const next = Object.keys(profile).length ? buildSelfProfileUpdate(current, profile) : current
    const changed = [...SELF_PROFILE_FIELDS.filter(key => next[key] !== current[key]), ...Object.keys(modelPart).filter(key => modelPart[key as keyof Agent] !== current[key as keyof Agent])]
    if (!changed.length) return 'Seu perfil já tem esses valores; nada mudou.'
    const saved = host.saveAgent({ ...next, ...modelPart })
    call.record(`Atualizou o próprio perfil (${changed.join(', ')})`)
    return `Perfil de ${saved.name} atualizado. Vale a partir das próximas respostas; papel e permissões não mudam.`
  }
  if (name === 'routine_create' || name === 'routine_update') {
    const previous = name === 'routine_update' ? store.routine(id(args.routine_id, 'Rotina')) : undefined
    const owner = args.agent === undefined ? (previous ? undefined : call.agent) : findAgent(store, args.agent)
    const workspace = name === 'routine_create' ? activeWorkspace(store, args.project_id ?? call.workspaceId) : undefined
    if (args.enabled !== undefined && typeof args.enabled !== 'boolean') throw new Error('enabled precisa ser verdadeiro ou falso.')
    const routine = host.saveRoutine({ ...(previous ? { id: previous.id } : {}), ...(workspace ? { workspaceId: workspace.id } : {}),
      ...(args.name !== undefined || !previous ? { name: str(args.name, 80, 'Nome da rotina').trim() } : {}),
      ...(args.instructions !== undefined || !previous ? { instructions: str(args.instructions, 8000, 'Instruções').trim() } : {}),
      ...(args.schedule !== undefined || !previous ? { trigger: routineTrigger(args) } : {}),
      ...(owner ? { agentId: owner.id } : {}), ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
      ...(typeof args.max_turns === 'number' ? { maxTurns: args.max_turns } : {}) })
    call.record(`${previous ? 'Atualizou' : 'Criou'} a rotina ${routine.name} (${describeTrigger(routine.trigger)})`)
    return `Rotina ${routine.name} ${previous ? 'atualizada' : 'criada'} (${describeTrigger(routine.trigger)}${routine.enabled ? '' : ', desativada'}${routine.nextRunAt ? `, próxima em ${new Date(routine.nextRunAt).toLocaleString('pt-BR')}` : ''}). Roda mesmo com o chat fechado enquanto o Boobot estiver aberto ou na bandeja.`
  }
  if (name === 'mission_create') {
    const workspace = activeWorkspace(store, args.project_id ?? call.workspaceId)
    const owner = args.agent === undefined ? call.agent : findAgent(store, args.agent)
    const mission = host.startMission({ goal: str(args.goal, 20000, 'Objetivo'), ...(args.title !== undefined ? { title: str(args.title, 120, 'Título') } : {}), workspaceId: workspace.id, agentId: owner.id, ...(typeof args.max_turns === 'number' ? { maxTurns: args.max_turns } : {}) })
    call.record(`Abriu a missão ${mission.title} em ${projectName(workspace)} com ${owner.name}`)
    return json({ id: mission.id, title: mission.title, sessionId: mission.conversationId, projectId: workspace.id })
  }
  if (name === 'mission_control' || name === 'mission_cancel') {
    const mission = store.mission(id(args.mission_id, 'Missão'))
    if (!mission) throw new Error('Missão não encontrada.')
    if (mission.conversationId === call.conversationId) throw new Error('Esta é a missão da sessão atual; use mission_update, mission_complete ou mission_block.')
    if (name === 'mission_cancel') {
      if (!await confirmOrCancel(`Cancelar a missão ${mission.title}`, 'A missão para e o trabalho em andamento na sessão dela é interrompido.')) return 'O usuário não confirmou; a missão continua.'
      await host.missionAction(mission.id, 'cancel')
      call.record(`Cancelou a missão ${mission.title}`)
      return `Missão ${mission.title} cancelada.`
    }
    const action = String(args.action)
    if (!['pause', 'resume', 'reply', 'extend'].includes(action)) throw new Error('Ação inválida: use pause, resume, reply ou extend.')
    const saved = await host.missionAction(mission.id, action as MissionAction, optional(args.text, 4000, 'Texto') || '')
    const verb = { pause: 'Pausou', resume: 'Retomou', reply: 'Respondeu', extend: 'Estendeu' }[action as 'pause']
    call.record(`${verb} a missão ${saved.title}`)
    return `${verb} a missão ${saved.title} (estado: ${saved.status}).`
  }
  if (name === 'sidebar_update') {
    if (!args.layout || typeof args.layout !== 'object' || Array.isArray(args.layout)) throw new Error('Envie layout como objeto.')
    host.saveSidebarLayout(args.layout)
    call.record('Reorganizou o sidebar')
    return 'Ordem do sidebar salva. Aparece quando o sidebar for aberto de novo (ao recarregar a janela ou o app).'
  }

  if (name === 'project_archive' || name === 'project_delete') {
    const workspace = store.workspace(id(args.project_id, 'Projeto'))
    if (workspace.id === call.workspaceId) throw new Error('Este é o projeto da sessão atual; o usuário pode fazer isso pela interface.')
    const sessions = store.conversations().filter(item => item.workspaceId === workspace.id).length
    if (name === 'project_archive') {
      if (workspace.archived) return 'O projeto já está arquivado.'
      if (!await confirmOrCancel(`Arquivar o projeto ${projectName(workspace)}`, `${sessions} sessões saem da lista. A pasta ${workspace.path} continua no disco.`)) return 'O usuário não confirmou; nada foi arquivado.'
      await host.archiveWorkspace(workspace.id, true)
      call.record(`Arquivou o projeto ${projectName(workspace)}`)
      return `Projeto ${projectName(workspace)} arquivado.`
    }
    if (!await confirmOrCancel(`Excluir o projeto ${projectName(workspace)}`, `Apaga do Boobot ${sessions} sessões e todo o histórico delas, sem volta.${workspace.kind === 'worktree' ? ` O worktree em ${workspace.path} também é removido.` : ` A pasta ${workspace.path} continua no disco.`}`)) return 'O usuário não confirmou; nada foi excluído.'
    await host.deleteWorkspace(workspace.id)
    call.record(`Excluiu o projeto ${projectName(workspace)}`)
    return `Projeto ${projectName(workspace)} excluído.`
  }
  if (name === 'session_delete') {
    const conversation = store.conversation(id(args.conversation_id, 'Sessão'))
    if (conversation.id === call.conversationId) throw new Error('Esta é a sessão atual; não é possível excluí-la daqui.')
    if (!await confirmOrCancel(`Excluir a sessão ${conversation.name}`, 'Apaga a sessão e todo o histórico dela, sem volta.')) return 'O usuário não confirmou; nada foi excluído.'
    await host.deleteConversation(conversation.id)
    call.record(`Excluiu a sessão ${conversation.name}`)
    return `Sessão ${conversation.name} excluída.`
  }
  if (name === 'agent_delete') {
    const target = findAgent(store, args.agent)
    if (target.id === call.agent.id || target.id === ASSISTANT_ID) throw new Error('Esse Boo não pode ser excluído pelo Chief.')
    if (!await confirmOrCancel(`Excluir o Boo ${target.name}`, 'Remove o Boo do catálogo, dos times e das sessões; o trabalho em andamento dele é interrompido.')) return 'O usuário não confirmou; nada foi excluído.'
    await host.deleteAgent(target.id)
    call.record(`Excluiu o Boo ${target.name}`)
    return `Boo ${target.name} excluído.`
  }
  if (name === 'routine_delete') {
    const routine = store.routine(id(args.routine_id, 'Rotina'))
    if (!await confirmOrCancel(`Excluir a rotina ${routine.name}`, `A rotina (${describeTrigger(routine.trigger)}) deixa de rodar, sem volta.`)) return 'O usuário não confirmou; nada foi excluído.'
    host.deleteRoutine(routine.id)
    call.record(`Excluiu a rotina ${routine.name}`)
    return `Rotina ${routine.name} excluída.`
  }
  if (name === 'settings_update') {
    const { terminal_enabled: terminal, external_browser_always: browser } = args
    if ([terminal, browser].some(value => value !== undefined && typeof value !== 'boolean') || Object.keys(args).some(key => !['terminal_enabled', 'external_browser_always'].includes(key))) throw new Error('Use só terminal_enabled e/ou external_browser_always, com verdadeiro ou falso.')
    if (terminal === undefined && browser === undefined) throw new Error('Informe terminal_enabled e/ou external_browser_always.')
    const done: string[] = []
    if (typeof terminal === 'boolean' && terminal !== store.terminalEnabled()) {
      if (terminal && !await confirmOrCancel('Ligar o terminal dos agentes', 'Os agentes com escrita passam a poder executar comandos no computador, nas pastas dos projetos, sem sandbox do sistema.')) return 'O usuário não confirmou; o terminal continua desligado.'
      host.saveTerminalAccess(terminal); done.push(terminal ? 'ligou o terminal' : 'desligou o terminal')
    }
    if (typeof browser === 'boolean' && browser !== store.externalBrowserAlways()) {
      // Mesmo cuidado da autorização do navegador real por conversa: só na janela deste computador.
      if (browser && !await confirmOrCancel('Permitir o navegador real em todas as conversas', 'Os agentes com navegador poderão usar seu Brave/Chrome logado (cookies e dados salvos) sem pedir a cada conversa.', true)) return 'O usuário não confirmou; o navegador real continua pedindo autorização por conversa.'
      host.saveExternalBrowserAlways(browser); done.push(browser ? 'liberou o navegador real em todas as conversas' : 'voltou a pedir o navegador real por conversa')
    }
    if (!done.length) return 'As configurações já estavam assim.'
    call.record(`Configurações: ${done.join('; ')}`)
    return `Configurações atualizadas: ${done.join('; ')}.`
  }
  throw new Error(`Ferramenta desconhecida: ${name}`)
}

export function agentModelInput(args: Record<string, unknown>): Partial<Agent> {
  const changes: Partial<Agent> = {}
  if (args.runtime !== undefined) { if (!RUNTIMES.includes(args.runtime as never)) throw new Error('Motor inválido.'); changes.runtime = args.runtime as Agent['runtime'] }
  if (args.model !== undefined) changes.model = str(args.model, 150, 'Modelo').trim()
  if (args.effort !== undefined) { if (!EFFORTS.includes(args.effort as never)) throw new Error('Esforço inválido.'); changes.effort = args.effort as Agent['effort'] }
  return changes
}
