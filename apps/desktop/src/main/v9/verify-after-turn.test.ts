// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityTool, CommandEvidence, CommandResult } from '../../shared/v9'
import type { Agent, Conversation } from '../../shared/v9'
import type { AgentRuntime } from './agent-runtime'
import { MAX_VERIFY_ATTEMPTS, gitFingerprint, shouldVerify, summarizeOutput, verifyTurn } from './verify-after-turn'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from './workspace'

function fakeHost(result: CommandResult) {
  const evidence: CommandEvidence[] = []
  const activity: Array<{ text: string; tool: ActivityTool }> = []
  return { evidence, activity, host: {
    putCommandEvidence: (value: CommandEvidence) => { evidence.push(value) },
    activity: (text: string, tool: ActivityTool) => { activity.push({ text, tool }); return (next: string, done: ActivityTool) => { activity.push({ text: next, tool: done }) } },
    run: vi.fn(async () => result),
  } }
}
const input = (attempt: number) => ({ command: 'npm test', cwd: tmpdir(), attempt, runId: 'r', agentId: 'a', agentName: 'Dev', conversationId: 'c', workspaceId: 'w' })

describe('pronto com prova', () => {
  it('só verifica turnos de execução concluídos que alteraram arquivos ou corrigem uma verificação', () => {
    expect(shouldVerify({ command: 'npm test', status: 'completed', changedFiles: true })).toBe(true)
    expect(shouldVerify({ command: 'npm test', status: 'completed', verifyAttempt: 1 })).toBe(true)
    expect(shouldVerify({ command: 'npm test', status: 'completed' })).toBe(false)
    expect(shouldVerify({ command: '', status: 'completed', changedFiles: true })).toBe(false)
    expect(shouldVerify({ command: 'npm test', status: 'failed', changedFiles: true })).toBe(false)
    expect(shouldVerify({ command: 'npm test', status: 'completed', changedFiles: true, planMode: true })).toBe(false)
  })

  it('resume a saída longa mantendo começo e fim', () => {
    const summary = summarizeOutput(`início ${'x'.repeat(10_000)} erro final`, 400)
    expect(summary.length).toBeLessThan(500)
    expect(summary).toMatch(/^início/)
    expect(summary).toMatch(/erro final$/)
    expect(summary).toMatch(/omitidos/)
  })

  it('registra evidência e atividade quando passa, sem continuação', async () => {
    const { host, evidence, activity } = fakeHost({ output: 'ok', exitCode: 0, status: 'completed', truncated: false })
    const outcome = await verifyTurn(host, input(0))
    expect(outcome).toMatchObject({ passed: true, retry: null })
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ command: 'npm test', runId: 'r', exitCode: 0, status: 'completed' })
    expect(evidence[0].toolCallId).toMatch(/^verify:/)
    expect(activity.at(-1)).toMatchObject({ text: 'Verificação passou · npm test', tool: { status: 'completed' } })
  })

  it('devolve a saída ao agente até 3 vezes e depois para', async () => {
    const failing = { output: 'FAIL soma.test.js', exitCode: 1, status: 'failed' as const, truncated: false }
    for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
      const { host, activity } = fakeHost(failing)
      const outcome = await verifyTurn(host, input(attempt))
      expect(outcome.passed).toBe(false)
      expect(outcome.retry).toContain('FAIL soma.test.js')
      expect(outcome.retry).toContain(`Correção automática ${attempt + 1} de ${MAX_VERIFY_ATTEMPTS}`)
      expect(activity.at(-1)?.text).toContain('Devolvida a Dev para corrigir')
    }
    const { host, activity } = fakeHost(failing)
    expect((await verifyTurn(host, input(MAX_VERIFY_ATTEMPTS))).retry).toBeNull()
    expect(activity.at(-1)?.text).toContain('Limite de 3 correções automáticas atingido')
  })
})

class ControlledRuntime extends EventEmitter {
  threads: string[] = []
  inputs: string[] = []
  respond = vi.fn()
  async models() { return [] }
  async thread() { const id = `thread-${this.threads.length}`; this.threads.push(id); return { id, history: 'empty' as const } }
  async send(_threadId: string, input: string) { this.inputs.push(input); return { turn: { id: 'turn', status: 'inProgress' } } }
  async interrupt() {}
  close() {}
  complete(threadId: string) { this.emit('event', { method: 'turn/completed', params: { threadId, turn: { id: 'turn', status: 'completed' } } }) }
  fileChange(threadId: string, path: string) { this.emit('event', { method: 'item/completed', params: { threadId, turnId: 'turn', item: { type: 'fileChange', id: `f-${path}`, status: 'completed', changes: [{ path }] } } }) }
  approval(threadId: string, command: string) { this.emit('event', { id: command, method: 'item/commandExecution/requestApproval', params: { threadId, turnId: 'turn', itemId: 'i', command } }) }
}

