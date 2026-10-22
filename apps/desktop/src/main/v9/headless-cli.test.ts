import { afterEach, describe, expect, it, vi } from 'vitest'
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
