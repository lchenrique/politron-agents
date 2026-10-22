import { mkdtempSync, rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCommandEvidence, formatCommandEvidence, MAX_COMMAND_OUTPUT_BYTES, runCommand } from './command-evidence'
import { WorkspaceStore } from './store'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
const command = (windows: string, unix: string) => process.platform === 'win32' ? windows : unix

describe('evidência de execução de comando', () => {
  it('registra saída e código zero', async () => {
    const result = await runCommand(command("Write-Output 'ok'", "printf 'ok'"), process.cwd())
    expect(result.output.trim()).toBe('ok')
    expect(result).toMatchObject({ exitCode: 0, status: 'completed', truncated: false })
  })

  it('preserva código de saída diferente de zero', async () => {
    const result = await runCommand('exit 7', process.cwd())
    expect(result).toMatchObject({ exitCode: 7, status: 'failed' })
  })

  it('marca timeout, interrupção e falha ao iniciar como estados distintos', async () => {
    const fakeSpawn = (() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill(): boolean }
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      child.kill = () => { setImmediate(() => child.emit('close', null, 'SIGTERM')); return true }
      return child
    }) as never
    const timedOut = await runCommand('never completes', process.cwd(), undefined, { timeoutMs: 5, spawn: fakeSpawn })
    expect(timedOut.status).toBe('timed_out')
    const controller = new AbortController()
    const pending = runCommand('never completes', process.cwd(), controller.signal, { spawn: fakeSpawn })
    setTimeout(() => controller.abort(), 5)
    expect((await pending).status).toBe('interrupted')
    const failed = await runCommand('true', process.cwd(), undefined, { spawn: (() => { throw new Error('spawn recusado') }) as never })
    expect(failed).toMatchObject({ status: 'failed', output: 'spawn recusado' })
  }, 8000)

  it('limita saída a 32.000 bytes sem quebrar UTF-8 e indica truncamento', async () => {
    const result = await runCommand("node -e \"process.stdout.write('é'.repeat(20000))\"", process.cwd())
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(MAX_COMMAND_OUTPUT_BYTES)
    expect(result.truncated).toBe(true)
    expect(formatCommandEvidence(result, 'evidence-1')).toContain('Evidência: evidence-1')
  }, 8000)

  it('persiste após reabrir, é idempotente por chamada e apaga junto da conversa', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-command-evidence-')); directories.push(directory)
    const store = new WorkspaceStore(directory)
    const conversation = store.saveConversation({ name: 'Comandos' })
    const evidence = createCommandEvidence({ runId: 'run-1', toolCallId: 'call-1', agentId: 'agent-1', conversationId: conversation.id, workspaceId: conversation.workspaceId, command: 'npm test', cwd: store.workspace(conversation.workspaceId).path }, { output: 'não persistir env', exitCode: 0, status: 'completed', truncated: false }, new Date().toISOString(), 'evidence-1')
    expect(store.putCommandEvidence(evidence)).toEqual(evidence)
    expect(store.putCommandEvidence({ ...evidence, id: 'duplicate', output: 'duplicata' })).toEqual(evidence)
    store.close()
    const reopened = new WorkspaceStore(directory)
    expect(reopened.commandEvidenceForRun('run-1')).toEqual([evidence])
    reopened.deleteConversation(conversation.id)
    expect(reopened.commandEvidenceForRun('run-1')).toEqual([])
    reopened.close()
  })

  it('falha a ferramenta se a evidência não puder ser salva', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-command-evidence-fail-')); directories.push(directory)
    const store = new WorkspaceStore(directory)
    const conversation = store.saveConversation({ name: 'Falha' })
    store.db.exec('DROP TABLE v9_command_evidence')
    const evidence = createCommandEvidence({ runId: 'run-2', toolCallId: 'call-2', agentId: 'agent-1', conversationId: conversation.id, workspaceId: conversation.workspaceId, command: 'echo x', cwd: '.' }, { output: 'x', exitCode: 0, status: 'completed', truncated: false }, new Date().toISOString())
    expect(() => store.putCommandEvidence(evidence)).toThrow()
    store.close()
  })
})
