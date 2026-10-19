import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { DynamicTool } from './codex'

export interface CliToolResult { success: boolean; contentItems?: { text?: string }[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Uma capacidade por sessão; as ferramentas continuam passando pela aprovação do Politron. */
export class CliToolBridge {
  readonly token = randomBytes(32).toString('hex')
  private address = ''
  private isReady = false
  get ready(): boolean { return this.isReady }
  private readonly connections = new Set<Server>()
  private readonly server = createServer((request, response) => { void this.handle(request, response).catch(() => this.json(response, 500, { error: 'Falha ao executar ferramenta do Boobot.' })) })

  constructor(private readonly tools: DynamicTool[], private readonly call: (name: string, args: Record<string, unknown>) => Promise<CliToolResult>) {}
  get url(): string { if (!this.address) throw new Error('Ponte de ferramentas ainda não iniciada.'); return this.address }

  async start(): Promise<void> {
    if (this.address) return
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve() })
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Não foi possível iniciar a ponte de ferramentas.')
    this.address = `http://127.0.0.1:${address.port}`
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    if (response.writableEnded || response.destroyed) return
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(value))
  }

  private async invoke(name: unknown, args: unknown): Promise<CliToolResult> {
    if (typeof name !== 'string' || !this.tools.some(tool => tool.name === name) || !record(args)) throw new Error('Ferramenta ou argumentos não autorizados.')
    return this.call(name, args)
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin || request.headers.authorization !== `Bearer ${this.token}`) { this.json(response, 403, { error: 'Acesso não autorizado.' }); return }
    if (request.url === '/ready' && request.method === 'POST') { this.isReady = true; this.json(response, 200, { ready: true }); return }
    if (request.url === '/tools' && request.method === 'GET') { this.json(response, 200, this.tools); return }
    if (request.url === '/mcp') {
      // Transporte MCP oficial em modo stateless: cada conexão pertence a esta sessão privada.
      const server = new Server({ name: 'politron', version: '1.0.0' }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools.map(tool => ({
        name: tool.name, description: tool.description,
        inputSchema: { ...tool.inputSchema, type: 'object' as const },
      })) }))
      server.setRequestHandler(CallToolRequestSchema, async input => {
        try {
          const result = await this.invoke(input.params.name, input.params.arguments || {})
          return { isError: !result.success, content: [{ type: 'text' as const, text: result.contentItems?.map(item => item.text || '').join('\n') || '' }] }
        } catch { return { isError: true, content: [{ type: 'text' as const, text: 'A ferramenta não pôde ser executada nesta sessão.' }] } }
      })
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      this.connections.add(server)
      response.once('close', () => { this.connections.delete(server); void server.close().catch(() => undefined) })
      await server.connect(transport)
      await transport.handleRequest(request, response)
      return
    }
    if (request.url !== '/call' || request.method !== 'POST') { this.json(response, 404, { error: 'Recurso inexistente.' }); return }
    let content = ''
    for await (const chunk of request) {
      content += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      if (Buffer.byteLength(content) > 262_144) { this.json(response, 413, { error: 'Argumentos excedem o limite.' }); return }
    }
    let input: unknown
    try { input = JSON.parse(content) } catch { this.json(response, 400, { error: 'JSON inválido.' }); return }
    if (!record(input)) { this.json(response, 400, { error: 'Requisição inválida.' }); return }
    try { this.json(response, 200, await this.invoke(input.name, input.args)) }
    catch { this.json(response, 400, { success: false, contentItems: [{ text: 'A ferramenta não pôde ser executada nesta sessão.' }] }) }
  }

  close(): void {
    for (const connection of this.connections) void connection.close().catch(() => undefined)
    this.connections.clear(); this.server.closeAllConnections(); this.server.close(); this.address = ''
  }
}
