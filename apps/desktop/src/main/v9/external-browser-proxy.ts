import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'

export const EXTERNAL_BROWSER_MCP = 'politron_external_browser'
export interface NodeReplServer { command: string; args: string[]; env: Record<string, string> }
/** Devolve null quando a chamada foi aprovada; caso contrário, o motivo da recusa mostrado ao modelo. */
export type ExternalBrowserAuthorizer = (tool: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<string | null>

// A skill oficial control-chrome usa somente `js`; nada além disso é republicado (nem CDP completo).
const ALLOWED_TOOLS = new Set(['js'])
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] })

/**
 * Fail-closed. O cliente oficial aceita `playwright.evaluate` com código de página em texto e comandos CDP crus,
 * e o node_repl é Node persistente com import dinâmico; sem parser JS nem ponte real para verificar, nenhuma
 * allowlist de `js` é demonstrável (regex não é sandbox). Por isso nenhum `js` é encaminhado nem registrado.
 */
export const EXTERNAL_BROWSER_JS_BLOCKED = 'o Politron não encaminha a ferramenta js ao node_repl (fail-closed): não há política verificável que impeça ler cookies, senhas, armazenamento, histórico, perfis ou arquivos e usar CDP direto, porque o cliente oficial executa código de página em texto e CDP cru; nenhuma aba foi acessada. Use o navegador da plataforma'
/** Único ponto para reativar o encaminhamento, e somente com uma política comprovada por testes contra bypasses. */
export function externalBrowserCallViolation(): string | null {
  return `Chamada bloqueada: ${EXTERNAL_BROWSER_JS_BLOCKED}. Nada foi executado.`
}

const PREVIEW_LIMIT = 4000
const UNSAFE = ' [restante oculto: o Politron não conseguiu garantir a redação de segredos]'
/**
 * Prévia da aprovação sem segredos: textos literais e comentários ficam ocultos (URLs aparecem redigidas);
 * ao encontrar sintaxe que não analisa com segurança (regex/divisão, template com ${}, texto sem fim), oculta o resto e avisa.
 */
export function externalBrowserApprovalPreview(args: Record<string, unknown>, redactUrl: (url: string) => string): { code: string; targets: string[]; truncated: boolean } {
  const source = typeof args.code === 'string' ? args.code : ''
  const targets = new Set<string>()
  let code = '', truncated = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1]
    if (char === '"' || char === "'" || char === '`') {
      let end = i + 1
      for (; end < source.length && source[end] !== char; end++) {
        if (source[end] === '\\') end++
        else if (char === '`' ? source[end] === '$' && source[end + 1] === '{' : source[end] === '\n') { end = source.length; break }
      }
      if (end >= source.length) { code += UNSAFE; truncated = true; break }
      const literal = source.slice(i + 1, end)
      const url = /^https?:\/\/\S+$/i.test(literal) ? redactUrl(literal) : ''
      if (url) targets.add(url)
      code += `${char}${url || '[texto oculto]'}${char}`; i = end
    } else if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i); code += '// [comentário oculto]'
      if (end < 0) break
      i = end - 1
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end < 0) { code += UNSAFE; truncated = true; break }
      code += '/* [comentário oculto] */'; i = end + 1
    } else if (char === '/') { code += UNSAFE; truncated = true; break }
    else code += char
  }
  const others = Object.keys(args).filter(key => key !== 'code')
  if (others.length) code += `\nOutros campos (valores ocultos): ${others.join(', ')}`
  if (code.length > PREVIEW_LIMIT) { code = `${code.slice(0, PREVIEW_LIMIT)}\n[prévia truncada: ${PREVIEW_LIMIT} de ${code.length} caracteres exibidos]`; truncated = true }
  return { code, targets: [...targets], truncated }
}

/**
 * Servidor MCP do Politron entre o Codex e o node_repl oficial. O Codex só fala com este proxy;
 * cada tools/call passa pela política de conteúdo e pela aprovação do Politron antes de chegar ao node_repl.
 */
