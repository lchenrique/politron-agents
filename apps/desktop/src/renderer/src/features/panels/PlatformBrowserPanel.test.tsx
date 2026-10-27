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
  it('exige escolha explícita do agente e permite revogar o compartilhamento', async () => {
    const { api, emit } = install()
    const agent = { id: 'agent-a', name: 'Boo', computerUse: true } as never
    render(<PlatformBrowserPanel onNotice={vi.fn()} workspaceId="work" conversationId="chat" agents={[agent]} />)
    await act(async () => emit({ url: 'https://example.com/', title: 'Ex', loading: false, canGoBack: false, canGoForward: false, error: null }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Agente para compartilhar' }), { target: { value: 'agent-a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar com agente' }))
    expect(api.grantSharing).toHaveBeenCalledWith({ workspaceId: 'work', conversationId: 'chat', agentId: 'agent-a' })
    await act(async () => emit({ url: 'https://example.com/', title: 'Ex', loading: false, canGoBack: false, canGoForward: false, error: null, sharing: { workspaceId: 'work', conversationId: 'chat', agentId: 'agent-a' } }))
    expect(screen.getByText(/ações já enviadas podem concluir após revogar/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar compartilhamento' }))
    expect(api.revokeSharing).toHaveBeenCalled()
  })
  it('navegador externo exige agente e autorização explícita, mostra estado ativo e permite revogar', async () => {
    const { api } = install()
    const owner = { workspaceId: 'work', conversationId: 'chat', agentId: 'agent-a' }
    vi.mocked(api.setExternalGrant).mockResolvedValueOnce({ granted: true, problems: ['host nativo da extensão oficial ausente'] }).mockResolvedValueOnce({ granted: false, problems: [] })
    render(<PlatformBrowserPanel onNotice={vi.fn()} workspaceId="work" conversationId="chat" agents={[{ id: 'agent-a', name: 'Boo', computerUse: true } as never]} />)
    expect(screen.getByRole('button', { name: 'Autorizar navegador externo' })).toBeDisabled()
    expect(api.externalStatus).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Agente para compartilhar' }), { target: { value: 'agent-a' } })
    await act(async () => undefined)
    expect(api.externalStatus).toHaveBeenCalledWith(owner)
    expect(screen.getByText(/navegador externo desativado/i)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Autorizar navegador externo' })) })
    expect(api.setExternalGrant).toHaveBeenCalledWith(owner, true)
    expect(screen.getByText(/navegador externo autorizado/i)).toBeInTheDocument()
    expect(screen.getByText(/host nativo da extensão oficial ausente/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Revogar navegador externo' })) })
    expect(api.setExternalGrant).toHaveBeenLastCalledWith(owner, false)
    expect(screen.getByText(/navegador externo desativado/i)).toBeInTheDocument()
  })
  it('esconde a view nativa ao desmontar', () => {
    const { api } = install()
    const { unmount } = render(<PlatformBrowserPanel onNotice={vi.fn()} />)
    unmount()
    expect(api.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 }, false)
  })
})
