import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, access } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import type { Agent, Model } from '../../shared/v9'
import type { DynamicTool } from './codex'
import type { AgentRuntime } from './agent-runtime'
import { AntigravityRuntime, parseAntigravityModels } from './antigravity'

const execFileAsync = promisify(execFile)
type Kind = 'opencode' | 'antigravity'
type State = {
  id: string; agent: Agent; instructions: string
  history: { role: 'Usuário' | 'Agente'; text: string }[]
  child?: ChildProcessWithoutNullStreams; turnId?: string; text: string
  timeout?: ReturnType<typeof setTimeout>; stopping: boolean; finished: boolean
}
type Packet = Record<string, any>
const cleanError = (value: string) => value.replace(/(?:sk-[a-zA-Z0-9_-]{12,}|Bearer\s+[^\s]+)/g, '[redacted]').slice(0, 400)
const config = JSON.stringify({
  permission: { '*': 'deny' },
  agent: {
    'politron-safe': {
      description: 'Chat sem acesso a ferramentas externas',
      mode: 'primary',
      permission: { '*': 'deny' },
      prompt: 'Você responde somente por texto. Não utilize comandos, ferramentas, arquivos nem subagentes.',
    },
  },
  share: 'disabled',
  autoupdate: false,
})

/** Adaptador de conversa sem execução de ferramentas; nada é iniciado ao abrir o seletor. */
export class HeadlessCliRuntime extends EventEmitter implements AgentRuntime {
  private readonly sessions = new Map<string, State>()
  private binary?: string
  constructor(readonly kind: Kind, private readonly directory: string) { super() }

