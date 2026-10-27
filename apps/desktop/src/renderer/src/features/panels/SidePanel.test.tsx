import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidePanel } from './SidePanel'

vi.mock('@/components/ide/TerminalPanel', () => ({ default: () => <div>Terminal de teste</div> }))

afterEach(() => { delete window.platformBrowserAPI })

describe('painel lateral do Politron', () => {
  it('mostra o navegador compartilhado da plataforma em vez do navegador por agente', async () => {
    window.platformBrowserAPI = {
      navigate: vi.fn(async () => ({ url: 'https://example.com/', title: '', loading: false, canGoBack: false, canGoForward: false, error: null })),
      state: vi.fn(async () => null), setBounds: vi.fn(async () => undefined), back: vi.fn(async () => undefined), forward: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined), openExternal: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
      setSharingContext: vi.fn(async () => undefined), grantSharing: vi.fn(async () => undefined), revokeSharing: vi.fn(async () => undefined),
      onState: vi.fn(() => () => undefined),
    } as never
    render(<SidePanel computerOpen onCloseComputer={vi.fn()} agents={[]} onChanged={vi.fn()} workspaceId="workspace-1" conversationId="chat-1" />)
    expect(await screen.findByRole('textbox', { name: 'Endereço' })).toBeInTheDocument()
    expect(screen.queryByText('Navegador dos agentes')).not.toBeInTheDocument()
  })
})
