import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../shared/v9'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { ClaudeRuntime } from '../../../main/v9/claude'
import { CodexRuntime } from '../../../main/v9/codex'

class FakeRuntime extends EventEmitter {
  threads: Array<{ id: string; agent: Agent; directory: string }> = []
  turns: Array<{ threadId: string; text: string }> = []
  async models() { return [] }
  async thread(agent: Agent, directory: string, _tools: unknown, threadId?: string) { const id = threadId || `${agent.runtime}-thread-${this.threads.length + 1}`; this.threads.push({ id, agent, directory }); return id }
  async request(_method: string, params: any) {
    const threadId = params.threadId as string; const turnId = `${threadId}-turn-${this.turns.length + 1}`; const text = params.input[0].text as string
    this.turns.push({ threadId, text })
    setTimeout(() => { this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, turnId, delta: `Resposta simulada: ${text}` } }); this.emit('event', { method: 'turn/completed', params: { threadId, turnId, turn: { id: turnId, status: 'completed' } } }) })
    return { turn: { id: turnId, status: 'inProgress' } }
  }
  async send(threadId: string, input: string) { return this.request('turn/start', { threadId, input: [{ text: input }] }) }
  respond() {}
  async interrupt() {}
  close() {}
}

const paths: string[] = []; const services: AppService[] = []
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'politron-multi-runtime-')); paths.push(path); return path }
afterEach(() => { for (const service of services.splice(0)) service.dispose(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }) })

