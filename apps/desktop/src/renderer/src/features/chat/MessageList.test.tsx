import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Approval, FileChange, Message } from '../../../../shared/v9'
import { MessageList } from './MessageList'

/** jsdom não calcula layout real; simula um container com scrollHeight/clientHeight próprios para testar o auto-scroll. */
function mockScrollMetrics(element: HTMLElement, { scrollHeight, clientHeight, scrollTop = 0 }: { scrollHeight: number; clientHeight: number; scrollTop?: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight })
  element.scrollTop = scrollTop
}

const message: Message = { id: 'message-1', conversationId: 'conversation-1', agentId: 'agent-1', author: 'Revisora', role: 'assistant', text: 'Revisei o arquivo.', status: 'completed', runId: 'run-1', createdAt: '' }
const change: FileChange = { id: 'change-1', runId: 'run-1', messageId: message.id, toolCallId: 'tool-1', agentId: 'agent-1', workspaceId: 'workspace-1', path: 'notes.md', status: 'applied', before: 'antes', after: 'depois', additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '' }
const approval: Approval = { id: 'approval-1', runId: 'run-1', conversationId: message.conversationId, agentId: 'agent-1', kind: 'write', details: { path: 'notes.md', before: 'antes', after: 'depois' }, status: 'pending', createdAt: '', resolvedAt: null }

describe('diffs e aprovações no chat', () => {
  it('mostra o arquivo alterado ligado ao turno e a decisão pendente inline', () => {
    render(<MessageList messages={[message]} fileChanges={[change]} approvals={[approval]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByRole('region', { name: 'Arquivos alterados neste turno' })).toHaveTextContent('notes.md')
    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Confirmar e aprovar' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Negar' })).toBeInTheDocument()
  })
})

describe('scroll automático da conversa', () => {
  const makeMessage = (id: string, text: string): Message => ({ id, conversationId: 'conversation-1', agentId: 'agent-1', author: 'Pits', role: 'assistant', text, status: 'completed', runId: null, createdAt: '' })

  it('acompanha o final quando o usuário já estava lá e uma mensagem nova chega', () => {
    const { container, rerender } = render(<MessageList messages={[makeMessage('m1', 'Oi')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    const scroller = container.firstElementChild as HTMLElement
    mockScrollMetrics(scroller, { scrollHeight: 400, clientHeight: 300, scrollTop: 100 })
    rerender(<MessageList messages={[makeMessage('m1', 'Oi'), makeMessage('m2', 'Nova resposta')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(scroller.scrollTop).toBe(scroller.scrollHeight)
  })

  it('não interrompe quem rolou para cima lendo o histórico', () => {
    const { container, rerender } = render(<MessageList messages={[makeMessage('m1', 'Oi')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    const scroller = container.firstElementChild as HTMLElement
    mockScrollMetrics(scroller, { scrollHeight: 1000, clientHeight: 300, scrollTop: 50 })
    fireEvent.scroll(scroller)
    rerender(<MessageList messages={[makeMessage('m1', 'Oi'), makeMessage('m2', 'Nova resposta')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(scroller.scrollTop).toBe(50)
  })
})

describe('estado vazio da conversa', () => {
  it('mostra apenas o Pits ilustrado, sem a marca antiga no centro', () => {
    render(<MessageList messages={[]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByRole('img', { name: 'Pits — idle' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
  })
})

describe('identificação de agentes no chat', () => {
  it('usa menção colorida e nome em negrito sem renderizar avatar por mensagem', () => {
    const agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as import('../../../../shared/v9').Agent
    render(<MessageList messages={[message]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => agent} selectedAgents={[agent, { ...agent, id: 'agent-2', name: 'Atlas', alias: 'atlas' }]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByText('@lyra')).toHaveClass('font-bold')
    expect(screen.getByText('Lyra')).toHaveClass('font-semibold')
    expect(screen.queryByRole('img', { name: /Avatar de Lyra/ })).not.toBeInTheDocument()
  })
})
