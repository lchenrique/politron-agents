// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TelegramService, type TelegramHost } from './service'
import { escapeHtml, telegramChunks } from './format'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: { fromWebContents: vi.fn() }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() } }))

const TOKEN = '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APPROVAL_ID = '11111111-1111-4111-8111-111111111111'
const CONV = '22222222-2222-4222-8222-222222222222'
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

type Call = { method: string; body: Record<string, unknown> }
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }))
const fail = (code: number, description = 'x') => new Response(JSON.stringify({ ok: false, error_code: code, description }), { status: code })

function setup(opts: { now?: () => number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'boobot-tg-')); dirs.push(dir)
  const calls: Call[] = []
  const queue: Response[] = []
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const method = String(url).split('/').pop()!
    calls.push({ method, body: JSON.parse(String(init.body)) })
    const next = queue.shift()
    if (next) return next
    if (method === 'getMe') return ok({ username: 'boobot_bot' })
    if (method === 'sendMessage') return ok({ message_id: calls.length })
    return ok(true)
  }) as unknown as typeof fetch
  const approval: { status: string } & Record<string, unknown> = { id: APPROVAL_ID, runId: 'r', conversationId: CONV, agentId: 'a', kind: 'command', details: { command: 'ls <x>' }, status: 'pending' }
  const host = Object.assign(new EventEmitter(), {
    snapshot: vi.fn(() => ({ agents: [{ id: 'chief', name: 'Chief', role: 'chief' }], conversations: [{ id: CONV, name: 'Chief', kind: 'direct', agentIds: ['chief'], archived: false, createdAt: '2026-01-01' }], runs: [], approvals: [] })),
    send: vi.fn(async () => undefined), saveConversation: vi.fn(() => ({ id: CONV })),
    respondApproval: vi.fn(async () => { approval.status = 'approved' }), reviewPlan: vi.fn(), answerQuestion: vi.fn(),
    store: { approval: () => approval, agent: () => ({ name: 'Chief' }), conversation: () => ({ id: CONV, name: 'Chief', archived: false }) },
  }) as unknown as TelegramHost & EventEmitter
  const memory = { v: null as string | null, has: async () => memory.v !== null, load: async () => memory.v, save: async (x: string) => { memory.v = x }, clear: async () => { memory.v = null } }
  const service = new TelegramService(dir, host, { token: memory, fetcher, now: opts.now })
  return { dir, calls, queue, host, service, approval, memory }
}
type S = ReturnType<typeof setup>
const msg = (id: number, chat: number, text: string) => ({ update_id: id, message: { message_id: id, chat: { id: chat, type: 'private', first_name: 'Carlos' }, from: { id: chat }, text } })
const callback = (id: number, from: number, data: string) => ({ update_id: id, callback_query: { id: 'q', from: { id: from }, data, message: { message_id: 50, chat: { id: from, type: 'private' } } } })
const sent = (calls: Call[]) => calls.filter(c => c.method === 'sendMessage').map(c => c.body.text as string)
async function pollWith(s: S, ...updates: unknown[]) { s.queue.push(ok(updates)); return s.service.pollOnce() }
async function ready(s: S) { await s.service.start(false); await s.service.saveToken(TOKEN); s.service.stop(); s.calls.length = 0 }
async function pair(s: S, chat = 7) { const { code } = s.service.createPairingCode().pairing!; await pollWith(s, msg(1, chat, `/parear ${code}`)); s.calls.length = 0 }

