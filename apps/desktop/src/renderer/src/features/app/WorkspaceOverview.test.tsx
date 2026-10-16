import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Workspace } from '../../../../shared/v9'
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
    expect(onCreateSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Criar primeira sessão' }))
    expect(onCreateSession).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Pits @pits/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(agent)
  })
})
