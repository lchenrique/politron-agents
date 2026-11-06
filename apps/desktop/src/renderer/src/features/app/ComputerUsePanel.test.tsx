import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComputerUsePanel } from './ComputerUsePanel'
import type { ComputerUseStatus } from '../../../../shared/computer-use'

const runtimes = [{ runtime: 'codex', supported: true, note: 'MCP.' }, { runtime: 'pi', supported: false, note: 'Sem MCP.' }]
afterEach(() => { delete window.computerUseAPI })

describe('ComputerUsePanel', () => {
  it('mostra driver instalado, motores e revoga uma autorização', async () => {
    const installed: ComputerUseStatus = { driver: { state: 'installed', version: '0.21.0', path: 'C:/cua/cua-driver.exe', source: 'cua' }, runtimes, grants: [{ conversationId: 'c1', agentId: 'a1', conversationTitle: 'Notas', agentName: 'Boo' }] }
    const revoke = vi.fn().mockResolvedValue({ ...installed, grants: [] })
    window.computerUseAPI = { status: vi.fn().mockResolvedValue(installed), revoke }
    render(<ComputerUsePanel />)
    expect(await screen.findByText(/instalado \(versão 0.21.0\)/)).toBeInTheDocument()
    expect(screen.getByText(/Codex/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    expect(revoke).toHaveBeenCalledWith('c1', 'a1')
    await waitFor(() => expect(screen.getByText('Nenhuma conversa autorizada.')).toBeInTheDocument())
  })
  it('sem o driver, explica e aponta o projeto oficial', async () => {
    window.computerUseAPI = { status: vi.fn().mockResolvedValue({ driver: { state: 'missing', error: 'cua-driver não instalado.' }, runtimes, grants: [] }), revoke: vi.fn() }
    render(<ComputerUsePanel />)
    expect(await screen.findByText(/não instalado$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'trycua/cua' })).toHaveAttribute('href', 'https://github.com/trycua/cua')
  })
})
