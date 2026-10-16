import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptySnapshot } from '../app/appShellShared'
import type { Agent, Conversation, Project, Snapshot, Workspace } from '../../../../shared/v9'
import { Sidebar } from './Sidebar'

const agent: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }
const project: Project = { id: 'project-1', name: 'Instruções de Paz', defaultWorkspaceId: null, instructions: '', defaultAgentIds: [], revision: 1, archived: false, createdAt: '2026-10-16T12:00:00.000Z' }
const snapshot: Snapshot = { ...emptySnapshot, agents: [agent], projects: [project] }

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(<Sidebar snapshot={snapshot} selected={undefined} unreadCounts={{}} agentStates={{}} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onOpenSettings={vi.fn()} onNotice={vi.fn()} {...overrides} />)
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

  it('inicia a conversa do projeto pelo seletor de participantes', () => {
    const onOpenEditor = vi.fn()
    renderSidebar({ onOpenEditor })
    fireEvent.click(screen.getByRole('button', { name: 'Nova conversa em Instruções de Paz' }))
    expect(onOpenEditor).toHaveBeenCalledWith({ kind: 'conversation', projectId: project.id })
  })

  it('marca a conversa e o workspace quando há aprovação pendente', () => {
    const workspace: Workspace = { id: 'workspace-1', projectId: project.id, kind: 'local', path: 'C:/workspace', branch: 'main', baseBranch: null, changes: 0, archived: false, createdAt: '' }
    const conversation: Conversation = { id: 'conversation-1', kind: 'direct', name: 'Revisão', agentIds: [agent.id], projectId: project.id, workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    const withApproval: Snapshot = { ...snapshot, workspaces: [workspace], conversations: [conversation], approvals: [{ id: 'approval-1', runId: 'run-1', conversationId: conversation.id, agentId: agent.id, kind: 'write', details: { path: 'notes.txt', after: 'texto' }, status: 'pending', createdAt: '', resolvedAt: null }] }
    renderSidebar({ snapshot: withApproval })
    expect(screen.getByLabelText('Aguardando aprovação')).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace precisa de atenção')).toBeInTheDocument()
  })
})
