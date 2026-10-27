// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { request as httpRequest } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { PwaGateway } from './gateway'
import { AttachmentStore, MAX_ATTACHMENT_BYTES } from './attachment-store'

const servers: PwaGateway[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
const make = async () => {
  const host = { id: 'local', name: 'PC de desenvolvimento' }
  const dispatch = vi.fn(async (method: string, _args: unknown[], _grants: readonly string[]) => {
    if (method === 'v9:snapshot') return { agents: [], workspaces: [], conversations: [] }
    return null
  })
  let now = 12_000
  const dir = await mkdtemp(resolve(tmpdir(), 'boobot-gateway-'))
  dirs.push(dir)
  const attachments = new AttachmentStore(resolve(dir, 'attachments'), () => now)
  const server = new PwaGateway({ assets: resolve('src/main/pwa/assets'), host: () => host, dispatch, attachments, now: () => now })
  servers.push(server)
  const port = await server.listen(0)
  const base = `http://127.0.0.1:${port}`
  const request = async (path: string, data?: object, options: { headers?: Record<string, string>; cookie?: string } = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Origin': base, 'X-Boobot-PWA': '1', ...options.headers }
    if (options.cookie) headers.Cookie = options.cookie
    const response = await fetch(base + path, data ? { method: 'POST', headers, body: JSON.stringify(data) } : { headers })
    return { response, json: await response.json().catch(() => null) }
  }
  const pair = async (chat: boolean) => {
    const code = server.issueCode().code
    const paired = await request('/api/pair', { code })
    const cookie = paired.response.headers.get('set-cookie')!.split(';')[0]
    const device = server.status().devices.at(-1)!
    if (chat) server.setDevicePermissions(device.id, { chat: true, approvals: false })
    return cookie
  }
  const upload = (bytes: Uint8Array, options: { cookie?: string; type?: string; conversationId?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${base}/api/attachments?conversationId=${options.conversationId ?? 'c1'}&name=captura.png`, { method: 'POST', body: new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer]),
      headers: { 'Content-Type': options.type ?? 'image/png', 'Origin': base, 'X-Boobot-PWA': '1',
        ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers } })
  const download = (id: string, cookie: string, conversationId = 'c1', headers: Record<string, string> = {}) =>
    fetch(`${base}/api/attachments/${id}?conversationId=${conversationId}`, { headers: { 'X-Boobot-PWA': '1', Cookie: cookie, ...headers } })
  return { server, port, base, host, dispatch, request, pair, upload, download, dir, advance: (ms: number) => { now += ms } }
}
const png = (size = 11) => { const bytes = Buffer.alloc(size); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes); return bytes }

describe('PWA gateway / read-only security', () => {
  it('serves the PWA shell without exposing paired content or the secret code', async () => {
    const { base, request, server } = await make()
    const info = await request('/api/status')
    expect(info.json).toMatchObject({ paired: false, host: null, readOnly: true })
    const code = server.issueCode().code
    const shell = await fetch(base + '/')
    expect(shell.status).toBe(200)
    expect(shell.headers.get('content-security-policy')).toContain("default-src 'none'")
    const html = await shell.text()
    expect(html).toContain('<title>Boobot</title>')
    expect(html).not.toContain(code)
    const sw = await fetch(base + '/sw.js')
    const content = await sw.text()
    expect(content).toContain("request.method!=='GET'")
    expect(content).not.toContain('/api/')
  })
  it('pairs one device, enforces CSRF and denies command, chat and approvals RPC', async () => {
    const { server, request, dispatch } = await make()
    const code = server.issueCode().code
    const noOrigin = await request('/api/pair', { code }, { headers: { Origin: 'https://evil.example' } })
    expect(noOrigin.response.status).toBe(403)
    const paired = await request('/api/pair', { code })
    expect(paired.response.status).toBe(200)
    const token = paired.response.headers.get('set-cookie')!.split(';')[0]
    expect(token).toMatch(/^boobot_pwa=/)
    expect(paired.response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(paired.response.headers.get('set-cookie')).toContain('SameSite=Strict')
    expect((await request('/api/pair', { code })).response.status).toBe(401)
    expect((await request('/api/status', undefined, { cookie: token })).json).toMatchObject({ paired: true, host: { id: 'local' } })
    expect((await request('/api/rpc', { method: 'v9:send', args: ['id', 'message'] }, { cookie: token })).response.status).toBe(403)
    expect((await request('/api/rpc', { method: 'v9:respondApproval', args: ['id', true] }, { cookie: token })).response.status).toBe(403)
    expect((await request('/api/rpc', { method: 'v9:saveTerminalAccess', args: [true] }, { cookie: token })).response.status).toBe(403)
    expect(dispatch).not.toHaveBeenCalled()
    const snapshot = await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token })
    expect(snapshot.json).toMatchObject({ result: { agents: [] } })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect((await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token, headers: { 'X-Boobot-PWA': '0' } })).response.status).toBe(403)
  })
  it('revokes sessions, expires pairing codes and binds session to the host', async () => {
    const { server, request, host, advance } = await make()
    const code = server.issueCode().code
    advance(3 * 60_000 + 1)
    expect((await request('/api/pair', { code })).response.status).toBe(401)
    const fresh = server.issueCode().code
    const paired = await request('/api/pair', { code: fresh })
    const token = paired.response.headers.get('set-cookie')!.split(';')[0]
    host.id = 'remote'
    expect((await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token })).response.status).toBe(409)
    host.id = 'local'
    server.revokeAll()
    expect((await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token })).response.status).toBe(401)
  })
  it('prevents brute force, host-header forgery and oversized bodies', async () => {
    const { request, server } = await make()
    server.issueCode()
    for (let i = 0; i < 6; i++) expect((await request('/api/pair', { code: '00000000' })).response.status).toBe(401)
    expect((await request('/api/pair', { code: '12345678' })).response.status).toBe(429)
    const forgedStatus = await new Promise<number>((resolveStatus, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port: server.status().port,
        path: '/api/status', method: 'GET', headers: { Host: 'evil.example' } },
        res => { res.resume(); res.on('end', () => resolveStatus(res.statusCode || 0)) })
      req.on('error', reject)
      req.end()
    })
    expect(forgedStatus).toBe(403)
    // O limite de corpo vale acima de 2 MB. Precisa de um servidor novo: o anterior esta bloqueado por tentativas.
    const fresh = await make()
    const tooLarge = await fresh.request('/api/pair', { payload: 'x'.repeat(2_100_000) })
    expect(tooLarge.response.status).toBe(400)
  })
  it('waits for host acceptance before confirming a queued send and forwards its stable request id', async () => {
    const { request, server, dispatch } = await make()
    const code = server.issueCode().code
    const paired = await request('/api/pair', { code })
    const token = paired.response.headers.get('set-cookie')!.split(';')[0]
    server.setDevicePermissions(server.status().devices[0]!.id, { chat: true, approvals: false })
    let release!: () => void
    const gate = new Promise<void>(resolveGate => { release = resolveGate })
    dispatch.mockImplementation(async (method: string) => { if (method === 'v9:send') await gate; return null })
    const sending = request('/api/rpc', { method: 'v9:send', args: ['c1', 'mensagem na fila', undefined, undefined, undefined, { requestId: '10000000-0000-4000-8000-000000000123', delivery: 'queue' }] }, { cookie: token })
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalled())
    let settled = false
    void sending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    const sent = await sending
    expect(sent.response.status).toBe(202)
    expect(sent.json).toEqual({ result: { accepted: true } })
    expect(dispatch).toHaveBeenCalledWith('v9:send', ['c1', 'mensagem na fila', undefined, undefined, undefined,
      { requestId: '10000000-0000-4000-8000-000000000123', delivery: 'queue', returnAfterAcceptance: true }], ['read', 'chat'])
  })
  it('grants chat to exactly one device, rejects approval without grant, and revokes immediately', async () => {
    const { request, server, dispatch } = await make()
    const code = server.issueCode().code
    const paired = await request('/api/pair', { code, device: 'Android teste' })
    const token = paired.response.headers.get('set-cookie')!.split(';')[0]
    const device = server.status().devices[0]
    expect(device).toMatchObject({ label: 'Android teste', chat: false, approvals: false })
    expect((await request('/api/rpc', { method: 'v9:stop', args: ['c1'] }, { cookie: token })).response.status).toBe(403)
    server.setDevicePermissions(device.id, { chat: true, approvals: false })
    const status = await request('/api/status', undefined, { cookie: token })
    expect(status.json.capabilities).toEqual(['read', 'chat'])
    expect(status.json.readOnly).toBe(false)
    const sent = await request('/api/rpc', { method: 'v9:send', args: ['c1', 'olá'] }, { cookie: token })
    expect(sent.response.status).toBe(202)
    expect(sent.json).toEqual({ result: { accepted: true } })
    // O envio sempre encaminha modelo, esforço, modo e chave idempotente; a confirmação vem após aceitação do host.
    const [method, args, grants] = dispatch.mock.calls.at(-1)!
    expect(method).toBe('v9:send')
    expect(args.slice(0, 5)).toEqual(['c1', 'olá', undefined, undefined, undefined])
    expect(args[5]).toMatchObject({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i), delivery: 'queue', returnAfterAcceptance: true })
    expect(grants).toEqual(['read', 'chat'])
    expect((await request('/api/rpc', { method: 'v9:respondApproval', args: ['approval', true] }, { cookie: token })).response.status).toBe(403)
    server.revokeDevice(device.id)
    expect((await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token })).response.status).toBe(401)
  })
})

describe('PWA gateway / image attachments', () => {
  it('requires a paired device with chat grant and same-origin CSRF headers', async () => {
    const { upload, pair, dispatch } = await make()
    expect((await upload(png())).status).toBe(401)
    const readOnly = await pair(false)
    expect((await upload(png(), { cookie: readOnly })).status).toBe(403)
    const chat = await pair(true)
    expect((await upload(png(), { cookie: chat, headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await upload(png(), { cookie: chat, headers: { 'X-Boobot-PWA': '0' } })).status).toBe(403)
    expect((await upload(png(), { cookie: chat, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    const accepted = await upload(png(), { cookie: chat })
    expect(accepted.status).toBe(201)
    const metadata = await accepted.json()
    expect(Object.keys(metadata).sort()).toEqual(['id', 'mimeType', 'name', 'size'])
    expect(metadata).toMatchObject({ name: 'captura.png', mimeType: 'image/png', size: 11 })
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('rejects MIME mismatch, missing conversation and binary bodies above 20 MB', async () => {
    const { upload, pair } = await make()
    const chat = await pair(true)
    expect((await upload(png(), { cookie: chat, type: 'image/jpeg' })).status).toBe(400)
    expect((await upload(png(), { cookie: chat, conversationId: '' })).status).toBe(400)
    const exact = await upload(png(MAX_ATTACHMENT_BYTES), { cookie: chat })
    expect(exact.status).toBe(201)
    expect((await exact.json()).size).toBe(MAX_ATTACHMENT_BYTES)
    expect((await upload(png(MAX_ATTACHMENT_BYTES + 1), { cookie: chat })).status).toBe(413)
  }, 30_000)
  it('downloads only for the uploading device, conversation and chat grant, without host paths', async () => {
    const { upload, download, pair, server, dir, base } = await make()
    const chat = await pair(true)
    const other = await pair(true)
    const { id } = await (await upload(png(), { cookie: chat })).json()
    const ok = await download(id, chat)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(png())
    expect((await download(id, chat, 'c1', { Origin: base })).status).toBe(200)
    expect((await download(id, chat, 'c1', { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await download(id, chat, 'c1', { 'X-Boobot-PWA': '0' })).status).toBe(403)
    expect((await download(id, chat, 'c2')).status).toBe(404)
    expect((await download(id, other)).status).toBe(404)
    expect((await download('../' + id, chat)).status).toBe(404)
    const device = server.status().devices[0]
    server.setDevicePermissions(device.id, { chat: false, approvals: false })
    const denied = await download(id, chat)
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toContain(dir)
  })
  it('keeps the 2 MB JSON limit on RPC', async () => {
    const { request, pair } = await make()
    const chat = await pair(true)
    const tooLarge = await request('/api/rpc', { method: 'v9:snapshot', args: ['x'.repeat(2_100_000)] }, { cookie: chat })
    expect(tooLarge.response.status).toBe(400)
  })
})
