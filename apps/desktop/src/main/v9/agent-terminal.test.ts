// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceEvent } from '../../shared/v9'
import { AgentTerminalService, commandEnvironment, killOnce, stripTerminalControls, type PtyLike, type PtySpawn } from './agent-terminal'

describe('killOnce', () => {
  it('nunca chama kill() duas vezes no mesmo PTY (assert nativo do conpty no Windows)', () => {
    const target = { pid: 1, kill: vi.fn(), onData: vi.fn(), onExit: vi.fn() } as unknown as PtyLike
    killOnce(target); killOnce(target)
    expect(target.kill).toHaveBeenCalledTimes(1)
  })
})
type AgentTerminalEvent = Extract<WorkspaceEvent, { type: 'agentTerminal' }>

type Fake = PtyLike & { emitData: (data: string) => void; exit: (code: number) => void; killed: boolean; file: string; args: string[]; cwd: string; env: Record<string, string> }
function fakePty() {
  const spawned: Fake[] = []
  const spawn: PtySpawn = (file, args, options) => {
    let onData: (data: string) => void = () => undefined
    let onExit: (event: { exitCode: number; signal?: number }) => void = () => undefined
    const item: Fake = {
      pid: 1000 + spawned.length, file, args, cwd: options.cwd, env: options.env, killed: false,
      onData: ((listener: typeof onData) => { onData = listener; return { dispose() {} } }) as PtyLike['onData'],
      onExit: ((listener: typeof onExit) => { onExit = listener; return { dispose() {} } }) as PtyLike['onExit'],
      kill: () => { item.killed = true },
      emitData: data => onData(data), exit: code => onExit({ exitCode: code }),
    }
    spawned.push(item)
    return item
  }
  return { spawn, spawned }
}
const owner = (conversationId = 'c1', workspaceId = 'w1') => ({ workspaceId, conversationId, runId: 'r1', agentId: 'a1', agentName: 'Atlas' })

describe('AgentTerminalService', () => {
  it('executa comando curto em PTY, transmite eventos e devolve saída limpa e código', async () => {
    const { spawn, spawned } = fakePty()
    const service = new AgentTerminalService(spawn, 'win32', () => undefined)
    const events: AgentTerminalEvent[] = []
    service.on('event', event => events.push(event))
    const result = service.run({ command: 'npm test', cwd: 'C:/repo', owner: owner(), env: { PATH: 'x' } })
    expect(spawned[0].file).toBe('powershell.exe')
    expect(spawned[0].args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'])
    expect(spawned[0].args[4]).toMatch(/^npm test\n.*exit \$LASTEXITCODE/)
    expect(spawned[0].cwd).toBe('C:/repo')
    spawned[0].emitData('\x1b[32mok\x1b[0m\r\n')
    spawned[0].exit(3)
    await expect(result).resolves.toEqual({ output: 'ok\n', exitCode: 3, status: 'failed', truncated: false })
    expect(events.map(event => event.event)).toEqual(['started', 'output', 'finished'])
    expect(events[1].data).toBe('\x1b[32mok\x1b[0m\r\n')
    expect(events[2].session).toMatchObject({ status: 'failed', exitCode: 3, conversationId: 'c1', mode: 'command' })
  })

  it('processo longo segue ativo, lista só no escopo e para apenas no escopo dono', () => {
    const { spawn, spawned } = fakePty()
    const killed: number[] = []
    const service = new AgentTerminalService(spawn, 'linux', target => { killed.push(target.pid) })
    const session = service.start({ command: 'npm run dev', cwd: '/repo', owner: owner() })
    expect(session.status).toBe('running')
    service.start({ command: 'npm run dev', cwd: '/repo', owner: owner('c2') })
    expect(service.list({ workspaceId: 'w1', conversationId: 'c1' }).map(item => item.id)).toEqual([session.id])
    expect(() => service.stop(session.id, { workspaceId: 'w1', conversationId: 'c2' })).toThrow(/escopo/)
    expect(() => service.get(session.id, { workspaceId: 'w2', conversationId: 'c1' })).toThrow(/escopo/)
    expect(killed).toEqual([])
    service.stop(session.id, { workspaceId: 'w1', conversationId: 'c1' })
    expect(killed).toEqual([spawned[0].pid])
    spawned[0].exit(1)
    expect(service.get(session.id, { workspaceId: 'w1', conversationId: 'c1' }).status).toBe('interrupted')
    expect(service.list({ workspaceId: 'w1', conversationId: 'c2' })[0].status).toBe('running')
  })

  it('cancela e aplica timeout encerrando a árvore do processo', async () => {
    const { spawn, spawned } = fakePty()
    const service = new AgentTerminalService(spawn, 'win32', target => (target as Fake).exit(1))
    const controller = new AbortController()
    const cancelled = service.run({ command: 'node server.js', cwd: 'C:/repo', owner: owner(), signal: controller.signal })
    controller.abort()
    await expect(cancelled).resolves.toMatchObject({ status: 'interrupted' })
    const timed = service.run({ command: 'sleep', cwd: 'C:/repo', owner: owner(), timeoutMs: 5 })
    await expect(timed).resolves.toMatchObject({ status: 'timed_out' })
    expect(spawned).toHaveLength(2)
  })

  it('marca como encerrado mesmo quando o PTY não sinaliza a saída', async () => {
    vi.useFakeTimers()
    try {
      const { spawn, spawned } = fakePty()
      const service = new AgentTerminalService(spawn, 'linux', () => undefined)
      const session = service.start({ command: 'x', cwd: '/', owner: owner() })
      service.terminateAll()
      await vi.advanceTimersByTimeAsync(5000)
      expect(spawned[0].killed).toBe(true)
      expect(service.get(session.id, owner()).status).toBe('interrupted')
    } finally { vi.useRealTimers() }
  })

  it('limita a saída guardada e quebra eventos grandes', async () => {
    const { spawn, spawned } = fakePty()
    const service = new AgentTerminalService(spawn, 'linux', () => undefined)
    const events: AgentTerminalEvent[] = []
    service.on('event', event => { if (event.event === 'output') events.push(event) })
    const session = service.start({ command: 'x', cwd: '/', owner: owner() })
    spawned[0].emitData('a'.repeat(40_000))
    const stored = service.get(session.id, owner())
    expect(stored.output.length).toBe(32_000)
    expect(stored.truncated).toBe(true)
    expect(events.every(event => (event.data || '').length <= 16_000)).toBe(true)
  })

  it('falha fechada quando o PTY não inicia e usa ambiente mínimo', async () => {
    const service = new AgentTerminalService(() => { throw new Error('cwd inexistente') }, 'linux', () => undefined)
    await expect(service.run({ command: 'x', cwd: '/nao', owner: owner() })).resolves.toMatchObject({ status: 'failed', exitCode: null })
    expect(commandEnvironment({ PATH: '/bin', OPENAI_API_KEY: 'segredo', HOME: '/h' }, 'linux')).toEqual({ PATH: '/bin', HOME: '/h' })
    expect(stripTerminalControls('\x1b]0;título\x07a\x1b[2Jb')).toBe('ab')
  })
})
