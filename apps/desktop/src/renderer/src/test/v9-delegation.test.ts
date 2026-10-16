import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { WorkspaceStore } from '../../../main/v9/store'
import type { Agent, Conversation, Delegation, Message, Run } from '../../../shared/v9'

class FakeRuntime extends EventEmitter {
  started = 0
  startedTurns = 0
  fail = false
  hold = false
  directories: string[] = []
  agents: Agent[] = []
  async thread(agent: Agent, directory: string) {
    this.agents.push(agent); this.directories.push(directory); this.started++
    return `thread-${this.started}`
  }
  async request(_method: string, params?: { threadId?: string }) {
    const threadId = params?.threadId || `thread-${this.started}`
    const turnId = `turn-${threadId.split('-').at(-1)}`
    this.startedTurns++
    if (!this.hold) setTimeout(() => {
      if (!this.fail) this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: 'Resultado do agente destinatário.' } })
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: this.fail ? 'failed' : 'completed', ...(this.fail ? { error: { message: 'Falha simulada do destinatário.' } } : {}) } } })
    })
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  async send(threadId: string, _input: string) { return this.request('turn/start', { threadId }) }
  complete(index: number) {
    const threadId = `thread-${index}`, turnId = `turn-${index}`
    this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resultado ${index}.` } })
    this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
  }
  respond() {}
  async interrupt() {}
  async models() { return [] }
  close() {}
}

const dirs: string[] = []
const services: AppService[] = []
function tempDirectory() { const path = mkdtempSync(join(tmpdir(), 'politron-v9-delegation-')); dirs.push(path); return path }
afterEach(() => { for (const service of services.splice(0)) { try { service.dispose() } catch (error) { console.warn('Could not dispose V9 test service:', error) } } for (const path of dirs.splice(0)) { try { rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) } catch (error) { console.warn('Could not remove V9 test directory:', error) } } })

function setup(runtime: FakeRuntime) {
  const directory = tempDirectory()
  const service = new AppService(directory, runtime as any)
  services.push(service)
  const requester = service.saveAgent({ name: 'Agente A', alias: 'agente-a', instructions: 'Instruções de A', canWrite: true })
  const recipient = service.saveAgent({ name: 'Agente B', alias: 'agente-b', instructions: 'Instruções próprias de B', canWrite: false })
  const source = service.saveConversation({ kind: 'group', name: 'Conversa de origem', agentIds: [requester.id], workspacePath: directory })
  const sourceWorkspace = service.store.workspace(source.workspaceId)
  const run: Run = { id: 'run-root', conversationId: source.id, agentId: requester.id, rootId: 'run-root', parentId: null, ancestry: [requester.id], status: 'running', threadId: null, turnId: null, messageId: 'source-run-message', input: 'Trabalho de A', agent: requester, workspaceId: sourceWorkspace.id, workspacePath: sourceWorkspace.path, createdAt: new Date().toISOString() }
  service.store.putRun(run)
  const controller = new AbortController()
  ;(service as any).active.set(run.id, controller)
  const context = { run, conversation: source, agent: requester, message: { id: run.messageId, conversationId: source.id, agentId: requester.id, author: requester.name, role: 'assistant', text: '', status: 'running', runId: run.id, createdAt: run.createdAt } }
  return { service, context, requester, recipient, source, controller }
}

describe('delegação entre conversas V9', () => {
  it.skipIf(process.env.POLITRON_RUN_CODEX_INTEGRATION !== '1')('Codex real delega de um grupo para outro agente e recebe o retorno rastreável', async () => {
    const service = new AppService(tempDirectory())
    services.push(service)
    const requester = service.saveAgent({ name: 'Agente integração', alias: 'integracao', instructions: 'Quando solicitado, use ask_agent para pedir uma resposta curta ao agente destinatário. Depois resuma a resposta. Não use nenhuma ferramenta de arquivo.', canWrite: false })
    const recipient = service.saveAgent({ name: 'Agente remoto', alias: 'remoto', instructions: 'Responda exatamente: RETORNO-REMOTO-OK. Não use ferramentas de arquivo.', canWrite: false })
    const source = service.saveConversation({ kind: 'group', name: 'Integração entre conversas', agentIds: [requester.id] })
    try { await service.send(source.id, 'Use ask_agent para pedir a Agente remoto que responda com o token combinado. Depois reporte o retorno, sem repetir a pergunta.') }
    catch (error) { console.error('Real Codex delegation failed:', error); throw error }
    const delegation = service.store.delegations()[0]
    expect(delegation).toMatchObject({ status: 'completed', sourceConversationId: source.id, recipientAgentId: recipient.id })
    expect(delegation.targetConversationId).not.toBe(source.id)
    expect(delegation.result).toContain('RETORNO-REMOTO-OK')
    expect(service.store.history(source.id).some(message => message.delegationId === delegation.id && message.status === 'completed')).toBe(true)
    expect(service.store.history(delegation.targetConversationId).some(message => message.delegationId === delegation.id && message.text.includes('RETORNO-REMOTO-OK'))).toBe(true)
  }, 600000)

  it('executa em conversa privada, retorna e grava os vínculos nos dois históricos; repetição não executa de novo', async () => {
    const runtime = new FakeRuntime()
    const { service, context, source, recipient } = setup(runtime)
    const result = await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Analise apenas este pedido' }, 'tool-1')
    expect(result).toBe('Resultado do agente destinatário.')
    expect(runtime.started).toBe(1)
    expect(runtime.agents[0]).toMatchObject({ id: recipient.id, canWrite: false, instructions: 'Instruções próprias de B' })
    expect(runtime.directories[0]).not.toBe(service.store.workspace(source.workspaceId).path)
    const delegation = service.store.delegations()[0]
    expect(delegation).toMatchObject({ status: 'completed', sourceConversationId: source.id, recipientAgentId: recipient.id, result })
    expect(service.store.history(source.id).find(message => message.delegationId === delegation.id)).toMatchObject({ status: 'completed', relatedConversationId: delegation.targetConversationId })
    expect(service.store.history(delegation.targetConversationId).map(message => message.delegationId)).toEqual([delegation.id, delegation.id])
    await expect((service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Analise apenas este pedido' }, 'tool-1')).resolves.toBe(result)
    expect(runtime.started).toBe(1)
  })

  it('registra falha e não mascara o erro do destinatário', async () => {
    const runtime = new FakeRuntime(); runtime.fail = true
    const { service, context, recipient } = setup(runtime)
    await expect((service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Falhe de forma controlada' }, 'tool-fail')).rejects.toThrow('Falha simulada do destinatário.')
    expect(service.store.delegations()[0].status).toBe('failed')
    expect(service.store.delegations()[0].error).toContain('Falha simulada')
  })

  it('cancelamento da origem interrompe somente a cadeia compartilhada', async () => {
    const runtime = new FakeRuntime(); runtime.hold = true
    const { service, context, recipient, source } = setup(runtime)
    const pending = (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Pedido cancelável' }, 'tool-cancel')
    while (!runtime.started) await new Promise(resolve => setTimeout(resolve, 5))
    await service.stop(source.id)
    await expect(pending).rejects.toThrow()
    expect(service.store.delegations()[0].status).toBe('interrupted')
    expect(service.store.delegations()).toHaveLength(1)
  })

  it('cancelar um pedido não interrompe o agente solicitante nem outra delegação', async () => {
    const runtime = new FakeRuntime(); runtime.hold = true
    const { service, context, recipient, controller } = setup(runtime)
    const first = (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Primeiro pedido' }, 'tool-first')
    const second = (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Segundo pedido' }, 'tool-second')
    while (runtime.startedTurns < 2) await new Promise(resolve => setTimeout(resolve, 5))
    const firstDelegation = service.store.delegationByKey('run-root:tool-first')!
    const firstResult = service.cancelDelegation(firstDelegation.id)
    await expect(first).rejects.toThrow()
    await firstResult
    expect(controller.signal.aborted).toBe(false)
    expect(service.store.delegation(firstDelegation.id)?.status).toBe('interrupted')
    runtime.complete(2)
    await expect(second).resolves.toBe('Resultado 2.')
  })

  it('recupera vínculos persistidos após reabrir o banco sem repetir execução ativa', () => {
    const directory = tempDirectory()
    let store = new WorkspaceStore(directory)
    const agent = store.saveAgent({ name: 'Destino', alias: 'destino', instructions: 'Próprias' })
    const sourceAgent = store.saveAgent({ name: 'Origem', alias: 'origem', instructions: 'Próprias' })
    const source = store.saveConversation({ kind: 'group', name: 'Origem', agentIds: [sourceAgent.id] })
    const target = store.saveConversation({ kind: 'direct', name: 'Pedido', agentIds: [agent.id] })
    const at = new Date().toISOString()
    const sourceMessage: Message = { id: 'source-message', conversationId: source.id, agentId: agent.id, author: agent.name, role: 'activity', text: 'Executando', status: 'running', runId: null, delegationId: 'delegation-1', relatedConversationId: target.id, createdAt: at }
    const requestMessage: Message = { id: 'request-message', conversationId: target.id, agentId: sourceAgent.id, author: sourceAgent.name, role: 'activity', text: 'Pedido', status: 'running', runId: null, delegationId: 'delegation-1', relatedConversationId: source.id, createdAt: at }
    store.putMessage(sourceMessage); store.putMessage(requestMessage)
    const delegation: Delegation = { id: 'delegation-1', idempotencyKey: 'run:call', rootRunId: 'run', parentRunId: 'run', childRunId: 'child-run', requesterAgentId: sourceAgent.id, recipientAgentId: agent.id, sourceConversationId: source.id, targetConversationId: target.id, sourceMessageId: sourceMessage.id, requestMessageId: requestMessage.id, resultMessageId: 'result-message', task: 'Pedido', status: 'running', result: '', error: '', createdAt: at, updatedAt: at }
    store.putDelegation(delegation); store.close()
    store = new WorkspaceStore(directory)
    expect(store.delegation(delegation.id)).toMatchObject({ status: 'interrupted', error: expect.stringContaining('não foi repetido') })
    expect(store.history(source.id)[0]).toMatchObject({ status: 'interrupted', relatedConversationId: target.id })
    expect(store.history(target.id)[0]).toMatchObject({ status: 'interrupted', relatedConversationId: source.id })
    store.close()
  })

  it('bloqueia ciclos de agentes antes de criar outra conversa', async () => {
    const runtime = new FakeRuntime()
    const { service, context, recipient } = setup(runtime)
    context.run.ancestry.push(recipient.id)
    await expect((service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Ciclo' }, 'tool-cycle')).rejects.toThrow('ciclo')
    expect(service.store.delegations()).toHaveLength(0)
    expect(service.snapshot().conversations).toHaveLength(1)
  })
})