describe('pareamento', () => {
  it('código certo pareia, com /start <código>, e o código é de uso único', async () => {
    const s = setup(); await ready(s)
    const { code, link } = s.service.createPairingCode().pairing!
    expect(link).toBe(`https://t.me/boobot_bot?start=${code}`)
    await pollWith(s, msg(1, 7, `/start ${code}`))
    expect(s.service.status().chats).toEqual([expect.objectContaining({ id: 7, name: 'Carlos' })])
    await pollWith(s, msg(2, 8, `/parear ${code}`))
    expect(s.service.status().chats).toHaveLength(1)
  })
  it('/parear também funciona', async () => {
    const s = setup(); await ready(s); await pair(s)
    expect(s.service.status().chats).toHaveLength(1)
  })
  it('código errado e código expirado não pareiam', async () => {
    let t = 1_000_000; const s = setup({ now: () => t }); await ready(s)
    const { code } = s.service.createPairingCode().pairing!
    await pollWith(s, msg(1, 7, '/parear ERRADO12'))
    expect(s.service.status().chats).toHaveLength(0)
    t += 11 * 60_000
    await pollWith(s, msg(2, 7, `/parear ${code}`))
    expect(s.service.status().chats).toHaveLength(0)
    expect(sent(s.calls).join()).toMatch(/expirou/)
  })
  it('bloqueia força bruta depois de 5 erros, mesmo com o código certo', async () => {
    const s = setup(); await ready(s)
    const { code } = s.service.createPairingCode().pairing!
    for (let i = 0; i < 5; i++) await pollWith(s, msg(i + 1, 7, '/parear ERRADO12'))
    await pollWith(s, msg(9, 7, `/parear ${code}`))
    expect(s.service.status().chats).toHaveLength(0)
  })
  it('/start sem código mostra a ajuda; chat não autorizado é ignorado, com um único aviso', async () => {
    const s = setup(); await ready(s); await pair(s)
    await pollWith(s, msg(5, 7, '/start'))
    expect(sent(s.calls)[0]).toContain('Boobot no Telegram')
    s.calls.length = 0
    await pollWith(s, msg(6, 99, 'oi'), msg(7, 99, 'oi de novo'))
    expect(s.host.send).not.toHaveBeenCalled()
    expect(sent(s.calls)).toHaveLength(1)
  })
  it('ignora chats que não são privados', async () => {
    const s = setup(); await ready(s)
    await pollWith(s, { update_id: 1, message: { message_id: 1, chat: { id: -5, type: 'group' }, from: { id: 7 }, text: 'oi' } })
    expect(sent(s.calls)).toHaveLength(0)
  })
})

describe('conversa', () => {
  it('texto de chat pareado vai pelo send do desktop', async () => {
    const s = setup(); await ready(s); await pair(s)
    await pollWith(s, msg(2, 7, 'faça isso'))
    expect(s.host.send).toHaveBeenCalledWith(CONV, 'faça isso', undefined, undefined, undefined, false, true, false, expect.objectContaining({ delivery: 'queue', returnAfterAcceptance: true }))
    expect(s.calls.some(c => c.method === 'sendChatAction')).toBe(true)
    s.service.dispose()
  })
  it('resposta final volta dividida em blocos de até 4096', async () => {
    const s = setup(); await ready(s); await pair(s)
    await pollWith(s, msg(2, 7, 'oi')); s.service.stop(); s.calls.length = 0
    ;(s.service as unknown as { data: { enabled: boolean }; botUsername: string }).data.enabled = true
    const text = Array.from({ length: 300 }, (_, i) => `linha ${i} ` + 'x'.repeat(40)).join('\n')
    s.host.emit('workspace-event', { type: 'message', message: { id: 'm', conversationId: CONV, role: 'assistant', status: 'completed', author: 'Chief', text, finishedAt: 'x' } })
    await vi.waitFor(() => expect(sent(s.calls).length).toBeGreaterThan(2))
    expect(sent(s.calls).every(t => t.length <= 4096)).toBe(true)
    s.service.dispose()
  })
})

