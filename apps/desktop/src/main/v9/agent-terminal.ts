import { EventEmitter } from 'node:events'
import { spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import * as pty from 'node-pty'
import type { AgentTerminalSession, AgentTerminalSessionWithOutput, CommandResult, CommandStatus } from '../../shared/v9'
import { MAX_COMMAND_OUTPUT_BYTES } from './command-evidence'

export type PtyLike = Pick<pty.IPty, 'pid' | 'onData' | 'onExit' | 'kill'>
export type PtySpawn = (file: string, args: string[], options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }) => PtyLike
export type AgentTerminalScope = { workspaceId: string; conversationId: string }
export type AgentTerminalOwner = AgentTerminalScope & { runId: string; agentId: string; agentName: string }
export type AgentTerminalStart = { command: string; cwd: string; owner: AgentTerminalOwner; env?: Record<string, string>; onFinish?: (session: AgentTerminalSessionWithOutput) => void }

const MAX_EVENT_CHARS = 16_000
const MAX_RUNNING = 12
const MAX_KEPT = 60
const DEFAULT_TIMEOUT_MS = 120_000
const POWERSHELL_EXIT = '$boobotOk = $?; if (-not $boobotOk) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }'

/** O mesmo ambiente mínimo que os comandos do agente já recebiam: sem tokens nem variáveis do app. */
export function commandEnvironment(source: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const allowed = platform === 'win32'
    ? ['PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)']
    : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM']
  const env: Record<string, string> = {}
  for (const key of allowed) if (source[key]) env[key] = source[key]!
  return env
}

/** Remove sequências ANSI/OSC do PTY para a evidência devolvida ao agente; a interface recebe a saída bruta. */
export function stripTerminalControls(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b[@-_]/g, '').replace(/\r\n?/g, '\n')
}

