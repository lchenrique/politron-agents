import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HeadlessCliRuntime } from './headless-cli'
import type { Agent } from '../../shared/v9'

const dirs: string[] = []
const agent = {
  id: 'smoke', name: 'Smoke', alias: 'smoke', description: '', instructions: 'Teste.',
  runtime: 'opencode', model: 'oc/free-model', color: '#fff', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
} satisfies Agent
afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('adaptação segura dos CLIs em modo conversa', () => {
  it.each(['opencode', 'antigravity'] as const)('resolve o executável e cria sessão sem iniciar uma inferência: %s', async kind => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-cli-probe-'))
    dirs.push(directory)
    const runtime = new HeadlessCliRuntime(kind, directory)
    try {
      const thread = await runtime.thread({ ...agent, runtime: kind }, directory, [])
      expect(thread).toMatch(/^[0-9a-f-]{36}$/)
    } finally { runtime.close() }
  }, 18000)

  it('traduz eventos de texto e fim de turno de ambos os protocolos para o Politron', () => {
    for (const kind of ['opencode', 'antigravity'] as const) {
      const runtime = new HeadlessCliRuntime(kind, tmpdir())
      const events: Record<string, unknown>[] = []
      runtime.on('event', event => events.push(event))
      const session = { id: 'thread', agent, history: [], text: '', turnId: 'turn', finished: false, stopping: false }
      const internal = runtime as unknown as { receive(s: typeof session, p: Record<string, unknown>): void; finish(s: typeof session, status: 'completed'): void }
      if (kind === 'opencode') {
        internal.receive(session, { type: 'text', part: { text: 'olá' } })
        internal.finish(session, 'completed')
      } else {
        internal.receive(session, { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'olá' } })
        internal.receive(session, { event: 'result', result: { status: 'SUCCESS' } })
      }
      expect(events.map(event => event.method)).toEqual(['item/agentMessage/delta', 'item/completed', 'turn/completed'])
      expect((events.at(-1) as any).params.turn.status).toBe('completed')
      runtime.close()
    }
  })
})