describe('aprovações', () => {
  async function withApproval() {
    const s = setup(); await ready(s); await pair(s)
    ;(s.service as unknown as { data: { enabled: boolean }; botUsername: string }).data.enabled = true
    s.host.emit('workspace-event', { type: 'approval', approval: s.approval })
    await vi.waitFor(() => expect(sent(s.calls)).toHaveLength(1))
    return s
  }
  it('envia botões, escapa HTML e resolve pelo callback', async () => {
    const s = await withApproval()
    const body = s.calls.find(c => c.method === 'sendMessage')!.body as { text: string; reply_markup: { inline_keyboard: { text: string }[][] } }
    expect(body.text).toContain('ls &lt;x&gt;')
    expect(body.reply_markup.inline_keyboard[0].map((b: { text: string }) => b.text)).toEqual(['Aprovar', 'Recusar'])
    await pollWith(s, callback(3, 7, `a:${APPROVAL_ID}:1`))
    expect(s.host.respondApproval).toHaveBeenCalledWith(APPROVAL_ID, true, true)
  })
  it('chat não autorizado não resolve', async () => {
    const s = await withApproval()
    await pollWith(s, callback(3, 99, `a:${APPROVAL_ID}:1`))
    expect(s.host.respondApproval).not.toHaveBeenCalled()
  })
  it('aprovação já resolvida não é resolvida de novo e a mensagem é editada', async () => {
    const s = await withApproval()
    s.approval.status = 'denied'
    await pollWith(s, callback(3, 7, `a:${APPROVAL_ID}:1`))
    expect(s.host.respondApproval).not.toHaveBeenCalled()
    expect((s.calls.find(c => c.method === 'editMessageText')!.body.text as string)).toContain('recusada')
  })
})

describe('polling', () => {
  it('persiste o offset e o retoma depois de reiniciar', async () => {
    const s = setup(); await ready(s)
    await pollWith(s, msg(41, 99, 'x'))
    expect(JSON.parse(readFileSync(join(s.dir, 'telegram.json'), 'utf8')).offset).toBe(42)
    const again = new TelegramService(s.dir, s.host, { token: s.memory, fetcher: vi.fn(async (_u: string, init: RequestInit) => { s.calls.push({ method: 'again', body: JSON.parse(String(init.body)) }); return ok([]) }) as unknown as typeof fetch })
    await again.start(false); await again.pollOnce()
    expect(s.calls.find(c => c.method === 'again' && c.body.offset !== undefined)!.body.offset).toBe(42)
  })
  it('401 para e mostra erro; 409 espera 30 s; rede usa backoff', async () => {
    const s = setup(); await ready(s)
    ;(s.service as unknown as { data: { enabled: boolean }; botUsername: string }).botUsername = 'b'
    s.queue.push(fail(401)); expect(await s.service.pollOnce()).toBeNull()
    expect(s.service.status()).toMatchObject({ state: 'error', error: expect.stringMatching(/recusou o token/) })
    s.queue.push(fail(409)); expect(await s.service.pollOnce()).toBe(30_000)
    expect(s.service.status().error).toMatch(/Outro programa/)
    s.queue.push(fail(502)); expect(await s.service.pollOnce()).toBe(2000)
    s.queue.push(fail(502)); expect(await s.service.pollOnce()).toBe(4000)
  })
  it('token fica fora do status e do disco em claro', async () => {
    const s = setup(); await ready(s)
    expect(JSON.stringify(s.service.status())).not.toContain('AAAA')
    expect(readFileSync(join(s.dir, 'telegram.json'), 'utf8')).not.toContain('AAAA')
    await expect(s.service.saveToken('lixo')).rejects.toThrow(/token completo/)
  })
})

describe('formatação', () => {
  it('escapa HTML', () => expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'))
  it('converte Markdown e não deixa tags de usuário passarem', () => {
    const [html] = telegramChunks('# T\n**n** `c<1>` <script>\n```\na<b\n```')
    expect(html).toContain('<b>T</b>'); expect(html).toContain('<code>c&lt;1&gt;</code>'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('<pre>a&lt;b</pre>')
  })
  it('divide em blocos de até 4096', () => {
    const chunks = telegramChunks('y'.repeat(10_000))
    expect(chunks.length).toBeGreaterThan(2); expect(chunks.every(c => c.length <= 4096)).toBe(true)
  })
})