function defaultKillTree(target: PtyLike, platform: NodeJS.Platform): void {
  if (platform === 'win32' && target.pid) {
    const killer = nodeSpawn(join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(target.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', () => { try { target.kill() } catch { /* já encerrado */ } })
    killer.once('exit', code => { if (code !== 0) try { target.kill() } catch { /* já encerrado */ } })
    return
  }
  try { process.kill(-target.pid, 'SIGKILL') } catch { try { target.kill() } catch { /* já encerrado */ } }
}

type Entry = { session: AgentTerminalSession; output: string; process: PtyLike | null; reason?: 'interrupted' | 'timed_out'; timer?: ReturnType<typeof setTimeout>; finished: Promise<AgentTerminalSessionWithOutput>; finish: (status: CommandStatus, exitCode: number | null) => void }

/**
 * PTYs dos comandos de agentes, vinculadas a workspace/conversa/run/agente.
 * Não é sandbox: o processo tem o acesso do usuário do host. Nunca abre janela de terminal externa.
 */
export class AgentTerminalService extends EventEmitter {
  private readonly entries = new Map<string, Entry>()
  constructor(private readonly spawnPty: PtySpawn = (file, args, options) => pty.spawn(file, args, options),
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly killTree: (target: PtyLike, platform: NodeJS.Platform) => void = defaultKillTree) { super() }

  /** Comando finito: devolve saída limitada, código e status como `runCommand`, mas visível no painel Terminal. */
  async run(input: AgentTerminalStart & { signal?: AbortSignal; timeoutMs?: number }): Promise<CommandResult> {
    if (input.signal?.aborted) return { output: '', exitCode: null, status: 'interrupted', truncated: false }
    const session = this.launch(input, 'command')
    const entry = this.entries.get(session.id)!
    const abort = () => this.terminate(entry, 'interrupted')
    input.signal?.addEventListener('abort', abort, { once: true })
    entry.timer = setTimeout(() => this.terminate(entry, 'timed_out'), input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const done = await entry.finished
    input.signal?.removeEventListener('abort', abort)
    return { output: stripTerminalControls(done.output), exitCode: done.exitCode, status: done.status === 'running' ? 'failed' : done.status, truncated: done.truncated }
  }

  /** Processo longo (servidor de desenvolvimento): segue ativo até parar, encerrar o AppService ou terminar sozinho. */
  start(input: AgentTerminalStart): AgentTerminalSessionWithOutput { return this.launch(input, 'process') }

  list(scope: AgentTerminalScope): AgentTerminalSessionWithOutput[] {
    return [...this.entries.values()].filter(entry => this.owns(entry, scope)).map(entry => ({ ...entry.session, output: entry.output }))
  }

  get(id: string, scope: AgentTerminalScope): AgentTerminalSessionWithOutput {
    const entry = this.entries.get(id)
    if (!entry || !this.owns(entry, scope)) throw new Error('Sessão de terminal não encontrada no escopo desta conversa.')
    return { ...entry.session, output: entry.output }
  }

  stop(id: string, scope: AgentTerminalScope): AgentTerminalSession {
    const entry = this.entries.get(id)
    if (!entry || !this.owns(entry, scope)) throw new Error('Sessão de terminal não encontrada no escopo desta conversa.')
    this.terminate(entry, 'interrupted')
    return { ...entry.session }
  }

  /** Encerramento do AppService: mata os processos (e filhos) que ele iniciou. */
  terminateAll(): void { for (const entry of this.entries.values()) this.terminate(entry, 'interrupted') }

  private owns(entry: Entry, scope: AgentTerminalScope) { return entry.session.workspaceId === scope.workspaceId && entry.session.conversationId === scope.conversationId }

  private launch(input: AgentTerminalStart, mode: AgentTerminalSession['mode']): AgentTerminalSessionWithOutput {
    if ([...this.entries.values()].filter(entry => entry.session.status === 'running').length >= MAX_RUNNING) throw new Error(`Limite de ${MAX_RUNNING} processos de agentes ativos atingido. Pare um processo antes de iniciar outro.`)
    this.prune()
    const { owner } = input
    const session: AgentTerminalSession = { id: randomUUID(), workspaceId: owner.workspaceId, conversationId: owner.conversationId, runId: owner.runId, agentId: owner.agentId, agentName: owner.agentName,
      command: input.command, cwd: input.cwd, mode, status: 'running', exitCode: null, truncated: false, createdAt: new Date().toISOString(), finishedAt: null }
    let resolveFinished!: (value: AgentTerminalSessionWithOutput) => void
    const finish = (status: CommandStatus, exitCode: number | null) => {
      if (session.status !== 'running') return
      clearTimeout(entry.timer)
      Object.assign(session, { status: entry.reason ?? status, exitCode, finishedAt: new Date().toISOString() })
      entry.process = null
      const result = { ...session, output: entry.output }
      this.publish('finished', session)
      try { input.onFinish?.(result) } catch { /* evidência é melhor esforço; o processo já terminou */ }
      resolveFinished(result)
    }
    const entry: Entry = { session, output: '', process: null, finished: new Promise(resolve => { resolveFinished = resolve }), finish }
    this.entries.set(session.id, entry)
    this.publish('started', session)
    const shell = this.platform === 'win32' ? 'powershell.exe' : 'bash'
    // `-Command` reduz qualquer falha ao código 1; propaga o código nativo do último comando que falhou.
    const args = this.platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `${input.command}\n${POWERSHELL_EXIT}`] : ['--noprofile', '--norc', '-c', input.command]
    try {
      // Colunas largas evitam quebras artificiais na evidência devolvida ao agente.
      entry.process = this.spawnPty(shell, args, { name: 'xterm-color', cols: 200, rows: 30, cwd: input.cwd, env: input.env ?? commandEnvironment(process.env, this.platform) })
    } catch (error) {
      this.append(entry, `Não foi possível iniciar o terminal: ${error instanceof Error ? error.message : String(error)}`)
      finish('failed', null)
      return { ...session, output: entry.output }
    }
    entry.process.onData(data => this.append(entry, data))
    entry.process.onExit(({ exitCode }) => finish(exitCode === 0 ? 'completed' : 'failed', exitCode))
    return { ...session, output: entry.output }
  }

  private append(entry: Entry, data: string) {
    if (entry.session.status !== 'running' && entry.session.finishedAt) return
    // Mantém o final da saída: em servidores longos o estado recente é o que importa.
    const next = entry.output + data
    if (next.length > MAX_COMMAND_OUTPUT_BYTES) { entry.output = next.slice(-MAX_COMMAND_OUTPUT_BYTES); entry.session.truncated = true }
    else entry.output = next
    for (let index = 0; index < data.length; index += MAX_EVENT_CHARS) this.publish('output', entry.session, data.slice(index, index + MAX_EVENT_CHARS))
  }

  private terminate(entry: Entry, reason: 'interrupted' | 'timed_out') {
    const target = entry.process
    if (!target || entry.session.status !== 'running') return
    entry.reason ??= reason
    this.killTree(target, this.platform)
    // Se o PTY não sinalizar a saída, o estado não pode ficar "running" para sempre.
    setTimeout(() => {
      if (entry.session.status !== 'running') return
      try { target.kill() } catch { /* já encerrado */ }
      entry.finish(reason, null)
    }, 5000).unref?.()
  }

  private prune() {
    const finished = [...this.entries.values()].filter(entry => entry.session.status !== 'running')
    for (const entry of finished.slice(0, Math.max(0, this.entries.size - MAX_KEPT + 1))) this.entries.delete(entry.session.id)
  }

  private publish(event: 'started' | 'output' | 'finished', session: AgentTerminalSession, data?: string) {
    this.emit('event', { type: 'agentTerminal', event, session: { ...session }, ...(data !== undefined ? { data } : {}) })
  }
}
