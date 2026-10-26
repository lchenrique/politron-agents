import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('não duplica no histórico o run revisado acima do composer e mantém a decisão pendente inline', () => {
    render(<MessageList messages={[message]} fileChanges={[change]} reviewRunId="run-1" approvals={[approval]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Arquivos alterados neste turno' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aprovação de ferramenta' })).toHaveTextContent('Aguardando sua decisão')
    expect(screen.getByRole('button', { name: 'Confirmar e aprovar' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Negar' })).toBeInTheDocument()
  })
})

describe('diffs de runs anteriores no histórico', () => {
  const reply = (id: string, runId: string): Message => ({ ...message, id, runId, text: `Resposta ${id}` })
  const write = (id: string, messageId: string, runId: string, path: string, status: FileChange['status'] = 'applied'): FileChange =>
    ({ ...change, id, messageId, runId, toolCallId: `tool-${id}`, path, status, before: `antes ${path}\n`, after: `depois ${path}\n` })
  const list = (messages: Message[], fileChanges: FileChange[], reviewRunId: string | null = null) => <MessageList messages={messages} fileChanges={fileChanges} reviewRunId={reviewRunId} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />
  const wrapperOf = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`)!
  const expandedText = (region: HTMLElement) => { fireEvent.click(within(region).getByRole('button', { name: 'Revisar arquivos modificados' })); return region.textContent || '' }

  it('associa cada diff à mensagem do seu FileChange.messageId e omite só o run do composer', () => {
    const { container } = render(list(
      [reply('m1', 'run-1'), reply('m2', 'run-2'), reply('m3', 'run-3')],
      // Ordem invertida de propósito: a associação vem do messageId, não da posição.
      [write('c3', 'm3', 'run-3', 'docs/ultimo.md'), write('c2', 'm2', 'run-2', 'src/segundo.ts'), write('c1', 'm1', 'run-1', 'src/primeiro.ts')],
      'run-3',
    ))
    const first = within(wrapperOf(container, 'm1')).getByRole('region', { name: 'Arquivos modificados nesta resposta' })
    const second = within(wrapperOf(container, 'm2')).getByRole('region', { name: 'Arquivos modificados nesta resposta' })
    expect(expandedText(first)).toContain('src/primeiro.ts')
    expect(first).not.toHaveTextContent('src/segundo.ts')
    expect(expandedText(second)).toContain('src/segundo.ts')
    expect(second).not.toHaveTextContent('src/primeiro.ts')
    // O run 3 está na revisão do composer: nenhuma cópia dele no histórico.
    expect(within(wrapperOf(container, 'm3')).queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Arquivos modificados nesta resposta' })).toHaveLength(2)
    expect(container).not.toHaveTextContent('docs/ultimo.md')
  })

  it('não apresenta como aplicadas escritas falhas, indeterminadas ou sem mudança', () => {
    const { container } = render(list([reply('m1', 'run-1')], [
      write('failed', 'm1', 'run-1', 'falhou.ts', 'failed'),
      write('unknown', 'm1', 'run-1', 'incerto.ts', 'unknown'),
      write('same', 'm1', 'run-1', 'igual.ts', 'unchanged'),
    ]))
    expect(within(wrapperOf(container, 'm1')).queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
  })

  it('mostra só os aplicados quando o mesmo run mistura estados', () => {
    const { container } = render(list([reply('m1', 'run-1')], [
      write('ok', 'm1', 'run-1', 'aplicado.ts'),
      write('failed', 'm1', 'run-1', 'falhou.ts', 'failed'),
    ]))
    const region = within(wrapperOf(container, 'm1')).getByRole('region', { name: 'Arquivos modificados nesta resposta' })
    expect(region).toHaveTextContent('1 arquivo modificado')
    const text = expandedText(region)
    expect(text).toContain('aplicado.ts')
    expect(text).not.toContain('falhou.ts')
  })

  it('não atribui um registro cujo run diverge do run da mensagem indicada', () => {
    const { container } = render(list([reply('m1', 'run-1')], [write('stray', 'm1', 'run-other', 'estranho.ts')]))
    expect(within(wrapperOf(container, 'm1')).queryByRole('region', { name: 'Arquivos modificados nesta resposta' })).not.toBeInTheDocument()
  })

  it('mantém a revisão dentro do wrapper observado pela virtualização', () => {
    const observed: Element[] = []
    class TestResizeObserver { observe = (element: Element) => { observed.push(element) }; unobserve = () => undefined; disconnect = () => undefined }
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const { container } = render(list([reply('m1', 'run-1')], [write('c1', 'm1', 'run-1', 'src/primeiro.ts')]))
    const wrapper = wrapperOf(container, 'm1')
    expect(observed).toContain(wrapper)
    expect(wrapper).toContainElement(screen.getByRole('region', { name: 'Arquivos modificados nesta resposta' }))
    vi.unstubAllGlobals()
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
