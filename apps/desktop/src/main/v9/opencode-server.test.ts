// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { OpenCodeServerRuntime, openCodeServerConfig, openCodeModelRef } from './opencode-server'
import type { Agent } from '../../shared/v9'

const agent = {
  id: 'test', name: 'Test', alias: 'test', description: '', instructions: '',
  runtime: 'opencode', model: 'test/free', color: '#fff', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
} satisfies Agent
let server: Server | undefined
let runtime: OpenCodeServerRuntime | undefined
afterEach(async () => {
  runtime?.close(); runtime = undefined
  if (server) { await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined }
})

async function fakeOpenCode() {
  const calls: Array<{ method: string; path: string; json: any; auth?: string }> = []
  let turns = 0
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let json: any
      try { json = raw ? JSON.parse(raw) : undefined } catch {}
      calls.push({ method: req.method || '', path: req.url || '', json, auth: req.headers.authorization })
      const url = new URL(req.url || '/', 'http://localhost')
      const send = (value: unknown, code = 200) => {
        res.writeHead(code, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      if (url.pathname === '/session' && req.method === 'POST') return send({ id: 'sess-1' })
      if (url.pathname === '/session/sess-1' && req.method === 'GET') return send({ id: 'sess-1' })
      if (url.pathname === '/session/sess-1/message' && req.method === 'POST') {
        turns++
        if (turns === 1) return send({ info: { role: 'assistant' }, parts: [{ type: 'text',
          text: JSON.stringify({ action: 'tool', tool: 'group_members', arguments: '{}', text: '' }) }] })
        return send({ info: { role: 'assistant' }, parts: [{ type: 'text',
          text: JSON.stringify({ action: 'final', tool: 'none', arguments: '{}', text: 'Equipe consultada.' }) }] })
      }
      if (url.pathname === '/session/sess-1/abort') return send(true)
      send({ message: 'Not found' }, 404)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Port missing')
  runtime = new OpenCodeServerRuntime(tmpdir())
  const internal = runtime as unknown as { connecting: Promise<void>; base: string; secret: string }
  internal.connecting = Promise.resolve()
  internal.base = 'http://127.0.0.1:' + address.port
  internal.secret = 'test-password'
  return { runtime, calls }
}

describe('servidor OpenCode isolado e broker do Boobot', () => {
  it('desliga ferramentas nativas mesmo com permissÃµes herdadas', () => {
    const result = JSON.parse(openCodeServerConfig(JSON.stringify({ permission: { '*': 'allow' }, mcp: { unsafe: { type: 'local' } }, plugin: ['unsafe'], provider: { custom: {} } })))
    expect(result.permission).toEqual({ '*': 'deny' })
    expect(result.agent['politron-safe'].permission).toEqual({ '*': 'deny' })
    expect(result.agent['politron-safe'].tools).toEqual({ '*': false })
    expect(result.plugin).toEqual([])
    expect(result.mcp).toEqual({})
    expect(result.provider).toEqual({ custom: {} })
    expect(openCodeModelRef('opencode/beam-free')).toEqual({ providerID: 'opencode', modelID: 'beam-free' })
    expect(() => openCodeModelRef('beam-free')).toThrow(/provedor\/modelo/)
  })

  it('reutiliza sessÃ£o HTTP entre chamadas de ferramenta, mediadas pelo broker', async () => {
    const { runtime: app, calls } = await fakeOpenCode()
    const tools = [{ type: 'function' as const, name: 'group_members', description: 'Lista equipe', inputSchema: { type: 'object' } }]
    const thread = await app.thread(agent, 'D:/workspace-isolado', tools)
    expect(thread).toEqual({ id: 'sess-1', history: 'empty' })
    const events: any[] = []
    app.on('event', event => {
      events.push(event)
      if (event.method === 'item/tool/call') app.respond(event.id, { success: true, contentItems: [{ type: 'inputText', text: '2 agentes' }] })
    })
    const completed = new Promise<any>(resolve => {
      app.on('event', event => { if (event.method === 'turn/completed') resolve(event) })
    })
    const accepted = await app.send(thread.id, 'Liste os agentes.', 'test/free')
    expect(accepted.turn.status).toBe('inProgress')
    const terminal = await completed
    expect(terminal.params.turn.status).toBe('completed')
    expect(events.some(event => event.method === 'item/tool/call')).toBe(true)
    expect(events.some(event => event.method === 'item/agentMessage/delta' && event.params.delta === 'Equipe consultada.')).toBe(true)
    const messages = calls.filter(call => call.path.startsWith('/session/sess-1/message'))
    expect(messages).toHaveLength(2)
    expect(messages.every(call => call.json.agent === 'politron-safe' && call.json.tools['*'] === false)).toBe(true)
    expect(messages[0].json.model).toEqual({ providerID: 'test', modelID: 'free' })
    expect(messages[1].json.parts[0].text).toContain('2 agentes')
    expect(messages[0].auth).toMatch(/^Basic /)
    expect((await app.thread(agent, 'D:/workspace-isolado', tools, 'sess-1')).history).toBe('retained')
  })

  it('recusa sessÃ£o perdida sem recriÃ¡-la por engano', async () => {
    const { runtime: app } = await fakeOpenCode()
    await expect(app.thread(agent, 'D:/workspace-isolado', [], 'not-found')).rejects.toThrow(/sessÃ£o|SessÃ£o|runtime/i)
  })

  it('entrega apenas delta novo no stream SSE', () => {
    const app = new OpenCodeServerRuntime(tmpdir())
    runtime = app
    const internal = app as any
    const state: any = { id: 'stream', turn: 'turn-1', cwd: 'D:/project', agent, instructions: '',
      tools: [], text: '', parts: new Map(), request: new AbortController(), steps: 0 }
    internal.sessions.set(state.id, state)
    const events: any[] = []
    app.on('event', item => events.push(item))
    const update = (text: string) => internal.onStreamEvent({ type: 'message.part.updated',
      properties: { part: { type: 'text', sessionID: 'stream', id: 'part-1', text } } })
    update('Ola')
    update('Ola')
    update('Ola, mundo!')
    expect(events.map(item => item.params.delta)).toEqual(['Ola', ', mundo!'])
    state.tools = [{ type: 'function', name: 'read', description: '', inputSchema: {} }]
    update('{action:tool}')
    expect(events).toHaveLength(2)
  })

})
