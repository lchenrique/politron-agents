import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { URL } from 'node:url'
import { assertPwaRpcAuthorized, type PwaCapability } from '../../shared/pwa-host-policy'

const ASSETS = new Map<string, [string, string]>([
  ['/', ['web/pwa.html', 'text/html; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
  ['/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icon-512.png', ['icon-512.png', 'image/png']],
])
const MAX_BODY = 2_000_000
const MAX_REPLY = 2_000_000
const SESSION_MS = 12 * 60 * 60 * 1000
const CODE_MS = 3 * 60 * 1000
const COOKIE = 'boobot_pwa'
type Session = { id: string; label: string; expires: number; hostId: string; grants: PwaCapability[] }

export type PwaStatus = { running: boolean; port: number; sessions: number; codeExpires: number | null; devices: { id: string; label: string; chat: boolean; approvals: boolean; filesRead: boolean; filesWrite: boolean; expires: number }[] }
export type PwaGatewayOptions = {
  assets: string
  host: () => { id: string; name: string }
  dispatch: (method: string, args: unknown[], grants: readonly PwaCapability[]) => unknown | Promise<unknown>
  now?: () => number
}

function reply(response: ServerResponse, code: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(body)
}
function cookie(request: IncomingMessage, key: string): string | null {
  const values = (request.headers.cookie || '').split(';')
  const entry = values.find(item => item.trimStart().startsWith(key + '='))
  return entry ? entry.trim().slice(key.length + 1) : null
}
function isLocalHost(host: string): boolean {
  // Loopback + Tailscale Serve are the only intended origins. Prevent DNS rebinding.
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ||
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9.-]+\.ts\.net(?::\d+)?$/i.test(host)
}

export class PwaGateway {
  private server: Server | null = null
  private port = 0
  private code: { value: string; expires: number } | null = null
  private sessions = new Map<string, Session>()
  private attempts = new Map<string, { count: number; expires: number }>()
  private readonly now: () => number

  constructor(private readonly options: PwaGatewayOptions) {
    this.now = options.now || Date.now
  }
  status(): PwaStatus {
    this.prune()
    return { running: !!this.server, port: this.port, sessions: this.sessions.size, codeExpires: this.code?.expires ?? null,
      devices: [...this.sessions.values()].map(session => ({ id: session.id, label: session.label,
        chat: session.grants.includes('chat'), approvals: session.grants.includes('approvals'),
        filesRead: session.grants.includes('files:read') || session.grants.includes('files:write'),
        filesWrite: session.grants.includes('files:write'), expires: session.expires })) }
  }
  issueCode(): { code: string; expires: number; url: string } {
    if (!this.server) throw new Error('Gateway PWA indisponível.')
    this.code = { value: String(randomInt(0, 100_000_000)).padStart(8, '0'), expires: this.now() + CODE_MS }
    return { code: this.code.value, expires: this.code.expires, url: `http://localhost:${this.port}` }
  }
  setDevicePermissions(id: string, grants: { chat: boolean; approvals: boolean; filesRead?: boolean; filesWrite?: boolean }): PwaStatus {
    const session = [...this.sessions.values()].find(item => item.id === id)
    if (!session) throw new Error('Dispositivo não encontrado ou sessão expirada.')
    session.grants = ['read', ...(grants.chat ? ['chat' as const] : []), ...(grants.approvals ? ['approvals' as const] : []),
      ...((grants.filesRead || grants.filesWrite) ? ['files:read' as const] : []), ...(grants.filesWrite ? ['files:write' as const] : [])]
    return this.status()
  }
  revokeDevice(id: string): PwaStatus {
    const token = [...this.sessions].find(([, session]) => session.id === id)?.[0]
    if (token) this.sessions.delete(token)
    return this.status()
  }
  revokeAll(): void {
    this.sessions.clear()
    this.code = null
    this.attempts.clear()
  }
  private prune(): void {
    for (const [token, session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(token)
    if (this.code && this.code.expires <= this.now()) this.code = null
    for (const [address, attempt] of this.attempts) if (attempt.expires <= this.now()) this.attempts.delete(address)
  }
  async listen(port = 6780): Promise<number> {
    if (this.server) throw new Error('Gateway PWA já está ativo.')
    const server = createServer((request, response) => {
      void this.handle(request, response).catch(error => {
        if (!response.headersSent) reply(response, 500, { error: 'Não foi possível processar esta solicitação.' })
        else response.end()
        // Never log codes, cookies or project contents.
        console.warn('[PWA] Falha de gateway:', error instanceof Error ? error.name : 'unknown')
      })
    })
    server.requestTimeout = 20_000
    server.headersTimeout = 12_000
    server.keepAliveTimeout = 5_000
    server.maxRequestsPerSocket = 200
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve() })
      })
    } catch (error) {
      server.close()
      throw error
    }
    this.server = server
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Porta PWA indisponível.')
    this.port = address.port
    return this.port
  }
  async close(): Promise<void> {
    this.revokeAll()
    const server = this.server; this.server = null; this.port = 0
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }
  private origin(request: IncomingMessage): string | null {
    const host = request.headers.host || ''
    if (!isLocalHost(host)) return null
    const forwarded = request.headers['x-forwarded-proto']
    const protocol = forwarded === 'https' ? 'https' : 'http'
    return `${protocol}://${host}`
  }
  private secure(request: IncomingMessage): boolean {
    return request.headers['x-forwarded-proto'] === 'https'
  }
  private session(request: IncomingMessage): Session | null {
    const token = cookie(request, COOKIE)
    const session = token ? this.sessions.get(token) : null
    if (!session || session.expires <= this.now()) return null
    return session
  }
  private async body(request: IncomingMessage): Promise<Record<string, unknown>> {
    const length = Number(request.headers['content-length'] || '0')
    if (length > MAX_BODY) throw new Error('Solicitação grande demais.')
    let input = ''
    for await (const chunk of request) {
      input += chunk.toString('utf8')
      if (Buffer.byteLength(input) > MAX_BODY) throw new Error('Solicitação grande demais.')
    }
    const value: unknown = JSON.parse(input)
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Formato de solicitação inválido.')
    return value as Record<string, unknown>
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.prune()
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    const origin = this.origin(request)
    if (!origin) { reply(response, 403, { error: 'Endereço não permitido.' }); return }
    const pathname = new URL(request.url || '/', origin).pathname
    if (request.method === 'GET' && /^\/web\/(?:assets\/)?[a-zA-Z0-9._-]+\.(?:js|css|svg|png|wasm)$/.test(pathname)) {
      const file = pathname.slice('/web/'.length)
      const contents = await readFile(join(this.options.assets, 'web', file))
      const type = file.endsWith('.css') ? 'text/css; charset=utf-8' :
        file.endsWith('.js') ? 'text/javascript; charset=utf-8' :
        file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.wasm') ? 'application/wasm' : 'image/png'
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=180' })
      response.end(contents)
      return
    }
    if (request.method === 'GET' && /^\/assets\/[a-zA-Z0-9._-]+\.(?:js|css|svg|png)$/.test(pathname)) {
      const file = basename(pathname)
      const contents = await readFile(join(this.options.assets, 'assets', file))
      response.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' })
      response.end(contents)
      return
    }
    if (request.method === 'GET' && ASSETS.has(pathname)) {
      const [asset, type] = ASSETS.get(pathname)!
      const contents = await readFile(join(this.options.assets, asset))
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': pathname === '/sw.js' ? 'no-cache' : 'public, max-age=120' })
      response.end(contents)
      return
    }
    if (request.method === 'GET' && pathname === '/api/status') {
      const session = this.session(request)
      reply(response, 200, {
        paired: !!session, host: session ? this.options.host() : null,
        readOnly: !session?.grants.includes('chat'), capabilities: session?.grants || [], requiresPairing: !session,
      })
      return
    }
    if (request.method !== 'POST' || !['/api/pair', '/api/rpc', '/api/logout'].includes(pathname)) {
      reply(response, 404, { error: 'Rota indisponível.' }); return
    }
    if (request.headers.origin !== origin || request.headers['x-boobot-pwa'] !== '1' ||
      !/^application\/json(?:;|$)/i.test(String(request.headers['content-type'] || ''))) {
      reply(response, 403, { error: 'Origem ou proteção CSRF inválida.' }); return
    }
    let input: Record<string, unknown>
    try { input = await this.body(request) } catch { reply(response, 400, { error: 'Dados inválidos.' }); return }
    if (pathname === '/api/pair') {
      const address = request.socket.remoteAddress || 'unknown'
      const attempt = this.attempts.get(address)
      if (attempt && attempt.count >= 6) { reply(response, 429, { error: 'Muitas tentativas. Gere um novo código mais tarde.' }); return }
      if (!this.code || typeof input.code !== 'string' || !/^\d{8}$/.test(input.code) ||
        !timingSafeEqual(Buffer.from(input.code), Buffer.from(this.code.value))) {
        this.attempts.set(address, { count: (attempt?.count || 0) + 1, expires: this.now() + 15 * 60_000 })
        reply(response, 401, { error: 'Código incorreto ou expirado.' })
        return
      }
      if (this.sessions.size >= 10) { reply(response, 429, { error: 'Limite de dispositivos conectado.' }); return }
      this.code = null
      this.attempts.delete(address)
      const token = randomBytes(32).toString('base64url')
      const label = typeof input.device === 'string' ? input.device.trim().slice(0, 60).replace(/[<>]/g, '') : 'Navegador'
      this.sessions.set(token, { id: randomBytes(9).toString('hex'), label: label || 'Navegador',
        expires: this.now() + SESSION_MS, hostId: this.options.host().id, grants: ['read'] })
      response.setHeader('Set-Cookie',
        `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${this.secure(request) ? '; Secure' : ''}`)
      reply(response, 200, { paired: true })
      return
    }
    const session = this.session(request)
    if (!session) { reply(response, 401, { error: 'Dispositivo não autorizado. Faça o pareamento.' }); return }
    if (pathname === '/api/logout') {
      const token = cookie(request, COOKIE)
      if (token) this.sessions.delete(token)
      response.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
      reply(response, 200, { paired: false })
      return
    }
    if (session.hostId !== this.options.host().id) {
      reply(response, 409, { error: 'O host foi alterado no Boobot. Faça um novo pareamento.' })
      return
    }
    if (typeof input.method !== 'string' || !Array.isArray(input.args)) {
      reply(response, 400, { error: 'Método ou argumentos inválidos.' }); return
    }
    try {
      assertPwaRpcAuthorized(input.method, input.args, session.grants)
      const authorizedMethod = input.method
      if (authorizedMethod === 'v9:models' && (input.args.length > 1 || input.args[0] != null &&
        !['codex', 'claude', 'pi', 'opencode', 'antigravity'].includes(String(input.args[0])))) {
        reply(response, 400, { error: 'Provedor de modelos inválido.' })
        return
      }
      if (authorizedMethod === 'v9:send') {
        const [conversationId, message, model, effort, planMode] = input.args
        if (typeof conversationId !== 'string' || !conversationId ||
          typeof message !== 'string' || !message.trim() || message.length > 12000 ||
          model != null && (typeof model !== 'string' || model.length > 200) ||
          effort != null && !['low', 'medium', 'high', 'xhigh', 'max'].includes(String(effort)) ||
          planMode != null && typeof planMode !== 'boolean') {
          reply(response, 400, { error: 'Conversa ou mensagem inválida.' })
          return
        }
        // Sending starts on the host and may take minutes. Do not hold a browser request
        // for a complete coding-agent run; poll history for the real outcome instead.
        Promise.resolve().then(() => this.options.dispatch(authorizedMethod,
          [conversationId, message, model ?? undefined, effort ?? undefined, planMode ?? undefined], session.grants))
          .catch(error => console.warn('[PWA] Envio do agente falhou:', error instanceof Error ? error.message : 'erro'))
        reply(response, 202, { result: { accepted: true } })
        return
      }
      let args = input.args
      if (input.method === 'v9:voiceSpeak') {
        const [text, speed, agentId] = args
        if (typeof text !== 'string' || !text.trim() || text.length > 12_000 ||
          speed != null && (typeof speed !== 'number' || speed < 0.5 || speed > 2) ||
          agentId != null && (typeof agentId !== 'string' || agentId.length > 200)) {
          reply(response, 400, { error: 'Parâmetros de voz inválidos.' }); return
        }
      }
      if (input.method === 'v9:voiceTranscribe') {
        const [samples] = args
        if (args.length !== 1 || !Array.isArray(samples) || !samples.length || samples.length > 500_000 ||
          !samples.every(value => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)) {
          reply(response, 400, { error: 'Áudio inválido ou muito longo.' }); return
        }
        args = [Uint8Array.from(samples as number[])]
      }
      const raw = await this.options.dispatch(input.method, args, session.grants)
      // The web app only needs list metadata. Don't expose agent instructions,
      // accumulated file diffs, CLI paths or old execution input to every paired device.
      const output = input.method === 'v9:snapshot' && raw && typeof raw === 'object'
        ? (() => {
          const value = raw as Record<string, unknown>
          let avatarBudget = 800_000
          const safeAgent = (a: Record<string, unknown>) => {
            const avatar = typeof a.avatar === 'string' && a.avatar.startsWith('data:image/') && a.avatar.length <= Math.min(100_000, avatarBudget) ? a.avatar : ''
            avatarBudget -= avatar.length
            return ({
            id: a.id, name: a.name, alias: a.alias, description: a.description,
            runtime: a.runtime, model: a.model, role: a.role, color: a.color,
            avatar,
            temporary: a.temporary, temporaryStatus: a.temporaryStatus,
            canWrite: a.canWrite, computerUse: a.computerUse, approvalMode: a.approvalMode,
            effort: a.effort, revision: a.revision, createdAt: a.createdAt,
            pitsShape: a.pitsShape, pitsHeadAccessory: a.pitsHeadAccessory, pitsFaceAccessory: a.pitsFaceAccessory,
            pitsAccessoryColors: a.pitsAccessoryColors, pitsEyeColor: a.pitsEyeColor, pitsCheekColor: a.pitsCheekColor,
            pitsBodyWidth: a.pitsBodyWidth, pitsBodyHeight: a.pitsBodyHeight, pitsEyeSize: a.pitsEyeSize,
            pitsEyeSpacing: a.pitsEyeSpacing, pitsMouthSize: a.pitsMouthSize, pitsBlush: a.pitsBlush,
            pitsAura: a.pitsAura, pitsAnimate: a.pitsAnimate, pitsSpeed: a.pitsSpeed, pitsAmplitude: a.pitsAmplitude,
          })
          }
          const agents = Array.isArray(value.agents) ? value.agents.map((a: Record<string, unknown>) => safeAgent(a)) : []
          const assistant = value.assistant && typeof value.assistant === 'object'
            ? safeAgent(value.assistant as Record<string, unknown>) : null
          const workspaces = Array.isArray(value.workspaces) ? value.workspaces.map((w: Record<string, unknown>) => ({
            id: w.id, name: w.name, kind: w.kind, branch: w.branch, archived: w.archived,
            parentWorkspaceId: w.parentWorkspaceId, defaultAgentIds: w.defaultAgentIds, changes: w.changes, createdAt: w.createdAt,
          })) : []
          const conversations = Array.isArray(value.conversations) ? value.conversations.map((c: Record<string, unknown>) => ({
            id: c.id, workspaceId: c.workspaceId, name: c.name, kind: c.kind, archived: c.archived, agentIds: c.agentIds,
            responseMode: c.responseMode, leaderAgentId: c.leaderAgentId, titleAuto: c.titleAuto, revision: c.revision, createdAt: c.createdAt,
          })) : []
          const runs = Array.isArray(value.runs) ? value.runs.slice(-80).map((r: Record<string, unknown>) => ({
            id: r.id, workspaceId: r.workspaceId, conversationId: r.conversationId,
            agentId: r.agentId, status: r.status, input: '', createdAt: r.createdAt,
            threadId: r.threadId, turnId: r.turnId, parentId: r.parentId,
            agent: { runtime: agents.find((a: Record<string, unknown>) => a.id === r.agentId)?.runtime },
          })) : []
          const approvals = Array.isArray(value.approvals) ? value.approvals
            .filter((a: Record<string, unknown>) => a.status === 'pending')
            .map((a: Record<string, unknown>) => ({ id: a.id, kind: a.kind, status: a.status, runId: a.runId,
              createdAt: a.createdAt, details: typeof a.details === 'object' && a.details
                ? { action: (a.details as Record<string, unknown>).action } : {} })) : []
          return { assistant, agents, workspaces, conversations, messages: [], runs, fileChanges: [], approvals,
            terminalEnabled: false, steeringRuntimes: value.steeringRuntimes }
        })()
        : raw
      const safeOutput = input.method === 'v9:voiceSpeak' && raw instanceof Uint8Array
        ? { audioBase64: Buffer.from(raw).toString('base64') } : output
      const result = JSON.stringify({ result: safeOutput ?? null })
      if (Buffer.byteLength(result) > MAX_REPLY) { reply(response, 413, { error: 'Resultado grande demais.' }); return }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(result)
    } catch (error) {
      reply(response, 403, { error: error instanceof Error ? error.message.slice(0, 250) : 'Acesso negado.' })
    }
  }
}
