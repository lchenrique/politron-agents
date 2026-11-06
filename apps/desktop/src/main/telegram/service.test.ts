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
    respondApproval: vi.fn(async () => { approval.status = 'approved' }), reviewPlan: vi.fn(), answerQuestion: vi.fn(), answerCard: vi.fn(), stop: vi.fn(async () => undefined),
    store: { approval: () => approval, agent: () => ({ name: 'Chief' }), conversation: () => ({ id: CONV, name: 'Chief', archived: false, agentIds: ['chief'], workspaceId: 'ws' }),
      memories: { list: vi.fn(() => [{ text: 'Prefere <b>curto</b>', scope: 'global', inclusion: 'essencial' }]), save: vi.fn((input: { text: string }) => { if (input.text.includes('sk-')) throw new Error('Isto parece um token'); return { memory: input, note: '' } }) } },
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

describe('cartões interativos', () => {
  async function withCard(card: Record<string, unknown>) {
    const s = setup(); await ready(s); await pair(s)
    ;(s.service as unknown as { data: { enabled: boolean }; botUsername: string }).data.enabled = true
    Object.assign(s.approval, { kind: 'question', details: { question: card.title, options: [], card } })
    s.host.emit('workspace-event', { type: 'approval', approval: s.approval })
    await vi.waitFor(() => expect(sent(s.calls)).toHaveLength(1))
    return s
  }
  type Body = { text: string; reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] } }
  const lastSend = (s: S) => s.calls.filter(c => c.method === 'sendMessage')[0].body as Body

  it('confirmação vira dois botões e o toque responde pelo cartão', async () => {
    const s = await withCard({ id: 'k', kind: 'confirm', title: 'Publicar <hoje>?', confirmLabel: 'Publicar' })
    expect(lastSend(s).text).toContain('Publicar &lt;hoje&gt;?')
    expect(lastSend(s).reply_markup!.inline_keyboard[0].map(b => b.text)).toEqual(['Publicar', 'Cancelar'])
    await pollWith(s, callback(3, 7, `k:${APPROVAL_ID}:1`))
    expect(s.host.answerCard).toHaveBeenCalledWith(APPROVAL_ID, { status: 'answered', values: { confirmed: true } })
  })

  it('respostas rápidas viram botões com o id da opção; índice inválido é recusado', async () => {
    const s = await withCard({ id: 'q', kind: 'quick-replies', title: 'Tom?', options: [{ id: 'f', label: 'Formal' }, { id: 'i', label: 'Informal' }] })
    expect(lastSend(s).reply_markup!.inline_keyboard.map(row => row[0].text)).toEqual(['Formal', 'Informal'])
    await pollWith(s, callback(3, 7, `k:${APPROVAL_ID}:5`))
    expect(s.host.answerCard).not.toHaveBeenCalled()
    await pollWith(s, callback(4, 7, `k:${APPROVAL_ID}:1`))
    expect(s.host.answerCard).toHaveBeenCalledWith(APPROVAL_ID, { status: 'answered', values: { choice: 'i' } })
  })

  it('escolha e formulário vão em texto, sem botões, e aceitam resposta por reply', async () => {
    const s = await withCard({ id: 'f', kind: 'form', title: 'Acesso', fields: [{ id: 'user', label: 'Usuário', required: true }, { id: 'pass', label: 'Senha', secret: true }] })
    expect(lastSend(s).reply_markup).toBeUndefined()
    expect(lastSend(s).text).toContain('secreto')
    const reply = { update_id: 5, message: { message_id: 60, chat: { id: 7, type: 'private' }, from: { id: 7 }, text: 'usuário: ana\nsenha: x', reply_to_message: { message_id: 1 } } }
    await pollWith(s, reply)
    expect(s.host.answerCard).toHaveBeenCalledWith(APPROVAL_ID, { status: 'answered', values: { user: 'ana', pass: 'x' } })
  })

  it('resposta em texto inválida pede de novo e não responde o cartão', async () => {
    const s = await withCard({ id: 'c', kind: 'choice', title: 'Quais?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const reply = { update_id: 5, message: { message_id: 60, chat: { id: 7, type: 'private' }, from: { id: 7 }, text: '9', reply_to_message: { message_id: 1 } } }
    await pollWith(s, reply)
    expect(s.host.answerCard).not.toHaveBeenCalled()
    expect(sent(s.calls).some(text => text.includes('número da opção'))).toBe(true)
  })

  it('chat não autorizado não responde o cartão', async () => {
    const s = await withCard({ id: 'k', kind: 'confirm', title: 'Ok?' })
    await pollWith(s, callback(3, 99, `k:${APPROVAL_ID}:1`))
    expect(s.host.answerCard).not.toHaveBeenCalled()
  })
})

