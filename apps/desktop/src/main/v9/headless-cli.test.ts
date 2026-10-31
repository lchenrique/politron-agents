import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HeadlessCliRuntime, openCodeToolConfig } from './headless-cli'
import type { Agent } from '../../shared/v9'

const dirs: string[] = []
const agent = {
  id: 'smoke', name: 'Smoke', alias: 'smoke', description: '', instructions: 'Teste.',
  runtime: 'opencode', model: 'oc/free-model', color: '#fff', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
} satisfies Agent
afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('adaptação segura dos CLIs em modo conversa', () => {
  it('preserva provedores de ambiente sem herdar permissões para ferramentas nativas', () => {
    const result = JSON.parse(openCodeToolConfig(JSON.stringify({ provider: { custom: { models: { exact: {} } } }, permission: { '*': 'allow' } })))
    expect(result.provider.custom.models).toEqual({ exact: {} })
    expect(result.permission).toEqual({ '*': 'ask' })
    expect(result.agent['politron-safe'].permission).toEqual({ '*': 'ask' })
    expect(result.agent['politron-safe'].tools).toEqual({ '*': false })
    expect(JSON.parse(openCodeToolConfig(undefined, 'opencode/big-pickle')).small_model).toBe('opencode/big-pickle')
    expect(() => openCodeToolConfig('{broken')).toThrow('OPENCODE_CONFIG_CONTENT deve conter um objeto JSON válido.')
  })

  it.each(['opencode', 'antigravity'] as const)('entrega ferramentas ao broker e só continua após o resultado: %s', kind => {
    const runtime = new HeadlessCliRuntime(kind, tmpdir())
    const write = vi.fn()
    const session = { id: 'thread', agent, history: [], tools: [{ type: 'function', name: 'propose_boos', description: 'Propõe Boos.', inputSchema: { type: 'object' } }], instructions: '', text: '', raw: '', steps: 0, turnId: 'turn', finished: false, stopping: false, child: { stdin: { write }, kill: vi.fn() } }
    const events: any[] = []
    runtime.on('event', event => events.push(event))
    const internal = runtime as any
    internal.sessions.set(session.id, session)
    const action = { action: 'tool', tool: 'propose_boos', arguments: JSON.stringify({ agents: [{ name: 'Íris', instructions: 'Revise a interface.' }] }), text: '' }
    if (kind === 'antigravity') internal.receive(session, { event: 'result', result: { status: 'SUCCESS', structured_output: action } })
    else { internal.receive(session, { type: 'text', part: { text: JSON.stringify(action) } }); internal.receive(session, { type: 'step_finish' }) }
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ method: 'item/tool/call', params: { threadId: 'thread', turnId: 'turn', tool: 'propose_boos', arguments: { agents: [{ name: 'Íris', instructions: 'Revise a interface.' }] } } })
    expect(session.finished).toBe(false)
    expect(write).not.toHaveBeenCalled()
    // Usa a resposta do broker real: nunca transforma uma proposta em criação por conta própria.
    internal.resumeTool = vi.fn()
    runtime.respond(events[0].id, { success: true, contentItems: [{ text: 'Proposta negada pelo usuário.' }] })
    expect(internal.resumeTool).toHaveBeenCalledWith(session, expect.stringContaining('Proposta negada pelo usuário.'))
    runtime.close()
  })

  it('recusa ferramenta que não foi oferecida, sem interpretar uma resposta livre como execução', () => {
    const runtime = new HeadlessCliRuntime('antigravity', tmpdir())
    const events: any[] = []
    runtime.on('event', event => events.push(event))
    const state = { id: 'thread', agent, tools: [{ name: 'group_members' }], text: '', raw: '', history: [], steps: 0, turnId: 'turn', finished: false, stopping: false }
    ;(runtime as any).receive(state, { event: 'result', result: { status: 'SUCCESS', structured_output: { action: 'tool', tool: 'propose_boos', arguments: '{}', text: '' } } })
    expect(events.some(event => event.method === 'item/tool/call')).toBe(false)
    expect(events.at(-1).params.turn.status).toBe('failed')
    runtime.close()
  })

  it.each(['opencode', 'antigravity'] as const)('cancelamento invalida respostas tardias de ferramenta: %s', async kind => {
    const runtime = new HeadlessCliRuntime(kind, tmpdir())
    const internal = runtime as any
    const session = { id: 'thread', agent, tools: [{ name: 'group_members' }], text: '', raw: '', history: [], steps: 0, turnId: 'turn', finished: false, stopping: false }
    internal.sessions.set(session.id, session)
    internal.structuredResult(session, { action: 'tool', tool: 'group_members', arguments: '{}', text: '' })
    const pending = [...internal.pendingTools.keys()][0]
    internal.resumeTool = vi.fn()
    await runtime.interrupt('thread', 'turn')
    runtime.respond(pending, { success: true, contentItems: [{ text: 'Resultado tardio' }] })
    expect(internal.resumeTool).not.toHaveBeenCalled()
    expect(internal.pendingTools.size).toBe(0)
    runtime.close()
  })

  it('resposta livre não é considerada execução quando há ferramentas', () => {
    const runtime = new HeadlessCliRuntime('antigravity', tmpdir())
    const events: any[] = []
    runtime.on('event', event => events.push(event))
    const session = { id: 'thread', agent, tools: [{ name: 'propose_boos' }], text: '', raw: '', history: [], steps: 0, turnId: 'turn', finished: false, stopping: false }
    ;(runtime as any).receive(session, { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'Criei a equipe.' } })
    ;(runtime as any).receive(session, { event: 'result', result: { status: 'SUCCESS', response: 'Criei a equipe.' } })
    expect(events.some(event => event.method === 'item/agentMessage/delta')).toBe(false)
    expect(events.at(-1).params.turn.status).toBe('failed')
    runtime.close()
  })

  it.each(['opencode', 'antigravity'] as const)('resolve o executável e cria sessão sem iniciar uma inferência: %s', async kind => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-cli-probe-'))
    dirs.push(directory)
    const runtime = new HeadlessCliRuntime(kind, directory)
    try {
      const thread = await runtime.thread({ ...agent, runtime: kind }, directory, [])
      expect(thread.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(thread.history).toBe('empty')
    } finally { runtime.close() }
  }, 18000)

  it('traduz eventos de texto e fim de turno de ambos os protocolos para o Politron', () => {
    for (const kind of ['opencode', 'antigravity'] as const) {
      const runtime = new HeadlessCliRuntime(kind, tmpdir())
      const events: Record<string, unknown>[] = []
      runtime.on('event', event => events.push(event))
      const session = { id: 'thread', agent, history: [], text: '', turnId: 'turn', finished: false, stopping: false }
      const internal = runtime as unknown as { receive(s: typeof session, p: Record<string, unknown>): void; finish(s: typeof session, status: 'completed'): void }
      if (kind === 'opencode') {
        internal.receive(session, { type: 'text', part: { text: 'olá' } })
        internal.finish(session, 'completed')
      } else {
        internal.receive(session, { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'olá' } })
        internal.receive(session, { event: 'result', result: { status: 'SUCCESS' } })
      }
      expect(events.map(event => event.method)).toEqual(['item/agentMessage/delta', 'item/completed', 'turn/completed'])
      expect((events.at(-1) as any).params.turn.status).toBe('completed')
      runtime.close()
    }
  })
})