  private async executable(): Promise<string> {
    if (this.binary) return this.binary
    const bin = this.kind === 'opencode' ? 'opencode' : 'agy'
    const lookup = async (name: string): Promise<string[]> => {
      try {
        const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { windowsHide: true, timeout: 4000 })
        return stdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean)
      } catch { return [] }
    }
    const candidates = await lookup(bin)
    if (process.platform === 'win32' && this.kind === 'opencode') {
      for (const candidate of [...candidates, ...await lookup('opencode.cmd')]) {
        const path = join(dirname(candidate), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
        try { await access(path); this.binary = path; return path } catch { /* próximo */ }
      }
    }
    for (const candidate of candidates) {
      if (process.platform === 'win32' && extname(candidate).toLowerCase() !== '.exe') continue
      try { await access(candidate); this.binary = candidate; return candidate } catch { /* próximo */ }
    }
    throw new Error('Não foi possível localizar o executável ' + bin + '. Atualize a detecção em Configurações.')
  }

  async models(): Promise<Model[]> {
    if (this.kind === 'antigravity') return new AntigravityRuntime().models()
    throw new Error('O catálogo OpenCode é disponibilizado pelo inventário de CLIs do Boobot.')
  }

  async thread(agent: Agent, _workspace: string, _tools: DynamicTool[], id?: string, projectInstructions = ''): Promise<string> {
    const key = id || randomUUID()
    if (this.sessions.has(key)) return key
    await this.executable()
    await mkdir(this.directory, { recursive: true })
    this.sessions.set(key, { id: key, agent, instructions: projectInstructions, history: [], text: '', stopping: false, finished: false })
    return key
  }

  async send(threadId: string, message: string, model?: string, timeout = 360000): Promise<{ thread: { id: string }; turn: { id: string; status: string } }> {
    const session = this.sessions.get(threadId)
    if (!session) throw new Error('Sessão não encontrada para ' + this.kind)
    if (session.child) throw new Error('A conversa ainda está respondendo.')
    const chosen = model || session.agent.model
    if (!chosen || (this.kind === 'opencode' && !chosen.includes('/'))) throw new Error('Selecione um modelo válido de ' + this.kind)
    const executable = await this.executable()
    const turnId = randomUUID()
    session.turnId = turnId; session.text = ''; session.stopping = false; session.finished = false
    const history = session.history.slice(-12).map(item => item.role + ': ' + item.text.slice(0, 2600)).join('\n\n')
    const prompt = [
      session.agent.instructions, session.instructions,
      'Responda apenas por texto, sem executar ferramentas ou alterações no computador.',
      history && 'Histórico desta conversa:\n' + history,
      'Usuário: ' + message,
    ].filter(Boolean).join('\n\n').slice(-22000)

    const args = this.kind === 'opencode'
      ? ['run', '--pure', '--agent', 'politron-safe', '--model', chosen, '--format', 'json', prompt]
      : ['--mode', 'plan', '--sandbox', '--disable-slash-commands', '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', chosen]
    const child = spawn(executable, args, {
      cwd: this.directory,
      windowsHide: true, shell: false, stdio: 'pipe',
      env: this.kind === 'opencode'
        ? { ...process.env, OPENCODE_CONFIG_CONTENT: config, OPENCODE_DISABLE_AUTOUPDATE: '1' }
        : { ...process.env },
    })
    session.child = child
    session.timeout = setTimeout(() => { session.stopping = true; child.kill(); this.finish(session, 'failed', 'O CLI excedeu o tempo limite da resposta.') }, timeout)
    session.timeout.unref?.()
    let pending = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      if (pending.length > 8 * 1024 * 1024) { child.kill(); this.finish(session, 'failed', 'Saída do CLI excedeu o limite.'); return }
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const row = pending.slice(0, end).trim(); pending = pending.slice(end + 1)
        if (!row) continue
        try { this.receive(session, JSON.parse(row) as Packet) } catch { /* diagnóstico não-JSON */ }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000) })
    child.on('error', (error) => { this.finish(session, 'failed', cleanError(error.message)) })
    child.on('close', (code) => {
      if (pending.trim()) { try { this.receive(session, JSON.parse(pending) as Packet) } catch {} }
      if (session.finished) return
      this.finish(session, session.stopping ? 'interrupted' : code === 0 && session.text ? 'completed' : 'failed',
        code === 0 ? 'O CLI encerrou sem produzir uma resposta.' : cleanError(stderr) || 'O CLI terminou com erro (' + code + ').')
    })
    if (this.kind === 'antigravity') {
      child.stdin.write(JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n')
    }
    // O processo emite eventos somente no próximo ciclo, após registrar threadId/turnId.
    session.history.push({ role: 'Usuário', text: message })
    return { thread: { id: threadId }, turn: { id: turnId, status: 'inProgress' } }
  }

  private receive(session: State, packet: Packet): void {
    if (session.finished || !session.turnId) return
    if (this.kind === 'opencode') {
      if (packet.type === 'text' && typeof packet.part?.text === 'string') this.delta(session, packet.part.text)
      if (packet.type === 'error') {
        this.finish(session, 'failed', cleanError(String(packet.error?.data?.message || packet.error?.message || 'Falha no OpenCode')))
      }
    } else {
      if (packet.event === 'step_update' && packet.step_update?.step_type === 'agent_response' && typeof packet.step_update.text_delta === 'string') {
        this.delta(session, packet.step_update.text_delta)
      }
      if (packet.event === 'result') {
        if (packet.result?.status === 'SUCCESS') {
          if (!session.text && typeof packet.result.response === 'string') this.delta(session, packet.result.response)
          this.finish(session, 'completed')
        } else this.finish(session, 'failed', cleanError(String(packet.result?.error || packet.result?.status || 'Falha no Antigravity')))
      }
    }
  }
  private delta(session: State, text: string): void {
    session.text += text
    this.emit('event', { method: 'item/agentMessage/delta', params: { threadId: session.id, turnId: session.turnId, delta: text } })
  }
  private finish(session: State, status: 'completed' | 'failed' | 'interrupted', error?: string): void {
    if (session.finished || !session.turnId) return
    session.finished = true
    if (session.timeout) clearTimeout(session.timeout)
    const params = { threadId: session.id, turnId: session.turnId }
    if (session.text) this.emit('event', { method: 'item/completed', params: { ...params, item: { type: 'agentMessage', text: session.text } } })
    if (status === 'completed') session.history.push({ role: 'Agente', text: session.text })
    this.emit('event', { method: 'turn/completed', params: { ...params, turn: { id: session.turnId, status, ...(error ? { error: { message: error } } : {}) } } })
    session.child?.kill()
    session.child = undefined
    session.turnId = undefined
  }
  respond(): void { /* Nenhuma ferramenta é oferecida por este adaptador. */ }
  async interrupt(threadId: string, turnId: string): Promise<void> {
    const session = this.sessions.get(threadId)
    if (session?.turnId !== turnId) return
    session.stopping = true
    this.finish(session, 'interrupted')
  }
  close(): void { for (const state of this.sessions.values()) { if (state.child) { state.stopping = true; state.child.kill() } if (state.timeout) clearTimeout(state.timeout) } this.sessions.clear() }
}
