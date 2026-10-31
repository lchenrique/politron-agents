import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { WorkspaceStore } from '../../../main/v9/store'
import { createCommandEvidence, runCommand } from '../../../main/v9/command-evidence'
import type { Agent, Approval, Conversation, Delegation, Message, Run } from '../../../shared/v9'

class FakeRuntime extends EventEmitter {
  started = 0
  startedTurns = 0
  fail = false
  hold = false
  directories: string[] = []
  agents: Agent[] = []
  inputs: string[] = []
  async thread(agent: Agent, directory: string) {
    this.agents.push(agent); this.directories.push(directory); this.started++
    return { id: `thread-${this.started}`, history: 'empty' as const }
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
  async send(threadId: string, input: string) { this.inputs.push(input); return this.request('turn/start', { threadId }) }
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
    expect(result).toContain('Resultado do agente destinatário.')
    expect(result).toContain('ID da delegação:')
    expect(runtime.started).toBe(1)
    expect(runtime.agents[0]).toMatchObject({ id: recipient.id, canWrite: false, instructions: 'Instruções próprias de B' })
    expect(runtime.directories[0]).toBe(service.store.workspace(source.workspaceId).path)
    const delegation = service.store.delegations()[0]
    expect(delegation).toMatchObject({ status: 'completed', sourceConversationId: source.id, recipientAgentId: recipient.id, result: expect.stringContaining('Resultado do agente destinatário.') })
    expect(service.store.message(delegation.resultMessageId)?.runId).toBe(delegation.childRunId)
    expect(service.store.history(source.id).find(message => message.delegationId === delegation.id)).toMatchObject({ status: 'completed', relatedConversationId: delegation.targetConversationId })
    expect(service.store.history(delegation.targetConversationId).map(message => message.delegationId)).toEqual([delegation.id, delegation.id])
    await expect((service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Analise apenas este pedido' }, 'tool-1')).resolves.toBe(result)
    expect(runtime.started).toBe(1)
  })

  it('consulta resultado e stdout/código e continua no privado com a solicitação anterior, sem repetir o comando', async () => {
    const runtime = new FakeRuntime()
    const { service, context, requester, recipient, source } = setup(runtime)
    const receipt = await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Execute o comando e confira a versão.' }, 'tool-initial') as string
    const previous = service.store.delegations()[0]
    expect(receipt).toContain(`ID da delegação: ${previous.id}`)
    const child = service.store.run(previous.childRunId)!
    expect(child.inputMessageId).toBe(previous.requestMessageId)
    const commandResult = await runCommand('node --version', child.workspacePath)
    const evidence = createCommandEvidence({ runId: child.id, toolCallId: 'shell-call', agentId: recipient.id, conversationId: previous.targetConversationId, workspaceId: child.workspaceId, command: 'node --version', cwd: child.workspacePath }, commandResult, new Date().toISOString(), 'command-proof')
    service.store.putCommandEvidence(evidence)
    const queried = await (service as any).callTool(context, 'delegation_result', { delegation_id: previous.id })
    expect(queried).toMatchObject({ result: previous.result, commandEvidence: [evidence] })
    const recipientContext = { run: { workspaceId: child.workspaceId }, conversation: service.store.conversation(previous.targetConversationId), agent: recipient }
    await expect((service as any).callTool(recipientContext, 'delegation_result', { delegation_id: previous.id })).resolves.toMatchObject({ delegationId: previous.id, commandEvidence: [evidence] })

    const nextReceipt = await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Informe o stdout e o código da versão anterior, sem reexecutar o comando.', delegation_id: previous.id }, 'tool-followup') as string
    const next = service.store.delegations().find(item => item.previousDelegationId === previous.id)!
    expect(nextReceipt).toContain(`ID da delegação: ${next.id}`)
    expect(next).toMatchObject({ status: 'completed', targetConversationId: previous.targetConversationId, requesterAgentId: requester.id, recipientAgentId: recipient.id })
    expect(next.childRunId).not.toBe(previous.childRunId)
    expect(service.store.run(next.childRunId)?.inputMessageId).toBe(next.requestMessageId)
    expect(runtime.inputs[1]).toContain('Execute o comando e confira a versão.')
    expect(runtime.inputs[1]).toContain('Informe o stdout e o código da versão anterior')
    expect(service.store.commandEvidenceForRun(previous.childRunId)).toEqual([evidence])
    expect(runtime.started).toBe(2)
    expect(service.store.conversations().filter(item => item.id === previous.targetConversationId)).toHaveLength(1)
  }, 15000)

  it('nega consulta e continuação por uma conversa não autorizada', async () => {
    const runtime = new FakeRuntime()
    const { service, context, recipient, source } = setup(runtime)
    await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Pedido privado' }, 'tool-private')
    const previous = service.store.delegations()[0]
    const stranger = service.saveAgent({ name: 'Agente estranho', alias: 'estranho', instructions: 'Sem acesso.' })
    const otherSource = service.saveConversation({ kind: 'group', name: 'Outra origem', agentIds: [stranger.id], workspaceId: source.workspaceId })
    const otherWorkspace = await service.saveWorkspace({ name: 'Outro workspace' })
    const wrongContext = { ...context, agent: stranger, conversation: otherSource, run: { ...context.run, workspaceId: source.workspaceId } }
    const denied = await (service as any).callTool(wrongContext, 'delegation_result', { delegation_id: previous.id }).catch((error: Error) => error)
    expect(denied).toMatchObject({ message: expect.stringContaining('não tem acesso') })
    await expect((service as any).callTool(wrongContext, 'ask_agent', { agent: recipient.alias, task: 'Tente continuar', delegation_id: previous.id }, 'tool-unauthorized')).rejects.toThrow('não pode ser continuada')
    const wrongFolderContext = { ...wrongContext, conversation: { ...otherSource, workspaceId: otherWorkspace.id }, run: { ...context.run, workspaceId: otherWorkspace.id } }
    const wrongFolder = await (service as any).callTool(wrongFolderContext, 'delegation_result', { delegation_id: previous.id }).catch((error: Error) => error)
    expect(wrongFolder).toMatchObject({ message: expect.stringContaining('não tem acesso') })
    const wrongWorkspaceContext = { ...context, run: { ...context.run, workspaceId: otherWorkspace.id } }
    await expect((service as any).callTool(wrongWorkspaceContext, 'ask_agent', { agent: recipient.alias, task: 'Tente expandir a pasta', delegation_id: previous.id }, 'tool-cross-workspace')).rejects.toThrow('workspace ou a conversa privada mudou')
    service.saveAgent({ id: recipient.id, name: recipient.name, alias: recipient.alias, instructions: recipient.instructions, temporary: true, temporaryWorkspaceId: source.workspaceId, temporaryStatus: 'retired' })
    await expect((service as any).callTool(context, 'delegation_result', { delegation_id: previous.id })).resolves.toMatchObject({ delegationId: previous.id, status: 'completed' })
    await expect((service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Reative sem autorização', delegation_id: previous.id }, 'tool-retired')).rejects.toThrow('aposentado')
    expect(runtime.started).toBe(1)
  })

  it('Chief delega e continua a delegação sem pedir aprovação', async () => {
    const runtime = new FakeRuntime()
    const { service, context, requester, recipient, source } = setup(runtime)
    const chief = service.saveAgent({ id: requester.id, name: requester.name, alias: requester.alias, instructions: requester.instructions, role: 'chief' })
    const teamConversation = service.saveConversation({ id: source.id, agentIds: [chief.id, recipient.id] })
    const chiefContext = { ...context, agent: chief, conversation: teamConversation, run: { ...context.run, agentId: chief.id, agent: chief } }
    const approve = vi.spyOn(service as any, 'requestApproval')
    // Delegação do Chief é sempre em segundo plano: o recibo volta na hora e o complemento só vale após a conclusão.
    await (service as any).callTool(chiefContext, 'ask_agent', { agent: recipient.alias, task: 'Pedido inicial' }, 'tool-chief-first')
    const previous = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(previous.id)?.status).toBe('completed'))
    await (service as any).callTool(chiefContext, 'ask_agent', { agent: recipient.alias, task: 'Complemento', delegation_id: previous.id }, 'tool-chief-followup')
    await vi.waitFor(() => expect(service.store.delegations()).toHaveLength(2))
    expect(approve).not.toHaveBeenCalled()
    expect(service.store.delegations()[1].previousDelegationId).toBe(previous.id)
    await vi.waitFor(() => expect(service.store.delegations().every(item => item.status === 'completed' && item.continuationRunId)).toBe(true))
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

  it('cancela delegação em background sem iniciar continuação ou repetir o trabalho', async () => {
    const runtime = new FakeRuntime(); runtime.hold = true
    const { service, context, recipient } = setup(runtime)
    const receipt = await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Trabalho cancelável', mode: 'background', continue_on_result: true }, 'tool-background-cancel')
    const delegation = service.store.delegations()[0]
    expect(receipt).toContain(delegation.id)
    await vi.waitFor(() => expect(runtime.startedTurns).toBe(1))
    await service.cancelDelegation(delegation.id)
    expect(service.store.delegation(delegation.id)).toMatchObject({ status: 'interrupted' })
    expect(service.store.delegation(delegation.id)?.continuationRunId).toBeUndefined()
    expect(runtime.startedTurns).toBe(1)
  })

  it('não ressuscita o recibo nem inicia continuação automática se a origem for excluída', async () => {
    const runtime = new FakeRuntime(); runtime.hold = true
    const { service, context, recipient, source } = setup(runtime)
    await (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Trabalho que perderá a origem', mode: 'background', continue_on_result: true }, 'tool-delete-origin')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(runtime.startedTurns).toBe(1))
    await service.deleteConversation(source.id)
    await vi.waitFor(() => expect(service.store.run(delegation.childRunId)?.status).toBe('interrupted'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(service.store.delegation(delegation.id)).toBeUndefined()
    expect(service.store.runs().some(run => run.parentId === context.run.id && run.agentId === context.agent.id)).toBe(false)
  })

  it('cria somente uma continuação automática para um resultado background repetido', async () => {
    const runtime = new FakeRuntime()
    const { service, context, recipient } = setup(runtime)
    const args = { agent: recipient.alias, task: 'Pedido com continuação automática', mode: 'background', continue_on_result: true }
    await (service as any).callTool(context, 'ask_agent', args, 'tool-auto-once')
    const delegation = service.store.delegations()[0]
    await vi.waitFor(() => expect(service.store.delegation(delegation.id)?.continuationRunId).toBeTruthy())
    await (service as any).callTool(context, 'ask_agent', args, 'tool-auto-once')
    expect(service.store.delegation(delegation.id)?.continuationRunId).toBeTruthy()
    expect(service.store.runs().filter(run => run.parentId === context.run.id && run.agentId === context.agent.id)).toHaveLength(1)
    await vi.waitFor(() => expect(runtime.started).toBe(2))
    await vi.waitFor(() => expect(service.store.run(service.store.delegation(delegation.id)!.continuationRunId!)?.status).toBe('completed'))
  })

  it('cancelar um pedido não interrompe o agente solicitante nem outra delegação', async () => {
    const runtime = new FakeRuntime(); runtime.hold = true
    const { service, context, recipient, controller } = setup(runtime)
    const first = (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Primeiro pedido' }, 'tool-first')
    const second = (service as any).callTool(context, 'ask_agent', { agent: recipient.alias, task: 'Segundo pedido' }, 'tool-second')
    await vi.waitFor(() => expect(runtime.startedTurns).toBe(1))
    // A mesma pasta serializa os dois pedidos. Cancelar o primeiro deve liberar o segundo.
    expect(service.store.delegationByKey('run-root:tool-second')?.status).toBe('queued')
    const firstDelegation = service.store.delegationByKey('run-root:tool-first')!
    const firstResult = service.cancelDelegation(firstDelegation.id)
    await expect(first).rejects.toThrow()
    await firstResult
    expect(controller.signal.aborted).toBe(false)
    expect(service.store.delegation(firstDelegation.id)?.status).toBe('interrupted')
    await vi.waitFor(() => expect(runtime.startedTurns).toBe(2))
    runtime.complete(2)
    await expect(second).resolves.toContain('Resultado 2.')
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

  it('repara vínculos antigos comprovados uma vez sem associar mensagens ambíguas', () => {
    const directory = tempDirectory()
    let store = new WorkspaceStore(directory)
    const recipient = store.saveAgent({ name: 'Destino', alias: 'destino', instructions: 'Próprias' })
    const requester = store.saveAgent({ name: 'Origem', alias: 'origem', instructions: 'Próprias' })
    const source = store.saveConversation({ kind: 'group', name: 'Origem', agentIds: [requester.id] })
    const target = store.saveConversation({ kind: 'direct', name: 'Pedido', agentIds: [recipient.id] })
    const at = new Date().toISOString()
    const run: Run = { id: 'child-run', conversationId: target.id, agentId: recipient.id, rootId: 'root-run', parentId: 'root-run', ancestry: [requester.id, recipient.id], status: 'completed', threadId: 'thread-1', turnId: 'turn-1', messageId: 'result-message', input: 'Pedido', agent: recipient, workspaceId: target.workspaceId, workspacePath: store.workspace(target.workspaceId).path, createdAt: at }
    const result: Message = { id: 'result-message', conversationId: target.id, agentId: recipient.id, author: recipient.name, role: 'assistant', text: 'Concluído', status: 'completed', runId: null, createdAt: at }
    const approval: Approval = { id: 'pending-approval', runId: run.id, conversationId: target.id, agentId: recipient.id, kind: 'write', details: { path: 'plan.md', before: 'antigo', after: 'novo' }, status: 'pending', createdAt: at, resolvedAt: null }
    const unrelated: Message = { ...result, id: 'ambiguous-result', delegationId: 'delegation-ambiguous' }
    const duplicate: Message = { ...result, id: 'shared-result' }
    const duplicateRun: Run = { ...run, id: 'shared-child-run', messageId: duplicate.id }
    const delegation: Delegation = { id: 'delegation-repair', idempotencyKey: 'root:call', rootRunId: 'root-run', parentRunId: 'root-run', childRunId: run.id, requesterAgentId: requester.id, recipientAgentId: recipient.id, sourceConversationId: source.id, targetConversationId: target.id, sourceMessageId: 'source-message', requestMessageId: 'request-message', resultMessageId: result.id, task: 'Pedido', status: 'completed', result: 'Concluído', error: '', createdAt: at, updatedAt: at }
    const ambiguous: Delegation = { ...delegation, id: 'delegation-ambiguous', idempotencyKey: 'root:ambiguous', resultMessageId: unrelated.id }
    const sharedA: Delegation = { ...delegation, id: 'shared-a', idempotencyKey: 'root:shared-a', childRunId: duplicateRun.id, resultMessageId: duplicate.id }
    const sharedB: Delegation = { ...sharedA, id: 'shared-b', idempotencyKey: 'root:shared-b' }
    store.putRun(run); store.putRun(duplicateRun); store.putMessage(result); store.putMessage(unrelated); store.putMessage(duplicate); store.putDelegation(delegation); store.putDelegation(ambiguous); store.putDelegation(sharedA); store.putDelegation(sharedB); store.putApproval(approval)

    store.close()
    store = new WorkspaceStore(directory)
    expect(store.message(result.id)?.runId).toBe(run.id)
    expect(store.message(unrelated.id)?.runId).toBeNull()
    expect(store.message(duplicate.id)?.runId).toBeNull()
    expect(store.approvals().find(item => item.id === approval.id)?.status).toBe('interrupted')
    expect(store.runs()).toHaveLength(2)
    expect(store.repairDelegatedMessageLinks()).toBe(0)
    expect(readdirSync(directory).some(file => file.startsWith('politron-v9.backup-delegated-links-'))).toBe(true)
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
