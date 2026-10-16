import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptySnapshot } from '../app/appShellShared'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const workspace: Workspace = { id: 'workspace-1', name: 'Instruções de Paz', kind: 'free', path: 'C:/workspace', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], workspaces: [workspace] }

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onDeleteWorkspace={vi.fn()} onDeleteConversation={vi.fn()} onDeleteAgent={vi.fn()} onNotice={vi.fn()} {...overrides} />)
}

describe('contatos de agentes na barra lateral', () => {
  it('abre a conversa direta ao selecionar um agente', () => {
    const onOpenAgent = vi.fn()
    renderSidebar({ onOpenAgent })
    fireEvent.click(screen.getByRole('button', { name: /Lyra @lyra/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('exibe Pits como mascote leve do Politron', () => {
    renderSidebar()
    expect(screen.getByRole('img', { name: 'Pits, mascote do Politron' })).toBeInTheDocument()
  })

  it('inicia uma conversa no workspace pelo atalho da árvore', () => {
    const onStartConversation = vi.fn()
    renderSidebar({ onStartConversation })
    fireEvent.click(screen.getByRole('button', { name: `Nova conversa em ${workspace.name}` }))
    expect(onStartConversation).toHaveBeenCalledWith(workspace.id)
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
    const deleteButton = screen.getByRole('button', { name: 'Excluir conversa Apagar teste' })
    fireEvent.click(deleteButton)
    expect(onDeleteConversation).not.toHaveBeenCalled()
    fireEvent.click(deleteButton)
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

  it('permite recolher independentemente agentes e workspaces', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher agentes' }))
    expect(screen.queryByRole('button', { name: /Lyra @lyra/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir agentes' }))
    expect(screen.getByRole('button', { name: /Lyra @lyra/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher workspaces' }))
    expect(screen.queryByRole('button', { name: `Recolher ${workspace.name}` })).not.toBeInTheDocument()
  })
})
