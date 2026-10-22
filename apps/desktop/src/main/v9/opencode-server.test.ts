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
        if (json?.parts?.[0]?.text?.includes('TEST_NATIVE_REJECTED'))
          return send({ info: { role: 'assistant' }, parts: [{ type: 'tool', tool: 'bash', state: { status: 'error' } }] })
        turns++
        if (turns === 1) return send({ info: { role: 'assistant' }, parts: [{ type: 'text',
          text: JSON.stringify({ action: 'tool', tool: 'group_members', arguments: '{}', text: '' }) }] })
        return send({ info: { role: 'assistant' }, parts: [{ type: 'text',
          text: JSON.stringify({ action: 'final', tool: 'none', arguments: '{}', text: 'Equipe consultada.' }) }] })
      }
      if (url.pathname === '/session/sess-1/permissions/per-1' && req.method === 'POST') return send(true)
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
  it('mantém ferramentas nativas visíveis, mas condiciona toda execução à aprovação', () => {
    const result = JSON.parse(openCodeServerConfig(JSON.stringify({ permission: { '*': 'allow' }, mcp: { unsafe: { type: 'local' } }, plugin: ['unsafe'], provider: { custom: {} } })))
    expect(result.permission).toEqual({ '*': 'ask', external_directory: 'deny' })
    expect(result.agent['politron-safe'].permission).toEqual({ '*': 'ask', external_directory: 'deny' })
    expect(result).not.toHaveProperty('tools')
    expect(result.agent['politron-safe']).not.toHaveProperty('tools')
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
    expect(messages.every(call => call.json.agent === 'politron-safe' && !('tools' in call.json))).toBe(true)
    expect(messages[0].json.model).toEqual({ providerID: 'test', modelID: 'free' })
    expect(messages[1].json.parts[0].text).toContain('2 agentes')
    expect(messages[0].auth).toMatch(/^Basic /)
    expect((await app.thread(agent, 'D:/workspace-isolado', tools, 'sess-1')).history).toBe('retained')
  })

  it('rejeita pedidos de ferramenta nativa por HTTP, sem aprovação implícita', async () => {
    const { runtime: app, calls } = await fakeOpenCode()
    const thread = await app.thread(agent, 'D:/workspace-isolado', [])
    const internal = app as any
    internal.sessions.get(thread.id).turn = 'turn-permission'
    internal.onStreamEvent({ type: 'permission.asked', properties: {
      id: 'per-1', sessionID: thread.id, permission: 'bash', patterns: ['*'] } })
    for (let attempt = 0; attempt < 30 && !calls.some(c => c.path.includes('/permissions/per-1')); attempt++)
      await new Promise(resolve => setTimeout(resolve, 20))
    const reply = calls.find(c => c.path.includes('/permissions/per-1'))
    expect(reply?.method).toBe('POST')
    expect(reply?.json).toEqual({ response: 'reject' })
    expect(reply?.auth).toMatch(/^Basic /)
  })

  it('relata claramente tentativa de ferramenta nativa sem texto', async () => {
    const { runtime: app } = await fakeOpenCode()
    const thread = await app.thread(agent, 'D:/workspace-isolado', [])
    const finished = new Promise<any>(resolve => {
      app.on('event', event => { if (event.method === 'turn/completed') resolve(event) })
    })
    await app.send(thread.id, 'TEST_NATIVE_REJECTED', 'test/free')
    const turn = await finished
    expect(turn.params.turn.status).toBe('failed')
    expect(turn.params.turn.error.message).toContain('ferramenta nativa bash')
  })

  it('encaminha ferramenta nativa ao evento do broker e devolve resposta real', async () => {
    const { runtime: app } = await fakeOpenCode()
    const schema = [{ type: 'function' as const, name: 'workspace_read', description: 'Leitura',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]
    const thread = await app.thread(agent, 'D:/workspace-isolado', schema)
    const internal = app as any
    internal.sessions.get(thread.id).turn = 'bridge-turn'
    const bridge = await internal.bridge.start()
    const events: any[] = []
    app.on('event', event => {
      events.push(event)
      if (event.method === 'item/tool/call') {
        app.respond(event.id, { success: true, contentItems: [{ type: 'inputText', text: 'texto verificado' }] })
      }
    })
    const invoke = (name: string) => fetch(bridge.baseUrl + '/sessions/' + thread.id + '/call', {
      method: 'POST', headers: { Authorization: 'Bearer ' + bridge.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, argumentsJson: '{"path":"a.txt"}' })
    })
    expect((await invoke('workspace_write')).status).toBe(403)
    const authorized = await invoke('workspace_read')
    expect(authorized.status).toBe(200)
    const reply = await authorized.json()
    expect(reply.success).toBe(true)
    expect(reply.result.contentItems[0].text).toBe('texto verificado')
    expect(events.filter(e => e.method === 'item/tool/call')).toHaveLength(1)
    internal.finish(internal.sessions.get(thread.id), 'interrupted')
    expect((await invoke('workspace_read')).status).toBe(404)
  })

  it('recusa sessÃ£o perdida sem recriÃ¡-la por engano', async () => {
    const { runtime: app } = await fakeOpenCode()
    await expect(app.thread(agent, 'D:/workspace-isolado', [], 'not-found')).rejects.toThrow(/sessÃ£o|SessÃ£o|runtime/i)
  })

  it('cancela chamadas pendentes sem permitir resposta tardia do broker', async () => {
    const { runtime: app } = await fakeOpenCode()
    const schema = [{ type: 'function' as const, name: 'workspace_read', description: 'Leitura',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }]
    const thread = await app.thread(agent, 'D:/workspace-isolado', schema)
    const internal = app as any
    internal.sessions.get(thread.id).turn = 'turn-cancel'
    const bridge = await internal.bridge.start()
    let toolCallId = ''
    const called = new Promise<void>(resolve => {
      app.on('event', event => {
        if (event.method === 'item/tool/call') { toolCallId = event.id; resolve() }
      })
    })
    const endpoint = bridge.baseUrl + '/sessions/' + thread.id + '/call'
    const req = fetch(endpoint, {
      method: 'POST', headers: { Authorization: 'Bearer ' + bridge.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'workspace_read', argumentsJson: '{"path":"a.txt"}' })
    })
    await called
    expect(internal.nativeCalls.size).toBe(1)
    await app.interrupt(thread.id, 'turn-cancel')
    const result = await req
    expect(result.status).toBe(409)
    expect((await result.json()).error).toContain('Turno encerrado')
    expect(internal.nativeCalls.size).toBe(0)
    app.respond(toolCallId, { success: true, contentItems: [{ type: 'inputText', text: 'não deve ser entregue' }] })
    expect((await fetch(endpoint, {
      method: 'POST', headers: { Authorization: 'Bearer ' + bridge.token },
      body: JSON.stringify({ name: 'workspace_read', argumentsJson: '{}' })
    })).status).toBe(404)
  })

  it('entrega apenas delta novo no stream SSE', () => {
    const app = new OpenCodeServerRuntime(tmpdir())
    runtime = app
    const internal = app as any
    const state: any = { id: 'stream', turn: 'turn-1', cwd: 'D:/project', agent, instructions: '',
      tools: [], text: '', parts: new Map(), assistantMessages: new Set(), request: new AbortController(), steps: 0 }
    internal.sessions.set(state.id, state)
    const events: any[] = []
    app.on('event', item => events.push(item))
    const update = (text: string, role = 'assistant', messageID = 'assistant-1') => {
      internal.onStreamEvent({ type: 'message.updated', properties: {
        info: { id: messageID, sessionID: 'stream', role } } })
      internal.onStreamEvent({ type: 'message.part.updated', properties: {
        part: { type: 'text', sessionID: 'stream', messageID, id: 'part-1', text } } })
    }
    update('Segredo do prompt enviado pelo usuário', 'user', 'user-1')
    expect(events).toHaveLength(0)
    internal.onStreamEvent({ type: 'message.part.updated', properties: {
      part: { type: 'text', sessionID: 'stream', messageID: 'unknown', id: 'part-1', text: 'desconhecido' } } })
    expect(events).toHaveLength(0)
    update('Ola')
    update('Ola')
    update('Ola, mundo!')
    expect(events.map(item => item.params.delta)).toEqual(['Ola', ', mundo!'])
    state.tools = [{ type: 'function', name: 'read', description: '', inputSchema: {} }]
    update('{action:tool}')
    expect(events).toHaveLength(2)
  })

})
