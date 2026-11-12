// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { listOpenCodeModels, OpenCodeApiRuntime, openCodeHttpError, openCodeTools } from './opencode-api'
import type { Agent } from '../../shared/v9'

const agent = {
  id: 'opencode-1', name: 'Boo', alias: 'boo', description: '', instructions: 'Seja breve.',
  runtime: 'opencode', model: 'big-pickle', color: '#fff', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
} satisfies Agent

const key = async () => 'chave-de-teste-com-tamanho-valido'
const encoder = new TextEncoder()
const sse = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close() },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } })
const packet = (value: Record<string, unknown>) => `data: ${JSON.stringify(value)}\n\n`

async function run(chunks: string[], options: { key?: () => Promise<string | null>; tools?: Parameters<OpenCodeApiRuntime['thread']>[2] } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown>, headers: init.headers as Record<string, string> })
    return sse(chunks)
  })
  const runtime = new OpenCodeApiRuntime(options.key ?? key, { fetch: fetchMock as unknown as typeof fetch })
  const events: Array<{ method?: string; params?: Record<string, unknown>; id?: string }> = []
  runtime.on('event', (event: { method?: string; params?: Record<string, unknown>; id?: string }) => events.push(event))
  const thread = await runtime.thread(agent, '', options.tools ?? [])
  const sent = await runtime.send(thread.id, 'oi', 'big-pickle')
  return { runtime, events, calls, thread, sent }
}

const completed = async (events: Array<{ method?: string }>) => {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const done = events.find(event => event.method === 'turn/completed')
    if (done) return done as { params: { turn: { status: string; error?: { message: string } } } }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('turno não terminou')
}

describe('OpenCode por API key', () => {
  it('envia para o Console com Bearer e transmite o texto até concluir', async () => {
    const { events, calls } = await run([
      packet({ choices: [{ delta: { content: 'olá' } }] }),
      packet({ choices: [{ delta: { content: ', mundo' } }] }),
      packet({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ])
    const turn = await completed(events)
    expect(turn.params.turn.status).toBe('completed')
    expect(events.filter(event => event.method === 'item/agentMessage/delta').map(event => (event.params as { delta: string }).delta)).toEqual(['olá', ', mundo'])
    expect(calls[0].url).toBe('https://opencode.ai/inference/openai/v1/chat/completions')
    expect(calls[0].headers.authorization).toBe('Bearer chave-de-teste-com-tamanho-valido')
    expect(calls[0].body).toMatchObject({ model: 'big-pickle', stream: true })
  })

  it('pede a ferramenta pelo broker e continua com o resultado real', async () => {
    const tool = [{ type: 'function' as const, name: 'group_members', description: 'Lista', inputSchema: { type: 'object' } }]
    let round = 0
    const calls: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      round++
      if (round === 1) return sse([
        packet({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'group_members', arguments: '{"a":' } }] } }] }),
        packet({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] }, finish_reason: 'tool_calls' }] }),
      ])
      return sse([packet({ choices: [{ delta: { content: 'feito' } }] }), packet({ choices: [{ delta: {}, finish_reason: 'stop' }] })])
    })
    const runtime = new OpenCodeApiRuntime(key, { fetch: fetchMock as unknown as typeof fetch })
    const events: Array<{ method?: string; params?: Record<string, unknown>; id?: string }> = []
    runtime.on('event', (event: { method?: string; params?: Record<string, unknown>; id?: string }) => events.push(event))
    const thread = await runtime.thread(agent, '', tool)
    await runtime.send(thread.id, 'oi', 'big-pickle')
    await vi.waitFor(() => expect(events.some(event => event.method === 'item/tool/call')).toBe(true))
    const call = events.find(event => event.method === 'item/tool/call')!
    expect(call.params).toMatchObject({ tool: 'group_members', arguments: { a: 1 } })
    expect(calls[0].tools).toEqual(openCodeTools(tool))
    runtime.respond(call.id!, { success: true, contentItems: [{ text: '[]' }] })
    const turn = await completed(events)
    expect(turn.params.turn.status).toBe('completed')
    // A segunda chamada carrega a mensagem do assistente com o tool_call e o resultado da ferramenta.
    const messages = calls[1].messages as Array<Record<string, unknown>>
    expect(messages.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function' }] })
    expect(messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call-1' })
    expect(String((messages.at(-1) as { content: string }).content)).toContain('contentItems')
  })

  it('chave recusada vira mensagem clara, sem inventar resposta', async () => {
    const runtime = new OpenCodeApiRuntime(key, { fetch: vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch })
    const events: Array<{ method?: string; params?: Record<string, unknown> }> = []
    runtime.on('event', (event: { method?: string; params?: Record<string, unknown> }) => events.push(event))
    const thread = await runtime.thread(agent, '', [])
    await runtime.send(thread.id, 'oi', 'big-pickle')
    const turn = await completed(events) as unknown as { params: { turn: { status: string; error: { message: string } } } }
    expect(turn.params.turn.status).toBe('failed')
    expect(turn.params.turn.error.message).toMatch(/chave da API do OpenCode foi recusada/i)
  })

  it('sem chave salva, o envio explica onde configurar', async () => {
    const runtime = new OpenCodeApiRuntime(async () => null, { fetch: vi.fn() as unknown as typeof fetch })
    const thread = await runtime.thread(agent, '', [])
    await expect(runtime.send(thread.id, 'oi', 'big-pickle')).rejects.toThrow(/Configurações → Provedores/)
  })

  it('consulta o catálogo do Console e mapeia id/nome', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'big-pickle', name: 'Big Pickle' }, { id: 'claude-sonnet-5-5' }] }), { status: 200 }))
    const models = await listOpenCodeModels('chave-de-teste', fetchMock as unknown as typeof fetch)
    expect(models).toEqual([
      { id: 'big-pickle', name: 'Big Pickle', runtime: 'opencode', isDefault: false, supportedEfforts: [] },
      { id: 'claude-sonnet-5-5', name: 'claude-sonnet-5-5', runtime: 'opencode', isDefault: false, supportedEfforts: [] },
    ])
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://opencode.ai/inference/v1/models')
  })

  it('traduz os erros HTTP do Console', () => {
    expect(openCodeHttpError(402)).toMatch(/sem créditos/)
    expect(openCodeHttpError(404)).toMatch(/não existe no OpenCode/)
    expect(openCodeHttpError(429)).toMatch(/limitou as requisições/)
    expect(openCodeHttpError(500)).toBe('O OpenCode respondeu com erro 500.')
  })
})