export class ExternalBrowserProxy {
  readonly token = randomBytes(32).toString('hex')
  private address = ''
  private closed = false
  private starting: Promise<void> | null = null
  private upstream: Client | null = null
  private tools: Tool[] = []
  private readonly connections = new Set<Server>()
  private readonly server = createServer((request, response) => { void this.handle(request, response).catch(() => this.json(response, 500, { error: 'Falha no proxy do navegador externo.' })) })

  constructor(private readonly spec: NodeReplServer, private readonly authorize: ExternalBrowserAuthorizer) {}
  get url(): string { if (!this.address) throw new Error('Proxy do navegador externo não iniciado.'); return `${this.address}/mcp` }
  get toolNames(): string[] { return this.tools.map(tool => tool.name) }
  get ready(): boolean { return !!this.address && !this.closed }

  start(): Promise<void> { return this.starting ??= this.open() }

  private async open(): Promise<void> {
    const client = new Client({ name: 'politron', version: '1.0.0' })
    try {
      await client.connect(new StdioClientTransport({ command: this.spec.command, args: this.spec.args, env: this.spec.env, stderr: 'ignore' }))
      this.tools = (await client.listTools()).tools.filter(tool => ALLOWED_TOOLS.has(tool.name))
    } catch {
      await client.close().catch(() => undefined)
      throw new Error('O node_repl oficial não pôde ser iniciado; nenhuma aba foi acessada.')
    }
    if (this.closed || !this.tools.length) {
      await client.close().catch(() => undefined)
      throw new Error(this.closed ? 'Proxy do navegador externo encerrado.' : 'O node_repl oficial não expõe a ferramenta js; nenhuma aba foi acessada.')
    }
    this.upstream = client
    // node_repl caiu depois de iniciado: encerra o proxy; a próxima execução tenta uma ponte nova.
    client.onclose = () => { if (this.upstream === client) void this.close() }
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve() })
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') { await this.close(); throw new Error('Não foi possível iniciar o proxy do navegador externo.') }
    this.address = `http://127.0.0.1:${address.port}`
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    if (response.writableEnded || response.destroyed) return
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(value))
  }

  private async call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<CallToolResult> {
    const stopped = 'O navegador externo foi revogado ou encerrado; nada foi executado.'
    if (this.closed || !this.upstream) return failure(stopped)
    if (!this.tools.some(tool => tool.name === name)) return failure('Ferramenta não disponível pelo Politron; nada foi executado.')
    const violation = externalBrowserCallViolation()
    if (violation) return failure(violation)
    const refusal = await this.authorize(name, args, signal).catch(() => 'A aprovação não pôde ser concluída; nada foi executado.')
    if (refusal) return failure(refusal)
    // Revalida depois da espera: revogação ou desistência do cliente durante a aprovação cancela o envio.
    if (this.closed || !this.upstream || signal.aborted) return failure(stopped)
    return await this.upstream.callTool({ name, arguments: args }) as CallToolResult
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (this.closed || request.headers.origin || request.headers.authorization !== `Bearer ${this.token}`) { this.json(response, 403, { error: 'Acesso não autorizado.' }); return }
    if (request.url !== '/mcp') { this.json(response, 404, { error: 'Recurso inexistente.' }); return }
    const abort = new AbortController()
    response.once('close', () => abort.abort())
    // Transporte MCP oficial em modo stateless: cada requisição pertence a esta sessão privada.
    const server = new Server({ name: EXTERNAL_BROWSER_MCP, version: '1.0.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools }))
    server.setRequestHandler(CallToolRequestSchema, async input => {
      try { return await this.call(input.params.name, input.params.arguments || {}, abort.signal) }
      catch { return failure('A chamada ao navegador externo falhou.') }
    })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    this.connections.add(server)
    response.once('close', () => { this.connections.delete(server); void server.close().catch(() => undefined) })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  }

  async close(): Promise<void> {
    this.closed = true
    for (const connection of this.connections) void connection.close().catch(() => undefined)
    this.connections.clear(); this.server.closeAllConnections(); this.server.close(); this.address = ''
    const upstream = this.upstream; this.upstream = null
    await upstream?.close().catch(() => undefined)
  }
}
