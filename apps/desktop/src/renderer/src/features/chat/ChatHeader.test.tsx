import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation, MessageSearchHit } from '../../../../shared/v9'
import { ChatHeader, ConversationAvatar, ConversationTools } from './ChatHeader'

const agent: Agent = { id: 'a1', name: 'Lyra', alias: 'lyra', description: '', instructions: '', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const conversation: Conversation = { id: 'c1', kind: 'direct', name: 'Planejamento', agentIds: ['a1'], workspaceId: 'ws1', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }

describe('cabeçalho da conversa', () => {
  it('abre detalhes ao clicar no avatar sem remover o agente da conversa', () => {
    const onParticipantsChange = vi.fn()
    const onOpenAgent = vi.fn()
    render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onOpenAgent={onOpenAgent} onParticipantsChange={onParticipantsChange} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Lyra' }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
    expect(onParticipantsChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ações da conversa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover Lyra' })).not.toBeInTheDocument()
  })

  it('usa barra compacta, com avatar no canto e titulo legivel', () => {
    render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    const header = screen.getByTestId('compact-chat-header')
    expect(header).toHaveClass('h-12')
    expect(header.tagName).toBe('HEADER')
    expect(screen.getByRole('heading', { name: 'Lyra' })).toBeInTheDocument()
    expect(screen.getByText('Planejamento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver detalhes de Lyra' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' })).toBeInTheDocument()
  })

  it('na PWA sem leitura de arquivos não oferece um menu de ações vazio', () => {
    render(<ChatHeader browserMode canReadFiles={false} selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ações da conversa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' })).toBeInTheDocument()
  })

  it('mostra grupo com avatares sobrepostos e permite editar participantes', () => {
    const second = { ...agent, id: 'a2', name: 'Nina', alias: 'nina' }
    const group: Conversation = { ...conversation, id: 'g1', kind: 'group', name: 'Equipe de pesquisa', agentIds: ['a1', 'a2'] }
    const onEditConversation = vi.fn()
    render(<ChatHeader selected={group} agents={[agent, second]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={onEditConversation} />)
    expect(screen.getByRole('heading', { name: 'Equipe de pesquisa' })).toBeInTheDocument()
    expect(screen.getByText('2 participantes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver participantes do grupo' }))
    expect(onEditConversation).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Ações da conversa' })).toBeInTheDocument()
  })

  it('busca no histórico pelo popover e abre o resultado', async () => {
    const hit = { message: { id: 'm1', author: 'Lyra', createdAt: '2026-10-16T12:00:00.000Z' }, snippet: 'trecho encontrado' } as unknown as MessageSearchHit
    const onSearchHistory = vi.fn(async () => [hit])
    const onOpenSearchHit = vi.fn()
    render(<ConversationTools compact selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} onSearchHistory={onSearchHistory} onOpenSearchHit={onOpenSearchHit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' }))
    expect(screen.getByRole('dialog', { name: 'Busca no histórico' })).toHaveAttribute('data-dsh-menu-surface', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar no histórico desta conversa' }), { target: { value: 'trecho' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByText('trecho encontrado'))
    expect(onSearchHistory).toHaveBeenCalledWith('trecho')
    expect(onOpenSearchHit).toHaveBeenCalledWith(hit)
  })

  it('mantém a busca ancorada ao cabeçalho sem rolar a viewport estreita', () => {
    const windowWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    const windowHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    const rect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect')
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 })
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', { configurable: true, value() {
      return this.getAttribute('aria-label') === 'Buscar no histórico desta conversa'
        ? new DOMRect(280, 20, 28, 28)
        : new DOMRect(0, 0, 0, 0)
    } })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
      return this.getAttribute('aria-label') === 'Busca no histórico' ? 288 : 0
    } })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
      return this.getAttribute('aria-label') === 'Busca no histórico' ? 56 : 0
    } })
    try {
      render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' }))
      const panel = screen.getByRole('dialog', { name: 'Busca no histórico' })
      expect(panel).toHaveStyle({ position: 'fixed', left: '20px', top: '52px' })
    } finally {
      if (windowWidth) Object.defineProperty(window, 'innerWidth', windowWidth)
      if (windowHeight) Object.defineProperty(window, 'innerHeight', windowHeight)
      if (rect) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', rect)
      if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
      else delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth
      if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight)
      else delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight
    }
  })

  it('abre as ações da conversa em uma superfície de menu DSH', () => {
    render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ações da conversa' }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Arquivos' })).toBeInTheDocument()
  })

  it('o avatar compacto da aba mantém os detalhes do Boo', () => {
    const onOpenAgent = vi.fn()
    render(<ConversationAvatar compact onOpenAgent={onOpenAgent} selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Lyra' }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('não duplica a seleção de modelo: o cabeçalho não tem seletor próprio', () => {
    render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Modelo da conversa' })).not.toBeInTheDocument()
  })
})
