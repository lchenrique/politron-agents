import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Approval, Conversation, FileChange, Message } from '../../../../shared/v9'
import { selectDescendantApprovals, selectVisibleRunEvidence } from './delegation-evidence'
import { MessageList } from '@/features/chat/MessageList'
import { ComposerTakeover } from '@/features/composer/ComposerTakeover'

const message: Message = { id: 'result', conversationId: 'private', agentId: 'specialist', author: 'Especialista', role: 'assistant', text: 'Preciso gravar o arquivo.', status: 'waiting', runId: 'child-run', delegationId: 'delegation', createdAt: '' }
const change: FileChange = { id: 'change', runId: 'child-run', messageId: message.id, toolCallId: 'write-1', agentId: 'specialist', workspaceId: 'workspace', path: 'plan.md', status: 'applied', before: 'versão antiga', after: 'versão nova', additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '' }
const approval: Approval = { id: 'approval', runId: 'child-run', conversationId: 'private', agentId: 'specialist', kind: 'write', details: { path: 'plan.md', before: 'versão antiga', after: 'versão nova' }, status: 'pending', createdAt: '', resolvedAt: null }

describe('evidências de uma resposta delegada', () => {
  it('mantém a aprovação do run filho separada da revisão quando o run está no composer', () => {
    const evidence = selectVisibleRunEvidence([message], [change], [approval])

    render(<MessageList messages={[message]} fileChanges={evidence.fileChanges} reviewRunId="child-run" approvals={evidence.approvals} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)

    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos alterados neste turno' })).not.toBeInTheDocument()
  })

  it('no histórico, mostra o diff aplicado sob a resposta delegada sem misturá-lo à aprovação', () => {
    const evidence = selectVisibleRunEvidence([message], [change], [approval])

    const { container } = render(<MessageList messages={[message]} fileChanges={evidence.fileChanges} reviewRunId={null} approvals={evidence.approvals} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)

    const wrapper = container.querySelector<HTMLElement>('[data-message-id="result"]')!
    const review = within(wrapper).getByRole('region', { name: 'Arquivos modificados nesta resposta' })
    const decision = within(wrapper).getByRole('region', { name: 'Aprovação de ferramenta' })
    expect(review).not.toContainElement(decision)
    expect(decision).not.toContainElement(review)
    expect(within(review).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: 'Revisar arquivos modificados' }))
    expect(review).toHaveTextContent('plan.md')
  })

  it('repassa ao líder as pendências de conversas delegadas, inclusive netas, e só enquanto pendentes', () => {
    const conv = (id: string, parentConversationId?: string): Conversation => ({ id, kind: 'direct', name: id, agentIds: [], workspaceId: 'w', titleAuto: false, revision: 0, archived: false, createdAt: '', parentConversationId })
    // "loop" aponta para si mesma de forma indireta: a busca não pode entrar em laço.
    const conversations = [conv('leader'), conv('child', 'leader'), conv('grandchild', 'child'), conv('other'), conv('loop-a', 'loop-b'), conv('loop-b', 'loop-a')]
    const child = { ...approval, id: 'a-child', conversationId: 'child' }
    const grandchild = { ...approval, id: 'a-grand', conversationId: 'grandchild', kind: 'question' as const }
    const resolved = { ...approval, id: 'a-done', conversationId: 'child', status: 'approved' as const }
    const own = { ...approval, id: 'a-own', conversationId: 'leader' }
    const unrelated = { ...approval, id: 'a-other', conversationId: 'other' }
    expect(selectDescendantApprovals('leader', conversations, [child, grandchild, resolved, own, unrelated]).map(item => item.id)).toEqual(['a-child', 'a-grand'])
    expect(selectDescendantApprovals('child', conversations, [child, grandchild]).map(item => item.id)).toEqual(['a-grand'])
    expect(selectDescendantApprovals('loop-a', conversations, [{ ...approval, conversationId: 'loop-b' }])).toHaveLength(1)
  })

  it('no líder, a pendência delegada diz para quem é e responde pela mesma chamada do cartão original', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    const hermes = { id: 'specialist', name: 'Hermes' } as Agent
    const browser: Approval = { ...approval, kind: 'browser', details: { action: 'Abrir o painel' } }
    const { rerender, container } = render(<ComposerTakeover approval={browser} agent={hermes} delegated onNotice={() => undefined} />)
    expect(screen.getByText('Aguardando sua aprovação para Hermes')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Hermes quer usar o navegador')
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval', true))
    // Resolvida em qualquer lugar, o evento do backend atualiza o snapshot e o cartão some do líder.
    rerender(<ComposerTakeover approval={{ ...browser, status: 'approved' }} agent={hermes} delegated onNotice={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
    vi.unstubAllGlobals()
  })

  it('não traz para a conversa evidências de runs sem mensagem visível', () => {
    const other: FileChange = { ...change, id: 'other', runId: 'other-run', messageId: 'elsewhere', path: 'outro.md' }
    const otherApproval: Approval = { ...approval, id: 'other-approval', runId: 'other-run' }
    const evidence = selectVisibleRunEvidence([message], [change, other], [approval, otherApproval])
    expect(evidence.fileChanges).toEqual([change])
    expect(evidence.approvals).toEqual([approval])
  })
})
