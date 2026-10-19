import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation } from '../../../../shared/v9'
import { ChatHeader } from './ChatHeader'

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
    expect(screen.getByTestId('compact-chat-header')).toHaveClass('h-14')
    expect(screen.getByRole('heading', { name: 'Lyra' })).toBeInTheDocument()
    expect(screen.getByText('Planejamento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver detalhes de Lyra' })).toBeInTheDocument()
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

  it('não duplica a seleção de modelo: o cabeçalho não tem seletor próprio', () => {
    render(<ChatHeader selected={conversation} agents={[agent]} selectedWorkspace={undefined} onParticipantsChange={vi.fn()} onOpenComputerUse={vi.fn()} onEditConversation={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Modelo da conversa' })).not.toBeInTheDocument()
  })
})