const fixtures: Array<{ service: AppService; directory: string; sends: Promise<void>[]; conversations: Conversation[] }> = []
function setup(verifyCommand?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'boobot-verify-'))
  const codex = new ControlledRuntime()
  const service = new AppService(directory, codex as unknown as AgentRuntime, new ControlledRuntime() as unknown as AgentRuntime)
  const agent: Agent = service.saveAgent({ instructions: 'Teste.', name: 'Dev', alias: 'dev', canWrite: true, runtimePermissionMode: 'bypass' })
  const path = join(directory, 'projeto'); mkdirSync(path)
  writeFileSync(join(path, 'check.js'), "process.exit(require('fs').existsSync(require('path').join(__dirname, 'ok.txt')) ? 0 : 1)")
  const workspace = service.store.saveWorkspace({ name: 'Projeto', path, ...(verifyCommand ? { verifyCommand } : {}) })
  const conversation = service.store.saveConversation({ name: 'Dev', workspaceId: workspace.id, agentIds: [agent.id] })
  const fixture = { service, directory, sends: [] as Promise<void>[], conversations: [conversation] }
  fixtures.push(fixture)
  return { ...fixture, codex, path, workspace, conversation }
}
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    for (const controller of (fixture.service as unknown as { active: Map<string, AbortController> }).active.values()) controller.abort()
    for (const conversation of fixture.conversations) await fixture.service.stop(conversation.id)
    await Promise.all(fixture.sends)
    fixture.service.dispose()
    await rm(fixture.directory, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 })
  }
}, 30000)

