// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '../../shared/v9'
import { PiRuntime, BRIDGE_EXTENSION } from './pi'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const sessions: Array<{ runtime: PiRuntime; directory: string }> = []
afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.runtime.close()
    rmSync(session.directory, { force: true, recursive: true, maxRetries: 20, retryDelay: 100 })
  }
})

const live = process.env.POLITRON_PI_LIVE_SMOKE === '1'
const agent: Agent = {
  id: 'pi-live-test', name: 'Smoke Pi', alias: 'smokepi',
  description: '', instructions: 'Responda sem usar ferramentas externas.',
  runtime: 'pi', model: '', color: '#aabbcc', avatar: '', canWrite: false,
  computerUse: false, approvalMode: 'ask', revision: 1, createdAt: new Date(0).toISOString(),
}

describe('Pi CLI real, sem envio de mensagens nem consumo de modelos', () => {
  it.skipIf(!live)('descobre catálogo da sessão RPC local', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-pi-smoke-'))
    const runtime = new PiRuntime(directory)
    sessions.push({ runtime, directory })
    const models = await runtime.models()
    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.runtime === 'pi' && model.id.includes('/'))).toBe(true)
  }, 30000)

  it.skipIf(!live)('abre sessão sem ferramentas nativas e encerra sem executar prompt', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-pi-smoke-'))
    const runtime = new PiRuntime(directory)
    sessions.push({ runtime, directory })
    const extension = join(directory, 'check-bridge.mjs')
    writeFileSync(extension, BRIDGE_EXTENSION)
    execFileSync(process.execPath, ['--check', extension])
    // No Windows, subprocessos temporários podem manter o cwd travado após o encerramento.
    const thread = await runtime.thread(agent, process.cwd(), [])
    expect(thread).toMatch(/^[\da-f]{8}-/)
  }, 30000)
})
