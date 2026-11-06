// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false }, safeStorage: { isEncryptionAvailable: () => false } }))
import { AppService } from '../v9/workspace'
import type { AgentRuntime } from '../v9/agent-runtime'
import { HostServer } from './server'
import { HostClient } from './client'
import { HostRpc } from './rpc'
import { createIdentity, pairingLink, parsePairing } from './identity'
import type { AgentTerminalSession, AgentTerminalSessionWithOutput, WorkspaceEvent } from '../../shared/v9'

class IdleRuntime extends EventEmitter { async models() { return [] } close() {} }

it('PTY do agente roda no host, transmite eventos, sobrevive à desconexão do cliente e para após reconectar', async () => {
  const root = mkdtempSync(join(tmpdir(), 'boobot-remote-pty-'))
  const service = new AppService(join(root, 'data'), new IdleRuntime() as unknown as AgentRuntime, new IdleRuntime() as unknown as AgentRuntime)
  const rpc = new HostRpc()
  rpc.register('v9:agentTerminalSessions', service.agentTerminalSessions.bind(service) as (...args: never[]) => unknown)
  rpc.register('v9:agentTerminalStop', service.agentTerminalStop.bind(service) as (...args: never[]) => unknown)
  const identity = createIdentity('Host PTY'), server = new HostServer(identity, rpc.dispatch)
  service.on('workspace-event', (data: WorkspaceEvent) => server.broadcast({ channel: 'v9:event', data }))
  const port = await server.listen('127.0.0.1', 0)
  const link = parsePairing(pairingLink(identity, `ws://127.0.0.1:${port}/boobot`))
  let second: HostClient | null = null
  try {
    const path = join(root, 'projeto'); mkdirSync(path)
    writeFileSync(join(path, 'server.cjs'), "console.log('REMOTO-PRONTO'); setInterval(() => {}, 1000)")
    const workspace = service.store.saveWorkspace({ name: 'Remoto', path })
    const agent = service.saveAgent({ instructions: 'Fixture.', name: 'Remoto', alias: 'remoto', canWrite: true })
    const conversation = service.store.saveConversation({ name: 'Remoto', workspaceId: workspace.id, agentIds: [agent.id] })

    const first = new HostClient(link)
    const received: WorkspaceEvent[] = []
    first.on('event', ({ data }: { data: WorkspaceEvent }) => received.push(data))
    await first.connect()
    const session = service.agentTerminals.start({ command: `& ${JSON.stringify(process.execPath)} server.cjs`, cwd: path, owner: { workspaceId: workspace.id, conversationId: conversation.id, runId: 'run', agentId: agent.id, agentName: agent.name } })
    await vi.waitFor(() => expect(received.some(event => event.type === 'agentTerminal' && event.event === 'output' && event.data?.includes('REMOTO-PRONTO'))).toBe(true), { timeout: 10000 })
    expect(received.find(event => event.type === 'agentTerminal')).toMatchObject({ event: 'started', session: { id: session.id, conversationId: conversation.id } })
    first.close()

    // Desconectar o cliente não encerra o processo no host.
    await new Promise(resolve => setTimeout(resolve, 300))
    second = new HostClient(link)
    await second.connect()
    const listed = await second.call('v9:agentTerminalSessions', [conversation.id, workspace.id]) as AgentTerminalSessionWithOutput[]
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: session.id, status: 'running' })
    expect(listed[0].output).toContain('REMOTO-PRONTO')
    await expect(second.call('v9:agentTerminalStop', [session.id, 'outra-conversa', workspace.id])).rejects.toThrow()
    await second.call('v9:agentTerminalStop', [session.id, conversation.id, workspace.id]) as AgentTerminalSession
    await vi.waitFor(async () => expect((await second!.call('v9:agentTerminalSessions', [conversation.id, workspace.id]) as AgentTerminalSession[])[0].status).toBe('interrupted'), { timeout: 10000 })

    expect(rpc.supports('v9:openExternalTerminal')).toBe(false)
  } finally {
    second?.close()
    await server.close()
    service.dispose()
    await new Promise(resolve => setTimeout(resolve, 1500))
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}, 30000)
