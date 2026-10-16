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
