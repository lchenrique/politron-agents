import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation, Workspace } from '../../../../shared/v9'
import { WorkspaceOverview } from './WorkspaceOverview'

const workspace: Workspace = { id: 'w1', name: 'Politron', kind: 'local', path: 'C:/politron', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: ['a1'], changes: 0, archived: false, createdAt: '' }
const agent: Agent = { id: 'a1', name: 'Pits', alias: 'pits', description: 'Programador', instructions: 'Ajude.', runtime: 'codex', model: '', color: '#786bea', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }

describe('visão geral do workspace', () => {
  it('permite navegar sem iniciar uma sessão automaticamente', () => {
    const onCreateSession = vi.fn()
    const onOpenAgent = vi.fn()
    render(<WorkspaceOverview workspace={workspace} workspaces={[workspace]} conversations={[]} agents={[agent]} onCreateSession={onCreateSession} onOpenConversation={vi.fn()} onEdit={vi.fn()} onOpenAgent={onOpenAgent} />)
    expect(screen.getByRole('heading', { name: 'Politron' })).toBeInTheDocument()
    expect(screen.getByText('Nenhuma sessão criada')).toBeInTheDocument()
    expect(screen.getByText('C:/politron')).toBeInTheDocument()
    expect(document.querySelector('.ds-eyebrow')).toBeNull()
    // Sem sessões, só há um convite para criar a primeira.
    expect(screen.queryByRole('button', { name: /Nova sessão/ })).not.toBeInTheDocument()
    expect(onCreateSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Criar primeira sessão' }))
    expect(onCreateSession).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Pits @pits/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })

  it('mostra Nova sessão no cabeçalho da lista quando já há sessões', () => {
    const session: Conversation = { id: 'c1', kind: 'direct', name: 'Revisão', agentIds: [], workspaceId: workspace.id, titleAuto: false, revision: 1, archived: false, createdAt: '' }
    render(<WorkspaceOverview workspace={workspace} workspaces={[workspace]} conversations={[session]} agents={[agent]} onCreateSession={vi.fn()} onOpenConversation={vi.fn()} onEdit={vi.fn()} onOpenAgent={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Nova sessão/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar primeira sessão' })).not.toBeInTheDocument()
  })
})
