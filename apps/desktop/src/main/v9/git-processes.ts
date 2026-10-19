import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type Job = { start: () => Promise<void>; cancel: () => void; signal?: AbortSignal }
/** Padrão do Paseo: admissão dos processos Git, separada da fila de agentes. */
export class GitProcessScheduler {
  private running = 0
  private foreground: Job[] = []
  private background: Job[] = []
  constructor(private readonly concurrency = 4) {}
  run<T>(start: () => Promise<T>, signal?: AbortSignal, background = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        this.foreground = this.foreground.filter(item => item !== job)
        this.background = this.background.filter(item => item !== job)
        signal?.removeEventListener('abort', cancel)
        reject(new Error('Consulta Git interrompida.'))
      }
      const job: Job = { signal, cancel, start: async () => {
        signal?.removeEventListener('abort', cancel)
        try { resolve(await start()) } catch (error) { reject(error) }
      } }
      if (signal?.aborted) { cancel(); return }
      ;(background ? this.background : this.foreground).push(job)
      signal?.addEventListener('abort', cancel, { once: true })
      this.pump()
    })
  }
  private pump(): void {
    while (this.running < this.concurrency) {
      const job = this.foreground.shift() || this.background.shift()
      if (!job) return
      if (job.signal?.aborted) { job.cancel(); continue }
      this.running++
      void job.start().finally(() => { this.running--; this.pump() })
    }
  }
}

const scheduler = new GitProcessScheduler()
const execute = promisify(execFile)
export async function runGit(cwd: string, args: string[], signal?: AbortSignal, background = false): Promise<string> {
  return scheduler.run(async () => {
    const { stdout } = await execute('git', ['-C', cwd, ...args], { windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8', signal })
    return stdout.trimEnd()
  }, signal, background)
}

export function parseGitStatus(output: string): { branch: string | null; changes: number } {
  const [head, ...entries] = output.split(/\r?\n/)
  const label = head.replace(/^## /, '').replace(/^(No commits yet on|Initial commit on) /, '')
  return { branch: label.startsWith('HEAD ') ? null : label.split('...')[0], changes: entries.filter(Boolean).length }
}
