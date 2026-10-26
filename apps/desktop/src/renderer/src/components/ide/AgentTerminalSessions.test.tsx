import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTerminalSession, WorkspaceEvent } from '../../../../shared/v9'

const written: string[] = []
vi.mock('@xterm/xterm', () => ({ Terminal: class { loadAddon() {} open() {} dispose() {} reset() { written.length = 0 } write(data: string) { written.push(data) } } }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
import { AgentTerminalSessions } from './AgentTerminalSessions'

const session = (id: string, patch: Partial<AgentTerminalSession> = {}): AgentTerminalSession => ({ id, workspaceId: 'w1', conversationId: 'c1', runId: 'r', agentId: 'a', agentName: 'Atlas',
  command: 'npm run dev', cwd: 'C:/repo', mode: 'process', status: 'running', exitCode: null, truncated: false, createdAt: '', finishedAt: null, ...patch })
let emit: (event: WorkspaceEvent) => void
const original = window.appAPI
beforeEach(() => {
  written.length = 0
  window.appAPI = {
    agentTerminalSessions: vi.fn(async () => [{ ...session('s1'), output: 'pronto\r\n' }]),
    agentTerminalStop: vi.fn(async () => session('s1', { status: 'interrupted' })),
    onEvent: vi.fn(callback => { emit = callback; return () => undefined }),
  } as unknown as typeof window.appAPI
})
afterEach(() => { window.appAPI = original })

describe('AgentTerminalSessions', () => {
  it('reidrata sessões, transmite saída, filtra outra conversa e para no escopo exibido', async () => {
    const started = vi.fn()
    render(<AgentTerminalSessions workspaceId="w1" conversationId="c1" onStarted={started} />)
    expect(await screen.findByText('npm run dev')).toBeInTheDocument()
    await waitFor(() => expect(written.join('')).toContain('pronto'))
    expect(window.appAPI.agentTerminalSessions).toHaveBeenCalledWith('c1', 'w1')
    act(() => emit({ type: 'agentTerminal', event: 'output', session: session('s1'), data: 'GET /\r\n' }))
    expect(written.join('')).toContain('GET /')
    act(() => emit({ type: 'agentTerminal', event: 'started', session: session('x', { conversationId: 'c2', command: 'rm -rf' }) }))
    act(() => emit({ type: 'agentTerminal', event: 'output', session: session('x', { conversationId: 'c2' }), data: 'segredo' }))
    expect(screen.queryByText('rm -rf')).toBeNull()
    expect(written.join('')).not.toContain('segredo')
    expect(started).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Parar npm run dev' }))
    expect(window.appAPI.agentTerminalStop).toHaveBeenCalledWith('s1', 'c1', 'w1')
    act(() => emit({ type: 'agentTerminal', event: 'finished', session: session('s1', { status: 'interrupted' }) }))
    expect(screen.getByText('interrompido')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Parar npm run dev' })).toBeNull()
    act(() => emit({ type: 'agentTerminal', event: 'started', session: session('s2', { command: 'npm test', mode: 'command' }) }))
    expect(started).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /npm test/, pressed: true })).toBeInTheDocument()
  })
  it('não mostra saída de outra conversa quando uma resposta antiga chega atrasada', async () => {
    let resolvePrevious!: (value: Awaited<ReturnType<typeof window.appAPI.agentTerminalSessions>>) => void
    const previous = new Promise<Awaited<ReturnType<typeof window.appAPI.agentTerminalSessions>>>(resolve => { resolvePrevious = resolve })
    const list = vi.fn().mockReturnValueOnce(previous).mockResolvedValueOnce([])
    window.appAPI.agentTerminalSessions = list as unknown as typeof window.appAPI.agentTerminalSessions
    const view = render(<AgentTerminalSessions key="w1:c1" workspaceId="w1" conversationId="c1" />)
    view.rerender(<AgentTerminalSessions key="w1:c2" workspaceId="w1" conversationId="c2" />)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await act(async () => { resolvePrevious([{ ...session('s1'), output: 'SAIDA-PRIVADA-C1' }]) })
    expect(screen.queryByText('npm run dev')).toBeNull()
    expect(written.join('')).not.toContain('SAIDA-PRIVADA-C1')
    expect(list).toHaveBeenNthCalledWith(1, 'c1', 'w1')
    expect(list).toHaveBeenNthCalledWith(2, 'c2', 'w1')
  })

  it('recarrega a lista ao reconectar ao host', async () => {
    render(<AgentTerminalSessions workspaceId="w1" conversationId="c1" />)
    await screen.findByText('npm run dev')
    act(() => emit({ type: 'changed', reason: 'connection-restored' }))
    await waitFor(() => expect(window.appAPI.agentTerminalSessions).toHaveBeenCalledTimes(2))
  })
})
