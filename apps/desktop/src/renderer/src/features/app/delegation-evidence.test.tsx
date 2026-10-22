import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Approval, FileChange, Message } from '../../../../shared/v9'
import { selectVisibleRunEvidence } from './delegation-evidence'
import { MessageList } from '../chat/MessageList'

describe('evidências de uma resposta delegada', () => {
  it('mantém a aprovação do run filho enquanto as diferenças ficam na revisão do composer', () => {
    const message: Message = { id: 'result', conversationId: 'private', agentId: 'specialist', author: 'Especialista', role: 'assistant', text: 'Preciso gravar o arquivo.', status: 'waiting', runId: 'child-run', delegationId: 'delegation', createdAt: '' }
    const change: FileChange = { id: 'change', runId: 'child-run', messageId: message.id, toolCallId: 'write-1', agentId: 'specialist', workspaceId: 'workspace', path: 'plan.md', status: 'applied', before: 'versão antiga', after: 'versão nova', additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '' }
    const approval: Approval = { id: 'approval', runId: 'child-run', conversationId: 'private', agentId: 'specialist', kind: 'write', details: { path: 'plan.md', before: 'versão antiga', after: 'versão nova' }, status: 'pending', createdAt: '', resolvedAt: null }
    const evidence = selectVisibleRunEvidence([message], [change], [approval])

    render(<MessageList messages={[message]} fileChanges={evidence.fileChanges} approvals={evidence.approvals} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)

    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Confirmar e aprovar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos alterados neste turno' })).not.toBeInTheDocument()
  })
})
