import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    // Applied changes are reviewed above the composer, not duplicated inside every message.
    expect(screen.queryByRole('region', { name: 'Arquivos alterados neste turno' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Confirmar e aprovar' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Negar' })).toBeInTheDocument()
  })
})

describe('balão do usuário', () => {
  it('usa superfície neutra em vez da cor primary dos temas', () => {
    const userMessage: Message = { ...message, id: 'human-1', agentId: null, role: 'user', author: 'Você', text: 'Mensagem do usuário', runId: null }
    render(<MessageList messages={[userMessage]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    const bubble = screen.getByText('Mensagem do usuário').closest('[data-slot="message-bubble"]')
    expect(bubble).toHaveClass('boobot-user-bubble')
    expect(bubble).not.toHaveClass('bg-primary')
    expect(bubble).not.toHaveClass('text-primary-foreground')
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

  it('desativa a ancoragem nativa para deixar o scroller controlar a âncora por ID', () => {
    const { container } = render(<MessageList messages={[makeMessage('m1', 'Oi')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect((container.firstElementChild as HTMLElement).style.overflowAnchor).toBe('none')
  })

  it('corrige a âncora de leitura quando o ResizeObserver mede crescimento acima dela', () => {
    const observers: Array<{ callback: ResizeObserverCallback; observed: Element[] }> = []
    class TestResizeObserver {
      observed: Element[] = []
      constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.push(this) }
      callback: ResizeObserverCallback
      observe = (element: Element) => { this.observed.push(element) }
      unobserve = (element: Element) => { this.observed = this.observed.filter(item => item !== element) }
      disconnect = () => { this.observed = [] }
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const { container, rerender } = render(<MessageList messages={[makeMessage('m1', 'Um'), makeMessage('m2', 'Dois'), makeMessage('m3', 'Três')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    const scroller = container.firstElementChild as HTMLElement
    mockScrollMetrics(scroller, { scrollHeight: 1000, clientHeight: 300, scrollTop: 220 })
    fireEvent.scroll(scroller)
    const observer = observers[0]
    const firstMessage = observer.observed.find(element => (element as HTMLElement).dataset.messageId === 'm1')
    expect(firstMessage).toBeTruthy()
    act(() => observer.callback([{ target: firstMessage!, contentRect: { height: 260 }, borderBoxSize: [] } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver))
    rerender(<MessageList messages={[makeMessage('m1', 'Um com conteúdo expandido'), makeMessage('m2', 'Dois'), makeMessage('m3', 'Três')]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(scroller.scrollTop).toBeGreaterThanOrEqual(220)
    vi.unstubAllGlobals()
  })
})

describe('estado vazio da conversa', () => {
  it('mantém o estado vazio sem duplicar o avatar que já aparece no cabeçalho', () => {
    render(<MessageList messages={[]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Como posso ajudar?' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
  })
})

describe('identificação de agentes no chat', () => {
  it('usa menção colorida e nome em negrito sem renderizar avatar por mensagem', () => {
    const agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as import('../../../../shared/v9').Agent
    render(<MessageList messages={[message]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => agent} selectedAgents={[agent, { ...agent, id: 'agent-2', name: 'Atlas', alias: 'atlas' }]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByText('@lyra')).toHaveClass('font-bold')
    expect(screen.getByTitle('Lyra')).toHaveTextContent('@lyra')
    expect(screen.queryByText('Lyra')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Avatar de Lyra/ })).not.toBeInTheDocument()
  })
})
