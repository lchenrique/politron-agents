import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformBrowserPanel } from './PlatformBrowserPanel'
import type { PlatformBrowserAPI, PlatformBrowserState } from '../../../../shared/platform-browser'

function install() {
  let listener: ((state: PlatformBrowserState | null) => void) | null = null
  const api: PlatformBrowserAPI = {
    navigate: vi.fn(async url => ({ url, title: '', loading: true, canGoBack: false, canGoForward: false, error: null })),
    state: vi.fn(async () => null), setBounds: vi.fn(async () => undefined), back: vi.fn(async () => undefined), forward: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined), openExternal: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    setSharingContext: vi.fn(async () => undefined), grantSharing: vi.fn(async () => undefined), revokeSharing: vi.fn(async () => undefined),
    externalStatus: vi.fn(async () => ({ granted: false, problems: [] })), setExternalGrant: vi.fn(async () => ({ granted: false, problems: [] })),
    onState: vi.fn(callback => { listener = callback; return () => { listener = null } }),
    onReveal: vi.fn(() => () => undefined),
  }
  window.platformBrowserAPI = api
  return { api, emit: (state: PlatformBrowserState | null) => listener?.(state) }
}
afterEach(() => { delete window.platformBrowserAPI })

describe('PlatformBrowserPanel', () => {
  it('navega pelo endereço, aplica HTTPS por padrão e recusa outros protocolos', async () => {
    const { api } = install()
    const notice = vi.fn()
    render(<PlatformBrowserPanel onNotice={notice} />)
    const input = screen.getByRole('textbox', { name: 'Endereço' })
    fireEvent.change(input, { target: { value: 'example.com/docs' } })
    fireEvent.submit(input.closest('form')!)
    expect(api.navigate).toHaveBeenCalledWith('https://example.com/docs')
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
    fireEvent.submit(input.closest('form')!)
    expect(api.navigate).toHaveBeenCalledTimes(1)
    expect(notice).toHaveBeenCalledWith('Digite um endereço HTTP ou HTTPS.')
  })
  it('controles usam o estado do main e o botão externo só abre a URL atual', async () => {
    const { api, emit } = install()
    render(<PlatformBrowserPanel onNotice={vi.fn()} />)
    await act(async () => emit({ url: 'https://example.com/', title: 'Ex', loading: false, canGoBack: true, canGoForward: false, error: null }))
    expect(screen.getByRole('textbox', { name: 'Endereço' })).toHaveValue('https://example.com/')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(api.back).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    expect(api.reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no navegador do sistema' }))
    expect(api.openExternal).toHaveBeenCalledWith('https://example.com/')
  })
  const page = { url: 'https://example.com/', title: 'Ex', loading: false, canGoBack: false, canGoForward: false, error: null }
  const boo = [{ id: 'agent-a', name: 'Boo', computerUse: true } as never]
  it('sem agente usando, não mostra controles de compartilhamento nem do navegador externo', async () => {
    const { emit } = install()
    render(<PlatformBrowserPanel onNotice={vi.fn()} workspaceId="work" conversationId="chat" agents={boo} />)
    await act(async () => emit(page))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/navegador externo/i)).not.toBeInTheDocument()
  })
  it('mostra o agente que está usando, para e retoma', async () => {
    const { api, emit } = install()
    const owner = { workspaceId: 'work', conversationId: 'chat', agentId: 'agent-a' }
    render(<PlatformBrowserPanel onNotice={vi.fn()} workspaceId="work" conversationId="chat" agents={boo} />)
    await act(async () => emit({ ...page, sharing: owner }))
    expect(screen.getByRole('status')).toHaveTextContent('Boo está usando o navegador')
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }))
    expect(api.revokeSharing).toHaveBeenCalled()
    await act(async () => emit({ ...page, sharing: null, paused: owner }))
    expect(screen.getByRole('status')).toHaveTextContent('Boo pausado neste navegador')
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }))
    expect(api.grantSharing).toHaveBeenCalledWith(owner)
  })
  it('uso por outra conversa é indicado sem mexer no contexto', async () => {
    const { api, emit } = install()
    const { unmount } = render(<PlatformBrowserPanel onNotice={vi.fn()} workspaceId="work" conversationId="chat" agents={boo} />)
    await act(async () => emit({ ...page, sharing: { workspaceId: 'work', conversationId: 'outra', agentId: 'agent-a' } }))
    expect(screen.getByRole('status')).toHaveTextContent('Boo está usando o navegador em outra conversa')
    unmount()
    expect(api.setSharingContext).not.toHaveBeenCalled()
  })
  it('esconde a view nativa ao desmontar', () => {
    const { api } = install()
    const { unmount } = render(<PlatformBrowserPanel onNotice={vi.fn()} />)
    unmount()
    expect(api.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 }, false)
  })
})
