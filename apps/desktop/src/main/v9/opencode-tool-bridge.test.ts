// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OpenCodeToolBridge } from './opencode-tool-bridge'

const tools = [{
  type: 'function' as const, name: 'workspace_read', description: 'Lê arquivo permitido',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}]

describe('Ponte nativa autenticada para ferramentas do Boobot', () => {
  it('exige token, sessão e ferramenta autorizada; encaminha apenas chamada válida', async () => {
    let active = true
    const calls: { name: string; args: Record<string, unknown>; callId: string }[] = []
    const bridge = new OpenCodeToolBridge(session => session === 'active'
      ? { active, tools, invoke: async (name, args, callId) => {
        calls.push({ name, args, callId })
        return { success: true, text: 'conteúdo autorizado' }
      } }
      : undefined)
    const { baseUrl, token } = await bridge.start()
    const url = baseUrl + '/sessions/active/call'
    const post = (body: unknown, auth = token) => fetch(url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
    try {
      expect((await post({ name: 'workspace_read', argumentsJson: '{"path":"ok.txt"}' }, 'wrong')).status).toBe(401)
      expect((await fetch(baseUrl + '/sessions/unknown/tools', { headers: { Authorization: 'Bearer ' + token } })).status).toBe(404)
      const listed = await fetch(baseUrl + '/sessions/active/tools', { headers: { Authorization: 'Bearer ' + token } })
      expect((await listed.json()).tools[0].name).toBe('workspace_read')
      expect((await post({ name: 'workspace_write', argumentsJson: '{}' })).status).toBe(403)
      expect((await post({ name: 'workspace_read', argumentsJson: '[]' })).status).toBe(400)
      expect((await post({ name: 'workspace_read', argumentsJson: 'not-json' })).status).toBe(400)
      expect((await post({ name: 'workspace_read', argumentsJson: '{"path":"ok.txt"}' })).status).toBe(200)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ name: 'workspace_read', args: { path: 'ok.txt' } })
      active = false
      expect((await post({ name: 'workspace_read', argumentsJson: '{"path":"ok.txt"}' })).status).toBe(404)
    } finally { bridge.close() }
  })
  it('nunca transforma negação ou falha do broker em sucesso', async () => {
    const bridge = new OpenCodeToolBridge(() => ({
      active: true, tools, invoke: async () => { throw new Error('Usuário negou a autorização.') }
    }))
    const { baseUrl, token } = await bridge.start()
    try {
      const result = await fetch(baseUrl + '/sessions/demo/call', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: 'workspace_read', argumentsJson: '{}' })
      })
      expect(result.status).toBe(409)
      expect((await result.json()).error).toContain('negou')
    } finally { bridge.close() }
  })
})
