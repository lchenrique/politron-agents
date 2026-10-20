import { execFile, spawn, type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process'
import { extname } from 'node:path'
import { promisify } from 'node:util'
import crossSpawn from 'cross-spawn'

const execFileAsync = promisify(execFile)

/** npm installs Windows command shims as .cmd/.bat files; extensionless names also need PATH lookup. */
export function cliNeedsShell(command: string, platform = process.platform): boolean {
  if (platform !== 'win32') return false
  const extension = extname(command).toLowerCase()
  return extension === '' || extension === '.cmd' || extension === '.bat'
}

export function spawnCli(command: string, args: string[], options: SpawnOptions & { stdio: 'pipe' }): ChildProcessWithoutNullStreams
export function spawnCli(command: string, args: string[], options: SpawnOptions): ChildProcess
export function spawnCli(command: string, args: string[], options: SpawnOptions): ChildProcess {
  return cliNeedsShell(command) ? crossSpawn(command, args, options) : spawn(command, args, options)
}

export async function execCli(command: string, args: string[], options: {
  timeout?: number; maxBuffer?: number; windowsHide?: boolean; cwd?: string; env?: NodeJS.ProcessEnv
}): Promise<{ stdout: string; stderr: string }> {
  if (!cliNeedsShell(command)) return execFileAsync(command, args, options)

  const { timeout = 0, maxBuffer = 1024 * 1024, ...spawnOptions } = options
  return new Promise((resolve, reject) => {
    const child = crossSpawn(command, args, { ...spawnOptions, stdio: 'pipe' })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let totalBytes = 0, settled = false
    const timer = timeout > 0 ? setTimeout(() => fail(new Error(`O comando ${command} excedeu o tempo limite.`)), timeout) : undefined
    const fail = (error: Error) => {
      if (settled) return
      settled = true; if (timer) clearTimeout(timer); child.kill(); reject(error)
    }
    const collect = (target: Buffer[], chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += value.length
      if (totalBytes > maxBuffer) { fail(new Error(`A saída de ${command} excedeu o limite.`)); return }
      target.push(value)
    }
    child.stdout?.on('data', (chunk: Buffer | string) => collect(stdout, chunk))
    child.stderr?.on('data', (chunk: Buffer | string) => collect(stderr, chunk))
    child.once('error', fail)
    child.once('close', code => {
      if (settled) return
      settled = true; if (timer) clearTimeout(timer)
      const out = Buffer.concat(stdout).toString('utf8'), err = Buffer.concat(stderr).toString('utf8')
      if (code === 0) resolve({ stdout: out, stderr: err })
      else reject(new Error(err.trim() || `O comando ${command} encerrou com código ${code ?? 'desconhecido'}.`))
    })
  })
}
