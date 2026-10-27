// node_repl falso para testes: expõe `js` e uma ferramenta extra, e registra cada execução em FAKE_NODE_REPL_LOG.
import { appendFileSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server({ name: 'fake-node-repl', version: '1.0.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: 'js', description: 'Executa JavaScript no REPL.', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'browser_use_full_cdp_access', description: 'CDP completo.', inputSchema: { type: 'object', properties: {} } },
] }))
server.setRequestHandler(CallToolRequestSchema, async request => {
  appendFileSync(process.env.FAKE_NODE_REPL_LOG, JSON.stringify(request.params) + '\n')
  return { content: [{ type: 'text', text: `executado: ${request.params.arguments?.code ?? ''}` }] }
})
await server.connect(new StdioServerTransport())
// Simula o node_repl caindo depois de iniciado.
if (process.env.FAKE_NODE_REPL_EXIT_MS) setTimeout(() => process.exit(1), Number(process.env.FAKE_NODE_REPL_EXIT_MS))
