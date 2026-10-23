// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { request as httpRequest } from 'node:http'
import { PwaGateway } from './gateway'

const servers: PwaGateway[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())) })
const make = async () => {
  const host = { id: 'local', name: 'PC de desenvolvimento' }
  const dispatch = vi.fn(async (method: string) => {
    if (method === 'v9:snapshot') return { agents: [], workspaces: [], conversations: [] }
    return null
  })
  let now = 12_000
  const server = new PwaGateway({ assets: resolve('src/main/pwa/assets'), host: () => host, dispatch, now: () => now })
  servers.push(server)
  const port = await server.listen(0)
  const base = `http://127.0.0.1:${port}`
  const request = async (path: string, data?: object, options: { headers?: Record<string, string>; cookie?: string } = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Origin': base, 'X-Boobot-PWA': '1', ...options.headers }
    if (options.cookie) headers.Cookie = options.cookie
    const response = await fetch(base + path, data ? { method: 'POST', headers, body: JSON.stringify(data) } : { headers })
    return { response, json: await response.json().catch(() => null) }
  }
  return { server, port, base, host, dispatch, request, advance: (ms: number) => { now += ms } }
}

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
    const tooLarge = await request('/api/pair', { payload: 'x'.repeat(40_000) })
    expect(tooLarge.response.status).toBe(400)
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
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith('v9:send', ['c1', 'olá'], ['read', 'chat']))
    expect((await request('/api/rpc', { method: 'v9:respondApproval', args: ['approval', true] }, { cookie: token })).response.status).toBe(403)
    server.revokeDevice(device.id)
    expect((await request('/api/rpc', { method: 'v9:snapshot', args: [] }, { cookie: token })).response.status).toBe(401)
  })
})