describe('motores múltiplos', () => {
  it('envia turnos pelo contrato comum do Codex', async () => {
    const runtime = new CodexRuntime()
    const request = vi.spyOn(runtime, 'request').mockResolvedValue({ turn: { id: 'codex-turn', status: 'inProgress' } })
    await expect(runtime.send('codex-thread', 'Olá', 'gpt-model', 1234)).resolves.toMatchObject({ turn: { id: 'codex-turn' } })
    expect(request).toHaveBeenCalledWith('turn/start', { threadId: 'codex-thread', input: [{ type: 'text', text: 'Olá' }], model: 'gpt-model' }, 1234)
    runtime.close()
  })

  it('roteia conversa, diff e delegação pelo motor de cada agente', async () => {
    const codex = new FakeRuntime(); const claude = new FakeRuntime()
    const service = new AppService(temp(), codex as any, claude as any); services.push(service)
    const reviewer = service.saveAgent({ name: 'Claude revisora', alias: 'claude-revisora', instructions: 'Revise em português.', runtime: 'claude', model: 'sonnet', effort: 'high', canWrite: true, approvalMode: 'automatic' })
    expect(service.store.agent(reviewer.id)).toMatchObject({ runtime: 'claude', model: 'sonnet', effort: 'high' })
    const coder = service.saveAgent({ name: 'Codex executor', alias: 'codex-executor', instructions: 'Responda brevemente.' })
    const conversation = service.saveConversation({ kind: 'group', name: 'Motores', agentIds: [reviewer.id, coder.id], workspacePath: temp() })
    await service.send(conversation.id, '@claude-revisora faça uma revisão')
    expect(claude.turns).toHaveLength(1)
    expect(codex.turns).toHaveLength(0)

    const run = service.store.runs().find(item => item.agentId === reviewer.id)!
    const context = { run, message: service.store.message(run.messageId), conversation, agent: reviewer, signal: new AbortController().signal }
    await (service as any).callTool(context, 'workspace_write', { path: 'review.md', content: 'Revisado.' }, 'tool-write')
    expect(readFileSync(join(context.run.workspacePath, 'review.md'), 'utf8')).toBe('Revisado.')
    expect(service.store.fileChangesForRun(run.id)[0]).toMatchObject({ agentId: reviewer.id, status: 'applied' })

    await (service as any).callTool(context, 'ask_agent', { agent: coder.alias, task: 'Faça uma checagem curta.' }, 'tool-delegate')
    expect(codex.turns).toHaveLength(1)
    expect(service.store.delegations()[0]).toMatchObject({ requesterAgentId: reviewer.id, recipientAgentId: coder.id, status: 'completed' })
  })

  it('normaliza uma sessão Claude simulada e retoma o id real do SDK', async () => {
    const captured: any[] = []
    const sdk = ((request: any) => {
      captured.push(request)
      const id = request.options.resume || 'claude-session-real'
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: 'system', subtype: 'init', session_id: id }
          yield { type: 'assistant', session_id: id, parent_tool_use_id: null, message: { content: [{ type: 'text', text: request.prompt }] } }
          yield { type: 'result', subtype: 'success', session_id: id, is_error: false, result: request.prompt }
        },
        async supportedModels() { return [{ value: 'sonnet', displayName: 'Claude Sonnet' }] },
        close() {}
      }
    }) as any
    const runtime = new ClaudeRuntime(temp(), async () => 'test-api-key', sdk)
    const agent = { id: 'claude-1', name: 'Claude', alias: 'claude', instructions: 'Ajude.', runtime: 'claude', model: 'sonnet', effort: 'medium' } as Agent
    const models = await runtime.models()
    expect(models).toContainEqual({ id: 'sonnet', name: 'Claude Sonnet', runtime: 'claude', isDefault: true })
    const threadId = await runtime.thread(agent, temp(), [])
    const events: any[] = []; runtime.on('event', event => events.push(event))
    const first = await runtime.send(threadId, 'Primeira')
    expect(first.thread.id).toBe('claude-session-real')
    await vi.waitFor(() => expect(events.some(event => event.method === 'turn/completed')).toBe(true))
    await runtime.thread(agent, temp(), [], 'claude-session-real')
    await runtime.send('claude-session-real', 'Continuação')
    expect(captured.at(-1).options.resume).toBe('claude-session-real')
    expect(events.some(event => event.method === 'item/agentMessage/delta' && event.params.delta === 'Primeira')).toBe(true)
    runtime.close()
  })

  it.skipIf(process.env.POLITRON_RUN_CLAUDE_INTEGRATION !== '1' || !process.env.ANTHROPIC_API_KEY)('Claude real responde, grava com diff e delega a conferência ao Codex', async () => {
    const codex = new FakeRuntime()
    const dataDirectory = temp()
    const claude = new ClaudeRuntime(dataDirectory, async () => process.env.ANTHROPIC_API_KEY || null)
    const service = new AppService(dataDirectory, codex as any, claude); services.push(service)
    const reviewer = service.saveAgent({ name: 'Claude integração', alias: 'claude-integracao', instructions: 'Siga exatamente a solicitação, use workspace_write para arquivos e ask_agent para delegar a conferência.', runtime: 'claude', model: process.env.POLITRON_CLAUDE_MODEL || '', effort: 'medium', canWrite: true, approvalMode: 'automatic' })
    const coder = service.saveAgent({ name: 'Codex conferência', alias: 'codex-conferencia', instructions: 'Confirme a conferência de forma breve.' })
    const conversation = service.saveConversation({ kind: 'direct', name: 'Integração Claude', agentIds: [reviewer.id], workspacePath: temp() })

    await service.send(conversation.id, 'Crie claude-integration.txt com exatamente a frase "Integração Claude concluída" usando workspace_write. Depois peça ao agente @codex-conferencia para confirmar que o arquivo foi criado e responda com uma frase curta.')

    const run = service.store.runs().find(item => item.agentId === reviewer.id)
    expect(run?.status).toBe('completed')
    expect(readFileSync(join(conversation.workspaceId ? service.store.workspace(conversation.workspaceId).path : '', 'claude-integration.txt'), 'utf8')).toContain('Integração Claude concluída')
    expect(service.store.fileChangesForRun(run!.id)).toMatchObject([expect.objectContaining({ status: 'applied', path: 'claude-integration.txt' })])
    expect(service.store.delegations()).toMatchObject([expect.objectContaining({ requesterAgentId: reviewer.id, recipientAgentId: coder.id, status: 'completed' })])
    expect(service.history(conversation.id).some(message => message.role === 'assistant' && message.agentId === reviewer.id && message.text.trim())).toBe(true)
  }, 180000)
})
