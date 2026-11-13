import type { ServiceInternals } from './service-internals'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { SCHEMA_VERSION, WorkspaceStore } from '../../../main/v9/store'
import { ASSISTANT_ID, type Agent } from '../../../shared/v9'

type Thread = { id: string; agent: Agent; directory: string; projectInstructions?: string; resumedFrom?: string }

class FakeRuntime extends EventEmitter {
  threads: Thread[] = []
  turns: Array<{ threadId: string; text: string }> = []
  threadHistory?: 'retained' | 'empty' | 'resume-pending'
  private current = { threadId: '', turnId: '' }
  private turnCounter = 0
  async thread(agent: Agent, directory: string, _tools: unknown, threadId?: string, projectInstructions?: string) {
    const id = threadId || `thread-${this.threads.length + 1}`
    this.threads.push({ id, agent, directory, projectInstructions, resumedFrom: threadId })
    this.current.threadId = id
    return { id, history: this.threadHistory || (threadId ? 'retained' as const : 'empty' as const) }
  }
  async request(_method: string, params: { threadId: string; input: Array<{ text: string }> }) {
    const threadId = params.threadId
    const turnId = `turn-${++this.turnCounter}`
    const text = params.input[0].text
    this.turns.push({ threadId, text })
    setTimeout(() => {
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resposta de ${threadId} para: ${text}` } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
    })
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  async send(threadId: string, input: string) { return this.request('turn/start', { threadId, input: [{ text: input }] }) }
  respond(_id?: number | string, _result?: unknown) {}
  async interrupt() {}
  async models() { return [] }
  close() {}
}

class ParallelWriteRuntime extends FakeRuntime {
  private requests = 0
  private releasePair!: () => void
  private readonly bothRequestsStarted = new Promise<void>(resolve => { this.releasePair = resolve })
  private readonly toolResults = new Map<string, (result: unknown) => void>()
  maxParallelWrites = 0
  private activeWrites = 0
  async request(_method: string, params: { threadId: string; input: Array<{ text: string }> }) {
    const turnId = `parallel-${++this.parallelTurnCounter}`
    const filename = params.input[0].text.split('Pedido atual:\n').at(-1) || params.input[0].text
    this.turns.push({ threadId: params.threadId, text: filename })
    this.requests++
    if (this.requests === 2) this.releasePair()
    setTimeout(() => void (async () => {
      await this.bothRequestsStarted
      this.activeWrites++
      this.maxParallelWrites = Math.max(this.maxParallelWrites, this.activeWrites)
      const toolCallId = `write-${turnId}`
      const result = new Promise(resolve => this.toolResults.set(toolCallId, resolve))
      this.emit('event', { id: toolCallId, method: 'item/tool/call', params: { threadId: params.threadId, turnId, tool: 'workspace_write', arguments: { path: `${filename}.txt`, content: filename } } })
      await result
      this.activeWrites--
      this.emit('event', { method: 'turn/completed', params: { threadId: params.threadId, turn: { id: turnId, status: 'completed' } } })
    })(), 0)
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  respond(id?: number | string, result?: unknown) { if (id === undefined) return; this.toolResults.get(String(id))?.(result); this.toolResults.delete(String(id)) }
  private parallelTurnCounter = 0
}

const dirs: string[] = []
const services: AppService[] = []
const tempDirectory = () => { const path = mkdtempSync(join(tmpdir(), 'politron-v9-workspaces-')); dirs.push(path); return path }
const open = (directory: string, runtime = new FakeRuntime()) => { const service = new AppService(directory, runtime); services.push(service); return { service, runtime } }
const close = (service: AppService) => { service.dispose(); services.splice(services.indexOf(service), 1) }
afterEach(() => {
  for (const service of services.splice(0)) { try { service.dispose() } catch { /* already closed */ } }
  for (const path of dirs.splice(0)) { try { rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) } catch { /* Windows may hold the file briefly */ } }
})

describe('Assistente padrão e conversas por workspace V9', () => {
  it('duas conversas escrevem em paralelo em worktrees diferentes sem cruzar arquivos', async () => {
    const { service, runtime } = open(tempDirectory(), new ParallelWriteRuntime())
    const sourcePath = tempDirectory()
    execFileSync('git', ['init', '-b', 'main'], { cwd: sourcePath, windowsHide: true })
    execFileSync('git', ['config', 'user.name', 'Politron Tests'], { cwd: sourcePath, windowsHide: true })
    execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: sourcePath, windowsHide: true })
    writeFileSync(join(sourcePath, 'README.md'), 'base\n')
    execFileSync('git', ['add', 'README.md'], { cwd: sourcePath, windowsHide: true })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: sourcePath, windowsHide: true })
    const source = await service.saveWorkspace({ name: 'Concorrência', path: sourcePath })
    const firstWorkspace = await service.createWorktree({ sourceWorkspaceId: source.id, branch: 'fase-2/primeira' })
    const secondWorkspace = await service.createWorktree({ sourceWorkspaceId: source.id, branch: 'fase-2/segunda' })
    const agent = service.saveAgent({ name: 'Escritora', alias: 'escritora', instructions: 'Escreva.', canWrite: true, approvalMode: 'automatic' })
    const first = service.store.saveConversation({ name: 'Primeira frente', kind: 'direct', workspaceId: firstWorkspace.id, agentIds: [agent.id] })
    const second = service.store.saveConversation({ name: 'Segunda frente', kind: 'direct', workspaceId: secondWorkspace.id, agentIds: [agent.id] })

    await Promise.all([service.send(first.id, 'primeira'), service.send(second.id, 'segunda')])

    expect((runtime as ParallelWriteRuntime).maxParallelWrites).toBe(2)
    expect(readFileSync(join(firstWorkspace.path, 'primeira.txt'), 'utf8')).toBe('primeira')
    expect(readFileSync(join(secondWorkspace.path, 'segunda.txt'), 'utf8')).toBe('segunda')
    expect(existsSync(join(firstWorkspace.path, 'segunda.txt'))).toBe(false)
    await expect(service.archiveWorkspace(firstWorkspace.id)).rejects.toThrow('preservando a pasta')
    await service.archiveWorkspace(firstWorkspace.id, true)
    expect(service.store.workspace(firstWorkspace.id).archived).toBe(true)
    expect(readFileSync(join(firstWorkspace.path, 'primeira.txt'), 'utf8')).toBe('primeira')
    rmSync(firstWorkspace.path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
    execFileSync('git', ['worktree', 'prune'], { cwd: sourcePath, windowsHide: true })
  }, 30000)

  it('resolve o terminal pelo workspace selecionado e recusa um workspace arquivado', async () => {
    const { service } = open(tempDirectory())
    const folder = tempDirectory()
    const conversation = service.saveConversation({ workspacePath: folder })
    expect(service.workspacePath(conversation.workspaceId)).toBe(folder)
    await service.archiveWorkspace(conversation.workspaceId)
    expect(() => service.workspacePath(conversation.workspaceId)).toThrow('arquivado')
  })

  it('persiste diffs idempotentes de escrita, erros, arquivos grandes/binários e autores distintos', async () => {
    const data = tempDirectory()
    const folder = tempDirectory()
    const { service } = open(data)
    const agentA = service.saveAgent({ name: 'Editora A', alias: 'editora-a', instructions: 'Escreve.', canWrite: true, approvalMode: 'automatic' })
    const agentB = service.saveAgent({ name: 'Editora B', alias: 'editora-b', instructions: 'Escreve.', canWrite: true, approvalMode: 'automatic' })
    const conversation = service.saveConversation({ name: 'Diffs', agentIds: [agentA.id], workspacePath: folder })
    const workspace = service.store.workspace(conversation.workspaceId)
    const context = (agent: Agent, runId: string, messageId: string) => ({ run: { id: runId, workspaceId: workspace.id, workspacePath: workspace.path }, message: { id: messageId }, conversation, agent })
    const write = (ctx: unknown, path: string, content: string, id: string) => (service as unknown as ServiceInternals).callTool(ctx, 'workspace_write', { path, content }, id)
    await write(context(agentA, 'run-a', 'msg-a'), 'notes.txt', 'linha um\nlinha dois', 'tool-create')
    await write(context(agentA, 'run-a', 'msg-a'), 'notes.txt', 'linha um\nlinha três', 'tool-edit')
    await write(context(agentA, 'run-a', 'msg-a'), 'notes.txt', 'linha um\nlinha três', 'tool-unchanged')
    await write(context(agentA, 'run-a', 'msg-a'), 'notes.txt', 'conteúdo repetido', 'tool-edit')
    writeFileSync(join(folder, 'folder-target'), '')
    mkdirSync(join(folder, 'directory-target'))
    await expect(write(context(agentA, 'run-a', 'msg-a'), 'directory-target', 'falha', 'tool-failed')).rejects.toThrow('arquivo comum')
    writeFileSync(join(folder, 'large.txt'), 'x'.repeat(250_000))
    await write(context(agentB, 'run-b', 'msg-b'), 'large.txt', 'pequeno', 'tool-large')
    writeFileSync(join(folder, 'binary.dat'), Buffer.from([0, 1, 2]))
    await write(context(agentB, 'run-b', 'msg-b'), 'binary.dat', 'texto', 'tool-binary')
    await expect(write(context(agentB, 'run-b', 'msg-b'), '../fora.txt', 'bloqueado', 'tool-outside')).rejects.toThrow('sai da pasta')

    const changes = service.store.fileChanges()
    expect(changes).toHaveLength(7)
    expect(changes.find(item => item.toolCallId === 'tool-create')).toMatchObject({ status: 'applied', additions: 2, deletions: 0, agentId: agentA.id })
    expect(changes.find(item => item.toolCallId === 'tool-edit')).toMatchObject({ status: 'applied', additions: 1, deletions: 1 })
    expect(changes.find(item => item.toolCallId === 'tool-unchanged')).toMatchObject({ status: 'unchanged' })
    expect(changes.filter(item => item.toolCallId === 'tool-edit')).toHaveLength(1)
    expect(changes.find(item => item.toolCallId === 'tool-failed')).toMatchObject({ status: 'failed' })
    expect(changes.find(item => item.toolCallId === 'tool-outside')).toMatchObject({ status: 'failed', path: '../fora.txt' })
    expect(changes.find(item => item.toolCallId === 'tool-large')).toMatchObject({ truncated: true, agentId: agentB.id })
    expect(changes.find(item => item.toolCallId === 'tool-binary')).toMatchObject({ binary: true, agentId: agentB.id })
    close(service)
    const reopened = open(data).service
    expect(reopened.store.fileChanges()).toHaveLength(7)
  })

  it('inicia e continua uma conversa do Assistente em um workspace sem bot nem grupo cadastrados', async () => {
    const { service, runtime } = open(tempDirectory())
    expect(service.snapshot().agents).toEqual([])
    const workspace = await service.saveWorkspace({ name: 'Site' })
    expect(workspace).toMatchObject({ name: 'Site', kind: 'free', defaultAgentIds: [] })
    const conversation = service.saveConversation({ workspaceId: workspace.id })
    expect(conversation).toMatchObject({ workspaceId: workspace.id, agentIds: [], kind: 'direct', name: 'Nova conversa', titleAuto: true })

    await service.send(conversation.id, 'Primeira pergunta')
    await service.send(conversation.id, 'Segunda pergunta')

    const history = service.history(conversation.id)
    expect(history.map(message => [message.role, message.status])).toEqual([['user', 'completed'], ['assistant', 'completed'], ['user', 'completed'], ['assistant', 'completed']])
    expect(history[1]).toMatchObject({ agentId: ASSISTANT_ID, author: 'Assistente' })
    expect(history[1].text).toContain('Primeira pergunta')
    expect(history[3].text).toContain('Segunda pergunta')
    expect(new Set(runtime.threads.map(thread => thread.agent.id))).toEqual(new Set([ASSISTANT_ID]))
    expect(runtime.threads[1].resumedFrom).toBe(runtime.threads[0].id)
    expect(service.snapshot().conversations[0].name).toBe('Primeira pergunta')
    expect(service.snapshot().agents).toEqual([])
    expect(service.store.runs().every(run => run.agentId === ASSISTANT_ID && run.status === 'completed')).toBe(true)
  })

  it('funciona também fora de workspaces nomeados, sem pasta, bot ou grupo', async () => {
    const { service } = open(tempDirectory())
    const conversation = service.saveConversation({})
    expect(conversation).toMatchObject({ agentIds: [], workspaceId: expect.any(String) })
    await service.send(conversation.id, 'Olá')
    expect(service.history(conversation.id)[1]).toMatchObject({ role: 'assistant', status: 'completed', agentId: ASSISTANT_ID })
  })

  it('mantém duas conversas do mesmo workspace com sessões e históricos independentes e as retoma', async () => {
    const { service, runtime } = open(tempDirectory())
    const workspace = await service.saveWorkspace({ name: 'App', instructions: 'Use sempre TypeScript.' })
    const first = service.saveConversation({ workspaceId: workspace.id, name: 'Planejamento' })
    const second = service.saveConversation({ workspaceId: workspace.id, name: 'Login' })

    await service.send(first.id, 'assunto-A-1')
    await service.send(second.id, 'assunto-B-1')
    await service.send(first.id, 'assunto-A-2')
    await service.send(second.id, 'assunto-B-2')

    const textsOf = (id: string) => service.history(id).filter(message => message.role === 'user').map(message => message.text)
    expect(textsOf(first.id)).toEqual(['assunto-A-1', 'assunto-A-2'])
    expect(textsOf(second.id)).toEqual(['assunto-B-1', 'assunto-B-2'])
    expect(service.history(first.id).some(message => message.text.includes('assunto-B'))).toBe(false)
    expect(service.history(second.id).some(message => message.text.includes('assunto-A'))).toBe(false)

    const sessionsOf = (needle: string) => new Set(runtime.turns.filter(turn => turn.text.includes(needle)).map(turn => turn.threadId))
    const [sessionA] = [...sessionsOf('assunto-A')]
    const [sessionB] = [...sessionsOf('assunto-B')]
    expect(sessionsOf('assunto-A').size).toBe(1)
    expect(sessionsOf('assunto-B').size).toBe(1)
    expect(sessionA).not.toBe(sessionB)
    expect(runtime.threads.every(thread => thread.projectInstructions === 'Use sempre TypeScript.')).toBe(true)
    expect(service.snapshot().conversations.filter(item => item.workspaceId === workspace.id).map(item => item.name).sort()).toEqual(['Login', 'Planejamento'])
  })

  it('reconstrói o contexto quando um runtime headless reinicia sem histórico, preservando o binding', async () => {
    const directory = tempDirectory()
    const first = open(directory)
    const workspace = await first.service.saveWorkspace({ name: 'Persistente' })
    const a = first.service.saveConversation({ workspaceId: workspace.id, name: 'A' })
    const b = first.service.saveConversation({ workspaceId: workspace.id, name: 'B' })
    await first.service.send(a.id, 'antes-A')
    await first.service.send(b.id, 'antes-B')
    const sessionA = first.runtime.turns.find(turn => turn.text.includes('antes-A'))!.threadId
    const sessionB = first.runtime.turns.find(turn => turn.text.includes('antes-B'))!.threadId
    close(first.service)

    const second = open(directory)
    second.runtime.threadHistory = 'empty'
    const snapshot = second.service.snapshot()
    expect(snapshot.workspaces.map(item => item.name)).toEqual(['Persistente'])
    expect(snapshot.conversations.map(item => [item.name, item.workspaceId])).toEqual([['A', workspace.id], ['B', workspace.id]])
    expect(second.service.history(a.id).map(message => message.text.includes('antes-A') || message.role === 'user')).toEqual([true, true])
    await second.service.send(a.id, 'depois-A')
    await second.service.send(b.id, 'depois-B')
    expect(second.runtime.turns.find(turn => turn.text.includes('depois-A'))!.threadId).toBe(sessionA)
    expect(second.runtime.turns.find(turn => turn.text.includes('depois-B'))!.threadId).toBe(sessionB)
    expect(second.runtime.turns.find(turn => turn.text.includes('depois-A'))!.text).toContain('antes-A')
    expect(second.service.history(a.id).filter(message => message.role === 'user').map(message => message.text)).toEqual(['antes-A', 'depois-A'])
  })

  it('herda pasta e equipe padrão do workspace sem alterar conversas existentes quando o workspace muda', async () => {
    const { service } = open(tempDirectory())
    const folder = tempDirectory()
    const agent = service.saveAgent({ name: 'Revisora', alias: 'revisora', instructions: 'Revise.' })
    const workspace = await service.saveWorkspace({ name: 'Equipe', path: folder, defaultAgentIds: [agent.id] })
    const inherited = service.saveConversation({ workspaceId: workspace.id })
    expect(inherited).toMatchObject({ agentIds: [agent.id], workspaceId: workspace.id, kind: 'direct' })
    const assistantOnly = service.saveConversation({ workspaceId: workspace.id, agentIds: [] })
    expect(assistantOnly.agentIds).toEqual([])
    await service.saveWorkspace({ id: workspace.id, defaultAgentIds: [] })
    expect(service.store.conversation(inherited.id).agentIds).toEqual([agent.id])
    expect(service.saveConversation({ workspaceId: workspace.id }).agentIds).toEqual([])
  })

  it('valida workspace e o Assistente reservado como participante', () => {
    const { service } = open(tempDirectory())
    expect(() => service.store.saveWorkspace({ name: '  ', path: tempDirectory() })).not.toThrow()
    expect(() => service.saveConversation({ workspaceId: 'inexistente' })).toThrow('Workspace não encontrado')
    expect(() => service.saveAgent({ name: 'Outro', alias: 'assistente', instructions: 'x' })).toThrow('menção')
    expect(() => service.saveConversation({ agentIds: [ASSISTANT_ID] })).toThrow()
  })

  it('guarda a cor do Assistente nas preferências dele, sem criar um Boo na equipe', () => {
    const { service } = open(tempDirectory())
    const before = service.store.snapshot()
    const saved = service.saveAssistantPreferences({ color: '#10b981' })
    expect(saved.color).toBe('#10b981')
    expect(service.store.agent(ASSISTANT_ID).color).toBe('#10b981')
    // Sem cadastro duplicado: a equipe continua com os mesmos Boos e o Assistente mantém o id reservado.
    expect(service.store.snapshot().agents.map(agent => agent.id)).toEqual(before.agents.map(agent => agent.id))
    expect(service.store.snapshot().agents.some(agent => agent.id === ASSISTANT_ID)).toBe(false)
    // Cor inválida não apaga a anterior.
    expect(service.saveAssistantPreferences({ color: 'verde' }).color).toBe('#10b981')
    // O caminho de Boo continua recusando o Assistente, com mensagem que aponta o lugar certo.
    expect(() => service.saveAgent({ id: ASSISTANT_ID, name: 'Assistente', instructions: 'x' })).toThrow('preferências próprias')
  })

  it('esconde modelos e guarda os modelos adicionados, com validação', () => {
    const { service } = open(tempDirectory())
    expect(service.modelPreferences()).toEqual({ disabled: [], custom: [] })
    const saved = service.saveModelPreferences({ disabled: ['codex:gpt-5'], custom: [{ provider: 'opencode', id: 'big-pickle', name: 'Big Pickle' }] })
    expect(saved).toEqual({ disabled: ['codex:gpt-5'], custom: [{ provider: 'opencode', id: 'big-pickle', name: 'Big Pickle' }] })
    // Persistiu: uma releitura do mesmo serviço devolve o que foi salvo.
    expect(service.modelPreferences()).toEqual(saved)
    // Atualizar só os ocultos preserva os adicionados.
    expect(service.saveModelPreferences({ disabled: [] })).toEqual({ disabled: [], custom: saved.custom })
    expect(() => service.saveModelPreferences({ disabled: ['sem-provedor'] })).toThrow('ocultos')
    expect(() => service.saveModelPreferences({ custom: [{ provider: 'antigravity' as never, id: 'x', name: 'x' }] })).toThrow('Modelo adicionado')
    expect(() => service.saveModelPreferences({ custom: [{ provider: 'codex', id: 'gpt-5', name: '' }] })).toThrow('Modelo adicionado')
  })

  it('renomear a conversa não troca a sessão; trocar a pasta cria nova sessão', async () => {
    const { service, runtime } = open(tempDirectory())
    const conversation = service.saveConversation({ name: 'Original' })
    await service.send(conversation.id, 'um')
    service.saveConversation({ id: conversation.id, name: 'Renomeada' })
    await service.send(conversation.id, 'dois')
    const [one, two] = runtime.turns.map(turn => turn.threadId)
    expect(two).toBe(one)
    service.saveConversation({ id: conversation.id, workspacePath: tempDirectory() })
    await service.send(conversation.id, 'três')
    expect(runtime.turns[2].threadId).not.toBe(one)
  })

  it('isola a sessão quando as instruções do workspace mudam e as conversas entre si', async () => {
    const { service, runtime } = open(tempDirectory())
    const workspace = await service.saveWorkspace({ name: 'Contexto', instructions: 'Contexto v1' })
    const first = service.saveConversation({ workspaceId: workspace.id })
    const second = service.saveConversation({ workspaceId: workspace.id })
    await service.send(first.id, 'conversa-1 antes')
    await service.send(second.id, 'conversa-2')
    await service.saveWorkspace({ id: workspace.id, instructions: 'Contexto v2' })
    await service.send(first.id, 'conversa-1 depois')

    const firstThreads = runtime.threads.filter(thread => thread.agent.id === ASSISTANT_ID)
    expect(firstThreads.map(thread => thread.projectInstructions)).toEqual(['Contexto v1', 'Contexto v1', 'Contexto v2'])
    expect(firstThreads[0].id).not.toBe(firstThreads[1].id)
    expect(firstThreads[2].id).not.toBe(firstThreads[0].id)
    expect(runtime.turns[0].threadId).toBe(firstThreads[0].id)
    expect(runtime.turns[1].threadId).toBe(firstThreads[1].id)
    expect(runtime.turns[2].threadId).toBe(firstThreads[2].id)
    expect(service.history(first.id).some(message => message.text.includes('conversa-2'))).toBe(false)
  })

  it('separa bindings quando o runtime ou as permissões efetivas mudam', async () => {
    const directory = tempDirectory()
    const runtime = new FakeRuntime()
    const service = new AppService(directory, runtime, runtime)
    services.push(service)
    const workspace = await service.saveWorkspace({ name: 'Contrato de ferramentas' })
    let agent = service.saveAgent({ name: 'Leitora', alias: 'leitora', instructions: 'Leia sem modificar.', canWrite: false })
    const conversation = service.saveConversation({ workspaceId: workspace.id, agentIds: [agent.id] })
    await service.send(conversation.id, 'Primeiro pedido')
    const firstThread = runtime.threads.at(-1)!.id

    await service.saveWorkspace({ id: workspace.id, permissions: {
      chiefCreateAgents: workspace.permissions?.chiefCreateAgents ?? true,
      chiefEditAgents: workspace.permissions?.chiefEditAgents ?? true,
      chiefManageTeam: workspace.permissions?.chiefManageTeam ?? true,
      chiefCreateSessions: workspace.permissions?.chiefCreateSessions ?? true,
      filesWrite: 'deny', computerUse: workspace.permissions?.computerUse ?? 'deny',
    } })
    await service.send(conversation.id, 'Após mudar a permissão')
    const permissionThread = runtime.threads.at(-1)!.id
    expect(permissionThread).not.toBe(firstThread)

    agent = service.saveAgent({ ...agent, runtime: 'claude' })
    await service.send(conversation.id, 'Após mudar o runtime')
    expect(runtime.threads.at(-1)!.id).not.toBe(permissionThread)
  })

  it('exclui conversa, agente e workspace em cascata de verdade', async () => {
    const { service } = open(tempDirectory())
    let sharing: { workspaceId: string; conversationId: string; agentId: string } | null = null
    const revoke = vi.fn(() => { sharing = null })
    service.setPlatformBrowser({ sharingState: () => sharing, revokeSharing: revoke } as never)
    const agent = service.saveAgent({ name: 'Descartável', alias: 'descartavel', instructions: 'x' })
    const workspace = await service.saveWorkspace({ name: 'Temporário', defaultAgentIds: [agent.id] })
    const conversation = service.saveConversation({ workspaceId: workspace.id, agentIds: [agent.id] })
    await service.send(conversation.id, 'oi')

    sharing = { workspaceId: workspace.id, conversationId: conversation.id, agentId: agent.id }
    await service.deleteConversation(conversation.id)
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(() => service.store.conversation(conversation.id)).toThrow('não encontrada')
    expect(service.store.fileChangesForWorkspace(workspace.id)).toEqual([])

    const other = service.saveConversation({ workspaceId: workspace.id, agentIds: [agent.id] })
    sharing = { workspaceId: workspace.id, conversationId: other.id, agentId: agent.id }
    await service.deleteAgent(agent.id)
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(() => service.store.agent(agent.id)).toThrow('não encontrado')
    expect(service.store.conversation(other.id).agentIds).toEqual([])
    expect(service.store.workspace(workspace.id).defaultAgentIds).toEqual([])

    sharing = { workspaceId: workspace.id, conversationId: other.id, agentId: agent.id }
    await service.deleteWorkspace(workspace.id)
    expect(revoke).toHaveBeenCalledTimes(3)
    expect(() => service.store.workspace(workspace.id)).toThrow('não encontrado')
    expect(() => service.store.conversation(other.id)).toThrow('não encontrada')
  })
})

describe('migração do SQLite V9', () => {
  it('migra esquema 3 para 5, cria backup e funde projetos e pastas existentes em workspaces nomeados', () => {
    const directory = tempDirectory()
    const projectPath = tempDirectory()
    const standalonePath = tempDirectory()
    const legacy = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    legacy.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','3');`)
    legacy.prepare('INSERT INTO v9_projects VALUES (?,?)').run('project-1', JSON.stringify({ id: 'project-1', name: 'Migração', directory: projectPath, instructions: '', defaultAgentIds: [], revision: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.prepare('INSERT INTO v9_conversations VALUES (?,?)').run('project-conv', JSON.stringify({ id: 'project-conv', projectId: 'project-1', kind: 'direct', name: 'Projeto', agentIds: [], directory: null, revision: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.prepare('INSERT INTO v9_conversations VALUES (?,?)').run('local-conv', JSON.stringify({ id: 'local-conv', projectId: null, kind: 'direct', name: 'Local', agentIds: [], directory: standalonePath, revision: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.prepare('INSERT INTO v9_runs VALUES (?,?)').run('run-1', JSON.stringify({ id: 'run-1', conversationId: 'project-conv', directory: projectPath, status: 'completed' }))
    legacy.close()

    const store = new WorkspaceStore(directory)
    const backups = readdirSync(directory).filter(name => name.startsWith('politron-v9.backup-schema3-'))
    expect(backups).toHaveLength(1)
    expect((store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe(String(SCHEMA_VERSION))
    expect(store.db.prepare("SELECT name FROM sqlite_master WHERE name='v9_projects'").get()).toBeUndefined()
    const projectConversation = store.conversation('project-conv')
    const localConversation = store.conversation('local-conv')
    const projectWorkspace = store.workspace(projectConversation.workspaceId)
    expect(projectWorkspace).toMatchObject({ name: 'Migração', path: projectPath, parentWorkspaceId: null })
    expect(store.workspace(localConversation.workspaceId)).toMatchObject({ kind: 'local', path: standalonePath })
    expect(store.runs()[0]).toMatchObject({ workspaceId: projectWorkspace.id, workspacePath: projectPath })
    store.close()
  })

  it('cria backup antes de subir do esquema 2 e preserva conversas e mensagens antigas', () => {
    const directory = tempDirectory()
    const legacy = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    legacy.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','2');`)
    const agent = { id: 'agent-1', name: 'Antigo', alias: 'antigo', description: '', instructions: 'x', runtime: 'codex', model: '', color: '#6366f1', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-01T00:00:00.000Z' }
    const conversation = { id: 'conv-1', kind: 'group', name: 'Grupo antigo', agentIds: ['agent-1'], directory: null, revision: 3, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }
    const message = { id: 'msg-1', conversationId: 'conv-1', agentId: null, author: 'Você', role: 'user', text: 'mensagem antiga', status: 'completed', runId: null, createdAt: '2026-10-01T00:00:00.000Z' }
    legacy.prepare('INSERT INTO v9_agents VALUES (?,?)').run(agent.id, JSON.stringify(agent))
    legacy.prepare('INSERT INTO v9_conversations VALUES (?,?)').run(conversation.id, JSON.stringify(conversation))
    legacy.prepare('INSERT INTO v9_messages VALUES (?,?,?)').run(message.id, message.conversationId, JSON.stringify(message))
    legacy.prepare('INSERT INTO v9_sessions VALUES (?,?)').run('conv-1:agent-1:r1:m:c3', 'thread-legado')
    legacy.close()

    const store = new WorkspaceStore(directory)
    const backups = readdirSync(directory).filter(name => name.startsWith('politron-v9.backup-schema2-'))
    expect(backups).toHaveLength(1)
    const backup = new DatabaseSync(join(directory, backups[0]), { readOnly: true })
    expect((backup.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe('2')
    expect(backup.prepare("SELECT name FROM sqlite_master WHERE name='v9_projects'").get()).toBeUndefined()
    expect((backup.prepare('SELECT COUNT(*) AS total FROM v9_messages').get() as { total: number }).total).toBe(1)
    backup.close()

    expect((store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe(String(SCHEMA_VERSION))
    expect(store.agents()).toHaveLength(1)
    expect(store.conversation('conv-1')).toMatchObject({ name: 'Grupo antigo', kind: 'group', agentIds: ['agent-1'], revision: 3, titleAuto: false })
    expect(store.history('conv-1')[0].text).toBe('mensagem antiga')
    expect(store.binding('conv-1:agent-1:r1:m:c3')).toBe('thread-legado')
    expect(store.workspace(store.conversation('conv-1').workspaceId).kind).toBe('free')
    store.close()

    new WorkspaceStore(directory).close()
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(1)
    expect(existsSync(join(directory, 'politron-v9.sqlite'))).toBe(true)
  })

  it('funde esquema 4 (projeto + workspace separados) em um único workspace nomeado', () => {
    const directory = tempDirectory()
    const workspacePath = tempDirectory()
    const legacy = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    legacy.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE v9_agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_workspaces (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_conversations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE v9_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE v9_sessions (key TEXT PRIMARY KEY, thread_id TEXT NOT NULL);
      CREATE TABLE v9_delegations (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, source_conversation_id TEXT NOT NULL, target_conversation_id TEXT NOT NULL, data TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','4');`)
    legacy.prepare('INSERT INTO v9_projects VALUES (?,?)').run('project-1', JSON.stringify({ id: 'project-1', name: 'Esquema 4', defaultWorkspaceId: 'workspace-1', instructions: 'Use TS', defaultAgentIds: [], revision: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.prepare('INSERT INTO v9_workspaces VALUES (?,?)').run('workspace-1', JSON.stringify({ id: 'workspace-1', projectId: 'project-1', kind: 'local', path: workspacePath, branch: 'main', baseBranch: null, changes: 0, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.prepare('INSERT INTO v9_conversations VALUES (?,?)').run('conv-1', JSON.stringify({ id: 'conv-1', projectId: 'project-1', kind: 'direct', name: 'Conversa', agentIds: [], workspaceId: 'workspace-1', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' }))
    legacy.close()

    const store = new WorkspaceStore(directory)
    expect((store.db.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe(String(SCHEMA_VERSION))
    expect(store.db.prepare("SELECT name FROM sqlite_master WHERE name='v9_projects'").get()).toBeUndefined()
    const workspace = store.workspace('workspace-1')
    expect(workspace).toMatchObject({ name: 'Esquema 4', instructions: 'Use TS', path: workspacePath, parentWorkspaceId: null })
    expect(store.conversation('conv-1').workspaceId).toBe('workspace-1')
    store.close()
  })

  it('não cria backup em instalação nova', () => {
    const directory = tempDirectory()
    new WorkspaceStore(directory).close()
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(0)
  })

  it('recusa esquema mais novo sem rebaixar nem alterar o banco', () => {
    const directory = tempDirectory()
    const future = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    future.exec(`CREATE TABLE v9_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO v9_meta VALUES ('schema','99');`)
    future.close()

    expect(() => new WorkspaceStore(directory)).toThrow('mais novo que o suportado')
    const reopened = new DatabaseSync(join(directory, 'politron-v9.sqlite'), { readOnly: true })
    expect((reopened.prepare("SELECT value FROM v9_meta WHERE key='schema'").get() as { value: string }).value).toBe('99')
    expect(readdirSync(directory).filter(name => name.includes('.backup-'))).toHaveLength(0)
    reopened.close()
  })
})

  it('configura o SQLite para esperar lock em vez de falhar na hora', () => {
    const directory = tempDirectory()
    const { service } = open(directory)
    // Duas conexões no mesmo arquivo (app + host / segunda instância): a espera evita o
    // "database is locked" que já derrubou escrita de mensagem no log real.
    const db = (service.store as unknown as { db: DatabaseSync }).db
    const row = db.prepare('PRAGMA busy_timeout').get() as { timeout?: number; busy_timeout?: number }
    expect(row.timeout ?? row.busy_timeout).toBe(5000)
    expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string }).journal_mode).toBe('wal')
  })

  it('Boo novo nasce em Automático, a menos que o pedido diga outra coisa', () => {
    const { service } = open(tempDirectory())
    const created = service.saveAgent({ name: 'Nova', alias: 'nova', instructions: 'Trabalhe.' })
    expect(created.approvalMode).toBe('automatic')
    // Pedido explícito continua valendo, e editar não troca o modo salvo.
    expect(service.saveAgent({ name: 'Cauta', alias: 'cauta', instructions: 'x', approvalMode: 'ask' }).approvalMode).toBe('ask')
    expect(service.saveAgent({ id: created.id, name: created.name, instructions: created.instructions }).approvalMode).toBe('automatic')
  })
