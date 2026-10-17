import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => localStorage.clear())
import { emptySnapshot } from '../app/appShellShared'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const workspace: Workspace = { id: 'workspace-1', name: 'Instruções de Paz', kind: 'free', path: 'C:/workspace', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], workspaces: [workspace] }

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onSetChief={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('contatos de agentes na barra lateral', () => {
  it('abre a conversa direta ao selecionar um agente', () => {
    const onOpenAgent = vi.fn()
    renderSidebar({ onOpenAgent })
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agentes/ }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: /Lyra @lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('mantém a navegação compacta sem repetir o símbolo antigo do Politron', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: 'Criar novo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova sessão livre' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Criar novo' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Nova sessão livre' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
  })

  it('oferece uma única busca para projetos e agentes', () => {
    renderSidebar()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.queryByRole('textbox', { name: 'Filtrar lista' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agentes/ }), { button: 0 })
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('reserva altura para a busca sem sobrepor as abas', () => {
    renderSidebar()
    const palette = screen.getByRole('combobox', { name: 'Busca rápida' })
    const container = palette.closest('div.relative')
    expect(container).toHaveClass('h-[46px]')
    expect(container).not.toHaveClass('!h-auto')
    expect(screen.getByRole('tab', { name: /Projetos/ })).toBeVisible()
    expect(screen.getByRole('tab', { name: /Agentes/ })).toBeVisible()
  })

  it('encontra um projeto pela busca rápida do Kokonut UI', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({ onSelectWorkspace })
    const palette = screen.getByRole('combobox', { name: 'Busca rápida' })
    fireEvent.focus(palette)
    fireEvent.change(palette, { target: { value: 'Instruções de Paz' } })
    fireEvent.keyDown(palette, { key: 'Enter' })
    expect(onSelectWorkspace).toHaveBeenCalledWith(workspace.id)
  })

  it('inicia uma conversa no workspace pelo atalho da árvore', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: `Nova conversa em ${workspace.name}` }))
    expect(onStartConversation).toHaveBeenCalledWith(workspace.id)
  })

  it('mantém Chief compacto com avatar menor e sem título repetido', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] } })
    const card = screen.getByRole('region', { name: 'Chief' })
    expect(card).toHaveTextContent('Chief · Coordenação')
    expect(card.querySelector('[style*="width: 30px"]')).not.toBeNull()
    expect(card.querySelector('[style*="width: 42px"]')).toBeNull()
    expect(screen.getByRole('tab', { name: /Agentes 1/ })).toBeInTheDocument()
    expect(card.querySelectorAll('[aria-label="Chief"]')).toHaveLength(1)
  })

  it('fixa um Chief com coroa no topo sem duplicá-lo na lista de agentes', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] } })
    const section = screen.getByRole('region', { name: 'Chief' })
    expect(section).toHaveTextContent('Lyra')
    expect(section.querySelector('svg[aria-label="Chief"]')).not.toBeNull()
    expect(screen.getAllByText('Lyra')).toHaveLength(1)
    fireEvent.contextMenu(section.querySelector('button')!)
    expect(screen.getByRole('menuitem', { name: /Remover papel de Chief/ })).toBeInTheDocument()
  })

  it('promove agente a Chief pelo menu de contexto', () => {
    const onSetChief = vi.fn()
    renderSidebar({ onSetChief })
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agentes/ }), { button: 0 })
    fireEvent.contextMenu(screen.getByRole('button', { name: /Lyra @lyra/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promover a Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(agent, true)
  })

  it('remove o papel Chief pelo menu de contexto', () => {
    const chief: Agent = { ...agent, role: 'chief' }
    const onSetChief = vi.fn()
    renderSidebar({ snapshot: { ...snapshot, agents: [chief] }, onSetChief })
    fireEvent.contextMenu(screen.getByRole('region', { name: 'Chief' }).querySelector('button')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover papel de Chief' }))
    expect(onSetChief).toHaveBeenCalledExactlyOnceWith(chief, false)
  })

  it('marca a conversa e o workspace quando há aprovação pendente', () => {
    const conversation: Conversation = { id: 'conversation-1', kind: 'direct', name: 'Revisão', agentIds: [agent.id], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const withApproval: Snapshot = { ...snapshot, conversations: [conversation], approvals: [{ id: 'approval-1', runId: 'run-1', conversationId: conversation.id, agentId: agent.id, kind: 'write', details: { path: 'notes.txt', after: 'texto' }, status: 'pending', createdAt: '', resolvedAt: null }] }
    renderSidebar({ snapshot: withApproval })
    expect(screen.getByLabelText('Aguardando aprovação')).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
  })
})

describe('colapso e exclusão da barra lateral', () => {
  it('recolhe e expande conversas do workspace', () => {
    const conversation: Conversation = { id: 'thread-1', kind: 'direct', name: 'Conversa no workspace', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] } })
    expect(screen.getByText('Conversa no workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Recolher ${workspace.name}` }))
    expect(screen.queryByText('Conversa no workspace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Expandir ${workspace.name}` }))
    expect(screen.getByText('Conversa no workspace')).toBeInTheDocument()
  })
  it('pede confirmação antes de excluir conversa e respeita cancelamento', () => {
    const conversation: Conversation = { id: 'thread-delete', kind: 'direct', name: 'Apagar teste', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const onDeleteConversation = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderSidebar({ snapshot: { ...snapshot, conversations: [conversation] }, onDeleteConversation })
    const actions = screen.getByRole('button', { name: 'Ações da conversa Apagar teste' })
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    expect(onDeleteConversation).not.toHaveBeenCalled()
    fireEvent.contextMenu(actions.parentElement!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conversa' }))
    expect(onDeleteConversation).toHaveBeenCalledExactlyOnceWith(conversation.id)
    confirm.mockRestore()
  })
})

describe('navegação orientada a workspaces', () => {
  it('abrir o workspace não cria sessão: apenas o botão + cria', () => {
    const onSelectWorkspace = vi.fn()
    const onStartConversation = vi.fn()
    renderSidebar({ onSelectWorkspace, onStartConversation })
    fireEvent.click(screen.getByTitle('Workspace livre'))
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith(workspace.id)
    expect(onStartConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `Nova conversa em ${workspace.name}` }))
    expect(onStartConversation).toHaveBeenCalledExactlyOnceWith(workspace.id)
  })

  it('exibe sessões legadas dentro do Livre, sem lista avulsa', () => {
    const legacy: Workspace = { ...workspace, id: 'legacy', name: '' }
    const free: Workspace = { ...workspace, id: 'free', name: 'Livre' }
    const conversation: Conversation = { id: 'legacy-session', kind: 'direct', name: 'Sessão preservada', agentIds: [], workspaceId: legacy.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    renderSidebar({ snapshot: { ...snapshot, workspaces: [legacy, free], conversations: [conversation] } })
    expect(screen.getByText('Sessão preservada')).toBeInTheDocument()
    expect(screen.queryByText('Sessões antigas')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher Livre' }))
    expect(screen.queryByText('Sessão preservada')).not.toBeInTheDocument()
  })

  it('usa as abas para alternar agentes e projetos, sem cabeçalhos repetidos', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Recolher workspaces' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo workspace' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agentes/ }), { button: 0 })
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    expect(screen.queryByText('Meus Polis')).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Projetos/ }), { button: 0 })
    expect(screen.getByRole('button', { name: `Recolher ${workspace.name}` })).toBeInTheDocument()
  })
})
