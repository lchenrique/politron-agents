// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenCodeServerRuntime } from './opencode-server'
import type { Agent } from '../../shared/v9'

describe('smoke real OpenCode v1 server without AI spend', () => {
  it.skipIf(process.env.BOOBOT_LIVE_OPENCODE !== '1')('starts authenticated loopback server, creates and resumes native session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'boobot-oc-server-'))
    const runtime = new OpenCodeServerRuntime(root)
    const agent = { id:'smoke', name:'Smoke', alias:'smoke', description:'',
      instructions:'', runtime:'opencode', model:'opencode/beam-free',
      color:'#fff', avatar:'',canWrite:false,computerUse:false,approvalMode:'ask',revision:1,createdAt:'' } satisfies Agent
    try {
      const first = await runtime.thread(agent, root, [])
      expect(first.id.length).toBeGreaterThan(5)
      expect(first.history).toBe('empty')
      const next = await runtime.thread(agent, root, [], first.id)
      expect(next).toEqual({ id:first.id, history:'retained' })
      console.log('OpenCode v1 REST live session created and reused:', first.id.length)
    } finally {
      runtime.close()
      await new Promise(resolve => setTimeout(resolve, 2000))
      rmSync(root, { recursive:true, force:true, maxRetries:5, retryDelay:200 })
    }
  }, 35000)
})