describe('Antigravity: falhas do CLI chegam ao usuário em vez de "pensando" infinito', () => {
  type Ev = { method?: string; params: { turn?: { status: string; error: { message: string } }; item?: { text: string } } }
  const withBinary = (runtime: HeadlessCliRuntime) => { (runtime as unknown as { binary: string }).binary = 'agy' }
  const antigravityAgent = { ...agent, runtime: 'antigravity', model: 'gemini-3.8-flash-low' } satisfies Agent
  type Fake = ReturnType<typeof fakeChild>
  function fakeChild() {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: EventEmitter & { write: Mock; end: Mock }; kill: Mock }
    child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() })
    child.kill = vi.fn()
    return child
  }
  async function run(script: (child: Fake) => void, inactivityMs = 60_000) {
    const child = fakeChild()
    const spawnMock = vi.fn(() => { setTimeout(() => script(child), 5); return child })
    const runtime = new HeadlessCliRuntime('antigravity', tmpdir(), { spawn: spawnMock as unknown as typeof spawn, inactivityMs })
    ;withBinary(runtime)
    const events: Ev[] = []
    const done = new Promise<NonNullable<Ev['params']['turn']>>(resolve => runtime.on('event', event => { events.push(event); if (event.method === 'turn/completed') resolve(event.params.turn!) }))
    const thread = await runtime.thread(antigravityAgent, tmpdir(), [])
    await runtime.send(thread.id, 'oi', antigravityAgent.model)
    const turn = await done
    runtime.close()
    return { turn, events, child, args: (spawnMock.mock.calls[0] as unknown as [string, string[]])[1] }
  }

  it('responde normalmente: entrega o texto e conclui o turno', async () => {
    const { turn, events, args } = await run(child => {
      child.stdout.write(JSON.stringify({ event: 'init', init: { model: 'gemini-3.8-flash-low' } }) + '\n')
      child.stdout.write(JSON.stringify({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'ok' } }) + '\n')
      child.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok\n' } }) + '\n')
    })
    expect(turn.status).toBe('completed')
    expect(events.find(event => event.method === 'item/completed')?.params.item?.text).toBe('ok')
    expect(args).toEqual(expect.arrayContaining(['--model', 'gemini-3.8-flash-low', '--output-format', 'stream-json']))
  })

  it('processo que trava: falha por inatividade com mensagem clara e encerra o CLI', async () => {
    const { turn, child } = await run(() => { /* nenhuma saída */ }, 80)
    expect(turn.status).toBe('failed')
    expect(turn.error.message).toMatch(/Antigravity ficou \d+s sem responder/)
    expect(turn.error.message).toContain('instalado, autenticado')
    expect(child.kill).toHaveBeenCalled()
  })

  it('travado depois de avisar no stderr: a mensagem inclui o que o CLI escreveu', async () => {
    const { turn } = await run(child => child.stderr.write('please sign in at https://example.test/login'), 80)
    expect(turn.status).toBe('failed')
    expect(turn.error.message).toContain('please sign in')
  })

  it('saída com código diferente de zero mostra o stderr', async () => {
    const { turn } = await run(child => { child.stderr.write('error: not logged in\n'); setTimeout(() => child.emit('close', 1), 5) })
    expect(turn.status).toBe('failed')
    expect(turn.error.message).toBe('error: not logged in')
  })

  it('código zero sem resposta mostra o texto não-JSON recebido no stdout', async () => {
    const { turn } = await run(child => { child.stdout.write('Login required\n'); setTimeout(() => child.emit('close', 0), 5) })
    expect(turn.status).toBe('failed')
    expect(turn.error.message).toContain('O CLI encerrou sem produzir uma resposta.')
    expect(turn.error.message).toContain('Login required')
  })

  it('resultado de erro do CLI (ex.: modelo inválido) é propagado', async () => {
    const { turn } = await run(child => child.stdout.write(JSON.stringify({ event: 'result', result: { status: 'ERROR', error: 'invalid model selection' } }) + '\n'))
    expect(turn.status).toBe('failed')
    expect(turn.error.message).toBe('invalid model selection')
  })

  it('não dispara a inatividade enquanto aguarda o resultado de uma ferramenta do Boobot', async () => {
    const child = fakeChild()
    const runtime = new HeadlessCliRuntime('antigravity', tmpdir(), { spawn: vi.fn(() => child) as unknown as typeof spawn, inactivityMs: 40 })
    ;withBinary(runtime)
    const events: Ev[] = []
    runtime.on('event', event => events.push(event))
    const tools = [{ type: 'function', name: 'group_members', description: '', inputSchema: { type: 'object' } }] as never
    const thread = await runtime.thread(antigravityAgent, tmpdir(), tools)
    await runtime.send(thread.id, 'oi', antigravityAgent.model)
    child.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', structured_output: { action: 'tool', tool: 'group_members', arguments: '{}', text: '' } } }) + '\n')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(events.some(event => event.method === 'item/tool/call')).toBe(true)
    expect(events.some(event => event.method === 'turn/completed')).toBe(false)
    runtime.close()
  })

  it('fecha o stdin a cada turno e devolve o resultado da ferramenta num processo que retoma a conversa do agy', async () => {
    const children = [fakeChild(), fakeChild()]
    const spawnMock = vi.fn(() => children[spawnMock.mock.calls.length - 1]!)
    const runtime = new HeadlessCliRuntime('antigravity', tmpdir(), { spawn: spawnMock as unknown as typeof spawn, inactivityMs: 60_000 })
    ;withBinary(runtime)
    const events: Ev[] = []
    const done = new Promise<NonNullable<Ev['params']['turn']>>(resolve => runtime.on('event', event => { events.push(event); if (event.method === 'turn/completed') resolve(event.params.turn!) }))
    const tools = [{ type: 'function', name: 'group_members', description: '', inputSchema: { type: 'object' } }] as never
    const thread = await runtime.thread(antigravityAgent, tmpdir(), tools)
    await runtime.send(thread.id, 'oi', antigravityAgent.model)
    const first = children[0]!
    // Sem o fim do stdin o agy no Windows não processa a mensagem.
    expect(first.stdin.end).toHaveBeenCalledWith(expect.stringContaining('"event":"user"'))
    first.stdout.write(JSON.stringify({ event: 'init', conversation_id: 'conv-1' }) + '\n')
    first.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', structured_output: { action: 'tool', tool: 'group_members', arguments: '{}', text: '' } } }) + '\n')
    await vi.waitFor(() => expect(events.some(event => event.method === 'item/tool/call')).toBe(true))
    first.emit('close', 0)
    const call = events.find(event => event.method === 'item/tool/call') as unknown as { id: string }
    runtime.respond(call.id, { success: true, contentItems: [{ type: 'inputText', text: '[]' }] })
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))
    const args = (spawnMock.mock.calls[1] as unknown as [string, string[]])[1]
    expect(args).toEqual(expect.arrayContaining(['--conversation', 'conv-1']))
    const second = children[1]!
    expect(second.stdin.end).toHaveBeenCalledWith(expect.stringContaining('Resultado real da ferramenta'))
    second.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', structured_output: { action: 'final', tool: 'none', arguments: '{}', text: 'pronto' } } }) + '\n')
    expect((await done).status).toBe('completed')
    runtime.close()
  })

  it('turno longo que continua emitindo saída não é morto pelo vigia', async () => {
    const { turn } = await run(child => {
      let n = 0
      const tick = setInterval(() => {
        child.stdout.write(JSON.stringify({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: '.' } }) + '\n')
        if (++n === 6) { clearInterval(tick); child.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '......' } }) + '\n') }
      }, 40)
    }, 120)
    expect(turn.status).toBe('completed')
  })

  it('limpa o vigia ao concluir, interromper e falhar (sem timers pendentes)', async () => {
    const idleOf = (runtime: HeadlessCliRuntime, id: string) => (runtime as unknown as { sessions: Map<string, { idle?: unknown }> }).sessions.get(id)?.idle
    const make = () => {
      const child = fakeChild()
      const runtime = new HeadlessCliRuntime('antigravity', tmpdir(), { spawn: vi.fn(() => child) as unknown as typeof spawn, inactivityMs: 60_000 })
      withBinary(runtime)
      return { child, runtime }
    }
    const completed = make()
    const t1 = await completed.runtime.thread(antigravityAgent, tmpdir(), [])
    const sent = await completed.runtime.send(t1.id, 'oi', antigravityAgent.model)
    expect(idleOf(completed.runtime, t1.id)).toBeDefined()
    completed.child.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok' } }) + '\n')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(idleOf(completed.runtime, t1.id)).toBeUndefined()
    completed.runtime.close()
    const interrupted = make()
    const t2 = await interrupted.runtime.thread(antigravityAgent, tmpdir(), [])
    const turn = await interrupted.runtime.send(t2.id, 'oi', antigravityAgent.model)
    await interrupted.runtime.interrupt(t2.id, turn.turn.id)
    expect(idleOf(interrupted.runtime, t2.id)).toBeUndefined()
    expect(interrupted.child.kill).toHaveBeenCalled()
    interrupted.runtime.close()
    expect(sent.turn.status).toBe('inProgress')
  })
})