describe('andamento e parada', () => {
  const userMsg = (id: number, text: string) => ({ update_id: id, message: { message_id: id + 100, chat: { id: 7, type: 'private' }, from: { id: 7 }, text } })
  async function working() {
    const s = setup(); await ready(s); await pair(s)
    ;(s.service as unknown as { data: { enabled: boolean }; botUsername: string }).data.enabled = true
    await pollWith(s, userMsg(9, 'faça algo'))
    await vi.waitFor(() => expect(sent(s.calls).some(text => text.includes('Trabalhando'))).toBe(true))
    return s
  }
  const statusBody = (s: S) => s.calls.find(c => c.method === 'sendMessage' && String(c.body.text).includes('Trabalhando'))!.body as { reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } }

  it('responde com Trabalhando… e botão Parar, e reage com 👀', async () => {
    const s = await working()
    expect(statusBody(s).reply_markup.inline_keyboard[0][0].text).toBe('Parar')
    expect(s.calls.some(c => c.method === 'setMessageReaction' && JSON.stringify(c.body.reaction).includes('👀'))).toBe(true)
  })

  it('Parar chama stop da conversa certa; chat não autorizado e conversa antiga são recusados', async () => {
    const s = await working()
    const data = statusBody(s).reply_markup.inline_keyboard[0][0].callback_data
    await pollWith(s, callback(11, 99, data))
    expect(s.host.stop).not.toHaveBeenCalled()
    await pollWith(s, callback(12, 7, `s:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`))
    expect(s.host.stop).not.toHaveBeenCalled()
    await pollWith(s, callback(13, 7, data))
    expect(s.host.stop).toHaveBeenCalledWith(CONV)
  })

  it('ao concluir, edita o status e reage com 👍', async () => {
    const s = await working()
    s.host.emit('workspace-event', { type: 'message', message: { id: 'm1', conversationId: CONV, role: 'assistant', status: 'completed', author: 'Chief', text: 'pronto', finishedAt: '2026-01-01' } })
    await vi.waitFor(() => expect(s.calls.some(c => c.method === 'editMessageText' && c.body.text === '✅ Concluído.')).toBe(true))
    expect(s.calls.some(c => c.method === 'setMessageReaction' && JSON.stringify(c.body.reaction).includes('👍'))).toBe(true)
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

describe('memória', () => {
  it('/memoria lista no escopo da conversa e /lembrar grava global essencial', async () => {
    const s = setup(); await ready(s); await pair(s)
    await pollWith(s, msg(10, 7, '/memoria'))
    expect(s.host.store.memories.list).toHaveBeenCalledWith({ limit: 10 }, { agentIds: ['chief'], workspaceId: 'ws' })
    expect(sent(s.calls).at(-1)).toContain('Prefere &lt;b&gt;curto&lt;/b&gt;')
    await pollWith(s, msg(11, 7, '/lembrar Uso Windows 11'))
    expect(s.host.store.memories.save).toHaveBeenCalledWith({ text: 'Uso Windows 11', scope: 'global', inclusion: 'essencial' }, { kind: 'usuario' })
    expect(sent(s.calls).at(-1)).toMatch(/memória global essencial/)
    await pollWith(s, msg(12, 7, '/lembrar minha chave sk-xxxxxxxxxxxxxxxxxxxx'))
    expect(sent(s.calls).at(-1)).toMatch(/parece um token/)
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
