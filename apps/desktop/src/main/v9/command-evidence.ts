import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CommandEvidence, CommandResult } from '../../shared/v9'

export const MAX_COMMAND_OUTPUT_BYTES = 32_000
export type CommandRunnerOptions = { timeoutMs?: number; spawn?: typeof nodeSpawn; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv }

function decodeUtf8Prefix(value: Buffer): string {
  for (let length = value.length; length >= 0; length--) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(value.subarray(0, length)) } catch { /* descarta apenas o caractere UTF-8 incompleto no limite */ }
  }
  return ''
}

export async function runCommand(command: string, cwd: string, signal?: AbortSignal, options: CommandRunnerOptions = {}): Promise<CommandResult> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const shell = platform === 'win32' ? 'powershell.exe' : 'bash'
  const args = platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] : ['--noprofile', '--norc', '-c', command]
  if (signal?.aborted) return { output: '', exitCode: null, status: 'interrupted', truncated: false }
  return new Promise(resolve => {
    let child: ChildProcess
    try { child = (options.spawn ?? nodeSpawn)(shell, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { resolve({ output: error instanceof Error ? error.message : String(error), exitCode: null, status: 'failed', truncated: false }); return }
    const chunks: Buffer[] = []
    let bytes = 0, truncated = false, timedOut = false, settled = false
    const append = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const available = MAX_COMMAND_OUTPUT_BYTES - bytes
      if (available > 0) { const kept = buffer.subarray(0, available); chunks.push(kept); bytes += kept.length }
      if (buffer.length > available) truncated = true
    }
    child.stdout?.on('data', append); child.stderr?.on('data', append)
    const terminate = () => {
      if (platform === 'win32' && child.pid) {
        const killer = nodeSpawn(join(env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.once('error', () => child.kill()); killer.once('exit', code => { if (code !== 0) child.kill() })
      } else child.kill()
    }
    const timer = setTimeout(() => { timedOut = true; terminate() }, options.timeoutMs ?? 120_000)
    const abort = () => terminate()
    signal?.addEventListener('abort', abort, { once: true })
    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
      const output = decodeUtf8Prefix(Buffer.concat(chunks))
      resolve({ ...result, output, truncated })
    }
    child.once('error', error => { append(`Não foi possível iniciar o terminal: ${error.message}`); finish({ output: '', exitCode: null, status: signal?.aborted ? 'interrupted' : 'failed', truncated: false }) })
    child.once('close', (code, exitSignal) => finish({ output: '', exitCode: code, status: signal?.aborted ? 'interrupted' : timedOut ? 'timed_out' : code === 0 ? 'completed' : 'failed', truncated: false, ...(code === null && exitSignal ? { signal: exitSignal } : {}) }))
  })
}

export function formatCommandEvidence(result: CommandResult, evidenceId: string): string {
  const ending = result.status === 'timed_out' ? '\nComando encerrado após 120 segundos.' : result.status === 'interrupted' ? '\nExecução interrompida.' : `\nCódigo de saída: ${result.exitCode ?? 'desconhecido'}.`
  return `${result.output}${result.truncated ? '\n[Saída truncada em 32 KB.]' : ''}${ending}\nEvidência: ${evidenceId}`
}

export function createCommandEvidence(input: Omit<CommandEvidence, 'id' | 'createdAt' | 'finishedAt' | 'output' | 'exitCode' | 'status' | 'truncated'>, result: CommandResult, createdAt: string, id: string = randomUUID()): CommandEvidence {
  return { ...input, ...result, id, createdAt, finishedAt: new Date().toISOString() }
}
