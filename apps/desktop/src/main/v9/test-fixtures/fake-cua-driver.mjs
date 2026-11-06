// cua-driver falso para testes: expõe ferramentas reais do driver (nomes do `cua-driver mcp`) e registra cada chamada em FAKE_CUA_LOG.
import { appendFileSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const tool = name => ({ name, description: `Fake ${name}.`, inputSchema: { type: 'object', properties: {} } })
const server = new Server({ name: 'fake-cua-driver', version: '0.0.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ['list_windows', 'launch_app', 'type_text', 'set_config', 'install_ffmpeg'].map(tool) }))
server.setRequestHandler(CallToolRequestSchema, async request => {
  if (process.env.FAKE_CUA_LOG) appendFileSync(process.env.FAKE_CUA_LOG, JSON.stringify(request.params) + '\n')
  return { content: [{ type: 'text', text: `ok: ${request.params.name}` }] }
})
await server.connect(new StdioServerTransport())
