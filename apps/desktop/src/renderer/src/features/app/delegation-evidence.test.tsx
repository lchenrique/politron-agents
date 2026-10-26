import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Approval, FileChange, Message } from '../../../../shared/v9'
import { selectVisibleRunEvidence } from './delegation-evidence'
import { MessageList } from '../chat/MessageList'

const message: Message = { id: 'result', conversationId: 'private', agentId: 'specialist', author: 'Especialista', role: 'assistant', text: 'Preciso gravar o arquivo.', status: 'waiting', runId: 'child-run', delegationId: 'delegation', createdAt: '' }
const change: FileChange = { id: 'change', runId: 'child-run', messageId: message.id, toolCallId: 'write-1', agentId: 'specialist', workspaceId: 'workspace', path: 'plan.md', status: 'applied', before: 'versão antiga', after: 'versão nova', additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '' }
const approval: Approval = { id: 'approval', runId: 'child-run', conversationId: 'private', agentId: 'specialist', kind: 'write', details: { path: 'plan.md', before: 'versão antiga', after: 'versão nova' }, status: 'pending', createdAt: '', resolvedAt: null }

describe('evidências de uma resposta delegada', () => {
  it('mantém a aprovação do run filho separada da revisão quando o run está no composer', () => {
    const evidence = selectVisibleRunEvidence([message], [change], [approval])

    render(<MessageList messages={[message]} fileChanges={evidence.fileChanges} reviewRunId="child-run" approvals={evidence.approvals} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)

    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Confirmar e aprovar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos alterados neste turno' })).not.toBeInTheDocument()
  })

  it('no histórico, mostra o diff aplicado sob a resposta delegada sem misturá-lo à aprovação', () => {
    const evidence = selectVisibleRunEvidence([message], [change], [approval])

    const { container } = render(<MessageList messages={[message]} fileChanges={evidence.fileChanges} reviewRunId={null} approvals={evidence.approvals} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)

    const wrapper = container.querySelector<HTMLElement>('[data-message-id="result"]')!
    const review = within(wrapper).getByRole('region', { name: 'Arquivos modificados nesta resposta' })
    const decision = within(wrapper).getByRole('region', { name: 'Aprovação de ferramenta' })
    expect(review).not.toContainElement(decision)
    expect(decision).not.toContainElement(review)
    expect(within(review).queryByRole('button', { name: 'Confirmar e aprovar' })).not.toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: 'Revisar arquivos modificados' }))
    expect(review).toHaveTextContent('plan.md')
  })

  it('não traz para a conversa evidências de runs sem mensagem visível', () => {
    const other: FileChange = { ...change, id: 'other', runId: 'other-run', messageId: 'elsewhere', path: 'outro.md' }
    const otherApproval: Approval = { ...approval, id: 'other-approval', runId: 'other-run' }
    const evidence = selectVisibleRunEvidence([message], [change, other], [approval, otherApproval])
    expect(evidence.fileChanges).toEqual([change])
    expect(evidence.approvals).toEqual([approval])
  })
})
