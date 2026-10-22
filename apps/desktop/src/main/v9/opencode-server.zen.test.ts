// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenCodeServerRuntime } from './opencode-server'
import type { Agent } from '../../shared/v9'

describe('OpenCode Zen gratuito via servidor autenticado', () => {
  it.skipIf(process.env.BOOBOT_LIVE_ZEN !== '1')('responde pelo adaptador com ferramentas nativas sujeitas a aprovação', async () => {
    const root = mkdtempSync(join(tmpdir(), 'boobot-zen-'))
    const model = process.env.BOOBOT_ZEN_MODEL || 'opencode/mimo-v2.6-flash-free'
    const agent = {
      id: 'zen-smoke', name: 'Zen Smoke', alias: 'zen-smoke', description: '', instructions: '',
      runtime: 'opencode', model, color: '#fff', avatar: '', canWrite: false,
      computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
    } satisfies Agent
    const runtime = new OpenCodeServerRuntime(root)
    try {
      const thread = await runtime.thread(agent, root, [])
      let output = ''
      const completion = new Promise<{status: string; error?: {message: string}}>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('OpenCode Zen excedeu 110 segundos.')), 110_000)
        runtime.on('event', event => {
          if (event.method === 'item/agentMessage/delta') output += event.params.delta
          if (event.method === 'turn/completed') {
            clearTimeout(timeout)
            resolve(event.params.turn)
          }
        })
      })
      await runtime.send(thread.id, 'Responda apenas com a palavra ZEN_OK, sem explicação.', model, 110_000)
      const turn = await completion
      console.log(JSON.stringify({model, status:turn.status, output:output.slice(0,150), error:turn.error?.message}))
      expect(turn.status, turn.error?.message).toBe('completed')
      expect(output).toContain('ZEN_OK')
    } finally {
      runtime.close()
      await new Promise(resolve => setTimeout(resolve, 1500))
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }, 130_000)
  it.skipIf(process.env.BOOBOT_LIVE_ZEN_TOOLS !== '1')('invoca ferramenta do broker e usa retorno autorizado', async () => {
    const root = mkdtempSync(join(tmpdir(), 'boobot-zen-broker-'))
    const model = process.env.BOOBOT_ZEN_MODEL || 'opencode/big-pickle'
    const agent = {
      id: 'zen-broker', name: 'Zen Broker', alias: 'zen-broker', description: '',
      instructions: '', runtime: 'opencode', model, color: '#fff', avatar: '',
      canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
    } satisfies Agent
    const runtime = new OpenCodeServerRuntime(root)
    let calls = 0, output = ''
    try {
      const thread = await runtime.thread(agent, root, [{
        type: 'function' as const,
        name: 'group_members',
        description: 'Retorna a lista autorizada de integrantes do grupo. Esta chamada é necessária para responder.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      }])
      const completion = new Promise<{status:string;error?:{message:string}}>((resolve,reject) => {
        const limit=setTimeout(()=>reject(new Error('Broker Zen excedeu 110 segundos')),110000)
        runtime.on('event', event => {
          if (event.method === 'item/tool/call') {
            calls++
            runtime.respond(event.id, { success:true, members:['Íris QA'] })
          }
          if (event.method === 'item/agentMessage/delta') output+=event.params.delta
          if (event.method === 'turn/completed') {
            clearTimeout(limit)
            resolve(event.params.turn)
          }
        })
      })
      await runtime.send(thread.id,
        'Consulte a ferramenta group_members para descobrir o nome do integrante. Em sua resposta final, diga SOMENTE o nome retornado pela ferramenta. Não invente.',
        model, 105000)
      const result = await completion
      console.log(JSON.stringify({model,status:result.status,calls,output:output.slice(0,150),error:result.error?.message}))
      expect(result.status,result.error?.message).toBe('completed')
      expect(calls).toBe(1)
      expect(output).toContain('Íris QA')
    } finally {
      runtime.close()
      await new Promise(resolve=>setTimeout(resolve,1500))
      rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200})
    }
  },130000)

})