describe('pronto com prova no AppService', () => {
  it('turno que alterou arquivos roda a verificação; a falha volta ao mesmo agente e a correção passa', async () => {
    const { service, codex, path, conversation, workspace, sends } = setup('node check.js')
    expect(service.store.workspace(workspace.id).verifyCommand).toBe('node check.js')
    const first = service.send(conversation.id, 'Implemente')
    sends.push(first)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    codex.fileChange(codex.threads[0], 'soma.js')
    codex.complete(codex.threads[0])
    await first
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(2), { timeout: 20000 })
    expect(codex.inputs[1]).toContain('a verificação do projeto falhou')
    expect(codex.inputs[1]).toContain('node check.js')
    const retry = service.store.runs().find(run => run.verifyAttempt === 1)!
    expect(retry).toMatchObject({ agentId: conversation.agentIds[0], conversationId: conversation.id, continuationDepth: 1 })

    writeFileSync(join(path, 'ok.txt'), 'ok')
    codex.complete(codex.threads.at(-1)!)
    await vi.waitFor(() => expect(service.store.recentCommandEvidence(10)).toHaveLength(2), { timeout: 20000 })
    const [passed, failed] = service.store.recentCommandEvidence(10)
    expect(failed).toMatchObject({ command: 'node check.js', status: 'failed', exitCode: 1 })
    expect(passed).toMatchObject({ command: 'node check.js', status: 'completed', exitCode: 0 })
    await vi.waitFor(() => {
      const activity = service.store.history(conversation.id).filter(message => message.role === 'activity').map(message => message.text)
      expect(activity.some(text => text.startsWith('Verificação falhou · node check.js. Devolvida a Dev'))).toBe(true)
      expect(activity).toContain('Verificação passou · node check.js')
    })
    expect(codex.inputs).toHaveLength(2)
  }, 60000)

  it('turno sem alteração de arquivos ou workspace sem comando não verifica', async () => {
    const { service, codex, conversation, sends } = setup('node check.js')
    const first = service.send(conversation.id, 'Só responda')
    sends.push(first)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    codex.complete(codex.threads[0])
    await first
    expect(service.store.recentCommandEvidence(10)).toHaveLength(0)

    const other = setup()
    const second = other.service.send(other.conversation.id, 'Implemente')
    other.sends.push(second)
    await vi.waitFor(() => expect(other.codex.inputs).toHaveLength(1))
    other.codex.fileChange(other.codex.threads[0], 'a.js')
    other.codex.complete(other.codex.threads[0])
    await second
    expect(other.service.store.recentCommandEvidence(10)).toHaveLength(0)
  })

  it('Codex: pedido de aprovação de ação bloqueada é recusado mesmo em Acesso total', async () => {
    const { service, codex, conversation, sends } = setup()
    const first = service.send(conversation.id, 'Publique')
    sends.push(first)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    codex.approval(codex.threads[0], 'git push --force origin main')
    expect(codex.respond).toHaveBeenLastCalledWith('git push --force origin main', { decision: 'decline' })
    codex.approval(codex.threads[0], 'npm test')
    expect(codex.respond).toHaveBeenLastCalledWith('npm test', { decision: 'accept' })
    expect(service.store.history(conversation.id).some(message => message.role === 'activity' && /push forçado/.test(message.text))).toBe(true)
    codex.complete(codex.threads[0])
    await first
  })

  it('Codex: item/started do comando bloqueado não interrompe o turno; a recusa vem do pedido de aprovação', async () => {
    const { service, codex, conversation, sends } = setup()
    const interrupt = vi.spyOn(codex, 'interrupt')
    const first = service.send(conversation.id, 'Limpe')
    sends.push(first)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    // Ordem real do app-server (approvalPolicy untrusted): item/started, depois o pedido de aprovação, depois item/completed declined.
    codex.emit('event', { method: 'item/started', params: { threadId: codex.threads[0], turnId: 'turn', item: { type: 'commandExecution', id: 'c2', command: 'rm -rf /' } } })
    codex.approval(codex.threads[0], 'rm -rf /')
    expect(codex.respond).toHaveBeenLastCalledWith('rm -rf /', { decision: 'decline' })
    codex.emit('event', { method: 'item/completed', params: { threadId: codex.threads[0], turnId: 'turn', item: { type: 'commandExecution', id: 'c2', command: 'rm -rf /', status: 'declined' } } })
    expect(interrupt).not.toHaveBeenCalled()
    const history = service.store.history(conversation.id)
    expect(history.some(message => message.role === 'activity' && message.status === 'failed' && /Ação bloqueada/.test(message.text))).toBe(true)
    expect(history.find(message => message.tool?.name === 'workspace_run_command')?.tool?.status).toBe('failed')
    codex.complete(codex.threads[0])
    await first
  })

  it('workspace git: alteração feita só por comando de shell dispara a verificação; turno sem mudança não', async () => {
    const { service, codex, path, conversation, sends } = setup('node check.js')
    const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { windowsHide: true })
    git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base')
    const quiet = service.send(conversation.id, 'Só responda')
    sends.push(quiet)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    codex.complete(codex.threads[0])
    await quiet
    expect(service.store.recentCommandEvidence(10)).toHaveLength(0)

    const shell = service.send(conversation.id, 'Crie ok.txt pelo terminal')
    sends.push(shell)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(2))
    writeFileSync(join(path, 'ok.txt'), 'ok') // simula o comando de shell: nenhum workspace_write nem fileChange
    codex.complete(codex.threads.at(-1)!)
    await shell
    await vi.waitFor(() => expect(service.store.recentCommandEvidence(10)).toHaveLength(1), { timeout: 20000 })
    expect(service.store.recentCommandEvidence(10)[0]).toMatchObject({ command: 'node check.js', status: 'completed', exitCode: 0 })
  }, 60000)

  it('gitFingerprint muda com edição de arquivo já modificado e é null fora de git', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'boobot-fp-'))
    try {
      expect(await gitFingerprint(directory)).toBeNull()
      execFileSync('git', ['-C', directory, 'init', '-q'], { windowsHide: true })
      writeFileSync(join(directory, 'a.txt'), '1')
      const first = await gitFingerprint(directory)
      expect(first).toBeTruthy()
      expect(await gitFingerprint(directory)).toBe(first)
      writeFileSync(join(directory, 'a.txt'), '22')
      expect(await gitFingerprint(directory)).not.toBe(first)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('ferramentas do Boobot recusam comando e escrita bloqueados sem pedir aprovação', async () => {
    const { service, codex, conversation, sends } = setup()
    const first = service.send(conversation.id, 'Mexa')
    sends.push(first)
    await vi.waitFor(() => expect(codex.inputs).toHaveLength(1))
    const internal = service as unknown as { contexts: Map<string, unknown>; requestApproval: () => Promise<boolean>; callTool(context: unknown, name: string, args: Record<string, unknown>): Promise<unknown> }
    const approval = vi.spyOn(internal, 'requestApproval')
    const context = [...internal.contexts.values()][0]
    expect(await internal.callTool(context, 'workspace_run_command', { command: 'rm -rf ..' })).toMatch(/apagar fora da pasta/)
    expect(await internal.callTool(context, 'workspace_write', { path: '.env.production', content: 'X=1' })).toMatch(/escrever em \.env\.production/)
    expect(approval).not.toHaveBeenCalled()
    codex.complete(codex.threads[0])
    await first
  })
})
