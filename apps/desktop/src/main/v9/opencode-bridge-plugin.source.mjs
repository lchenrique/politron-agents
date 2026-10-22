import { z } from 'zod'

// OpenCode v1 plugin. This module is bundled at development time so it does
// not depend on the user's OpenCode installation or any global npm package.
export default async function boobotPlugin(_input, options) {
  if (!options?.baseUrl || !options?.token) throw new Error('Boobot tool bridge is not configured')
  const request = async (pathname, body) => {
    const response = await fetch(new URL(pathname, options.baseUrl), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + options.token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(125000)
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Boobot bridge HTTP ' + response.status)
    return data
  }
  return {
    tool: {
      boobot_tools: {
        description: 'Lista as ferramentas do Boobot autorizadas para esta sessão, com descrições e parâmetros JSON. Consulte ao precisar atuar no workspace, delegar ou pesquisar.',
        args: {},
        execute: async (_args, context) => {
          const data = await request('/sessions/' + encodeURIComponent(context.sessionID) + '/tools')
          return { title: 'Ferramentas do Boobot', output: JSON.stringify(data.tools) }
        }
      },
      boobot_call: {
        description: 'Executa uma ferramenta autorizada do Boobot. Use nomes e argumentos da lista boobot_tools. Aprovações humanas e limites de workspace são decididos exclusivamente pelo Boobot. Nunca invente resultados.',
        args: {
          name: z.string().min(1).describe('Nome exato da ferramenta do Boobot'),
          argumentsJson: z.string().describe('Objeto JSON serializado com os argumentos, conforme o esquema da ferramenta')
        },
        execute: async (args, context) => {
          const result = await request('/sessions/' + encodeURIComponent(context.sessionID) + '/call', args)
          return { title: args.name, output: JSON.stringify(result) }
        }
      }
    }
  }
}
