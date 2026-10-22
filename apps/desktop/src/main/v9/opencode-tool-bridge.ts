import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { DynamicTool } from './codex'

type Scope = {
  tools: DynamicTool[]
  active: boolean
  invoke: (name: string, args: Record<string, unknown>, callId: string) => Promise<unknown>
}

const MAX_BYTES = 1024 * 1024
const json = (res: ServerResponse, code: number, body: unknown): void => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export class OpenCodeToolBridge {
  readonly token = randomBytes(32).toString('hex')
  private server?: Server
  private url?: string
  constructor(private readonly scope: (sessionId: string) => Scope | undefined) {}

  async start(): Promise<{ baseUrl: string; token: string }> {
    if (this.url) return { baseUrl: this.url, token: this.token }
    const server = createServer((req, res) => { void this.route(req, res).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'Falha interna na ponte de ferramentas.' })
      else res.destroy()
    }) })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Não foi possível iniciar a ponte local.')
      this.server = server
      this.url = 'http://127.0.0.1:' + address.port
      return { baseUrl: this.url, token: this.token }
    } catch (error) {
      server.close()
      throw error
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.authorization !== 'Bearer ' + this.token) return json(res, 401, { error: 'Acesso não autorizado.' })
    const url = new URL(req.url || '/', this.url || 'http://127.0.0.1')
    const match = /^\/sessions\/([^/]+)\/(tools|call)$/.exec(url.pathname)
    if (!match) return json(res, 404, { error: 'Rota inexistente.' })
    let id: string
    try { id = decodeURIComponent(match[1]) } catch { return json(res, 400, { error: 'Sessão inválida.' }) }
    const scope = this.scope(id)
    if (!scope?.active) return json(res, 404, { error: 'A sessão não possui um turno ativo.' })
    if (match[2] === 'tools' && req.method === 'GET') {
      return json(res, 200, { tools: scope.tools.map(tool => ({
        name: tool.name, description: tool.description, inputSchema: tool.inputSchema
      })) })
    }
    if (match[2] !== 'call' || req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const data = Buffer.from(chunk)
      size += data.length
      if (size > MAX_BYTES) return json(res, 413, { error: 'Argumentos excedem o limite de 1 MB.' })
      chunks.push(data)
    }
    let request: unknown
    try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { return json(res, 400, { error: 'JSON inválido.' }) }
    if (!request || typeof request !== 'object' || Array.isArray(request)) return json(res, 400, { error: 'Argumentos inválidos.' })
    const input = request as Record<string, unknown>
    if (typeof input.name !== 'string' || !scope.tools.some(t => t.name === input.name))
      return json(res, 403, { error: 'Ferramenta não autorizada nesta sessão.' })
    if (typeof input.argumentsJson !== 'string' || input.argumentsJson.length > MAX_BYTES)
      return json(res, 400, { error: 'Argumentos da ferramenta inválidos.' })
    let args: unknown
    try { args = JSON.parse(input.argumentsJson) }
    catch { return json(res, 400, { error: 'Argumentos não são JSON válido.' }) }
    if (!args || typeof args !== 'object' || Array.isArray(args))
      return json(res, 400, { error: 'Os argumentos precisam ser um objeto JSON.' })
    const callId = randomUUID()
    try {
      const result = await scope.invoke(input.name, args as Record<string, unknown>, callId)
      json(res, 200, { success: true, result })
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message.slice(0, 400) : 'Ferramenta recusada.' })
    }
  }

  close(): void {
    const server = this.server
    this.server = undefined
    this.url = undefined
    server?.closeAllConnections()
    server?.close()
  }
}
