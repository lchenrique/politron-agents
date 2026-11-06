import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import type { Approval, Message } from '../../../../shared/v9'
import { MessageList } from './MessageList'
import { Composer } from '../composer/Composer'
import { MessageLinkContext, type MessageLinkHandlers } from './MessageMarkdown'
import { useV1ThreadRuntime, type SendMessage } from './assistant-ui-adapter'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 6, 12, 0, seconds)).toISOString()
const message = (overrides: Partial<Message>): Message => ({ id: 'reply', conversationId: 'chat', agentId: 'boo', author: 'Boo', role: 'assistant', text: '', status: 'completed', runId: 'run-1', createdAt: at(0), ...overrides })
const list = (messages: Message[], approvals: Approval[] = []) => <MessageList messages={messages} fileChanges={[]} approvals={approvals} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />

describe('transcrição renderizada pelos primitivos do assistant-ui', () => {
  it('mostra a resposta concluída pela parte de texto do runtime, com a política de links e blocos de código', async () => {
    const handlers: MessageLinkHandlers = { openUrl: vi.fn(), openFile: vi.fn(), blocked: vi.fn(), workspaceRoot: 'D:/workspace' }
    const { container } = render(<MessageLinkContext.Provider value={handlers}>{list([
      message({ id: 'pergunta', role: 'user', author: 'Você', agentId: null, text: 'Onde está?', runId: null }),
      message({ text: 'Veja **aqui**: [arquivo](src/app.ts) e [site](https://example.com)\n\n```ts\nconst ok = true\n```', createdAt: at(1) }),
    ])}</MessageLinkContext.Provider>)
    const reply = container.querySelector<HTMLElement>('[data-message-id="reply"]')!
    await waitFor(() => expect(within(reply).getByText('aqui').tagName).toBe('STRONG'))
    expect(container.querySelectorAll('[data-message-id="reply"]')).toHaveLength(1)
    expect(container.querySelector('[data-message-id="pergunta"]')).toHaveTextContent('Onde está?')
    expect(reply).toHaveTextContent('const ok = true')
    fireEvent.click(within(reply).getByRole('link', { name: 'arquivo' }))
    expect(handlers.openFile).toHaveBeenCalledExactlyOnceWith('src/app.ts')
    fireEvent.click(within(reply).getByRole('link', { name: 'site' }), { ctrlKey: true })
    expect(handlers.openUrl).toHaveBeenCalledExactlyOnceWith('https://example.com/', 'external')
  })

  it('mantém o streaming em texto simples enquanto a resposta roda', () => {
    const { container } = render(list([message({ text: 'Parcial **ainda**', status: 'running' })]))
    expect(container.querySelector('[data-message-id="reply"] [data-streaming-text]')).toHaveTextContent('Parcial **ainda**')
  })

  it('mostra a atividade concluída como tool-call do runtime com a árvore existente', () => {
    const activity = message({ id: 'tool', role: 'activity', text: 'Terminal · npm test', createdAt: at(1), tool: { name: 'workspace_run_command', args: '{"command":"npm test"}', status: 'completed', output: 'ok', startedAt: at(1), finishedAt: at(2) } })
    const { container } = render(list([message({ text: 'Vou testar.' }), activity, message({ id: 'final', text: 'Pronto.', createdAt: at(3) })]))
    // A ferramenta concluída continua visível como linha do turno; o clique só abre o detalhe.
    fireEvent.click(screen.getByRole('button', { name: /comando/i }))
    expect(container.querySelector('[data-message-id="tool"] [data-chat-call-id="tool"]')).toBeInTheDocument()
  })

  it('aprovação pendente no transcript só chega ao host depois do clique', async () => {
    const respondApproval = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { respondApproval })
    const pending: Approval = { id: 'approval-1', runId: 'run-1', conversationId: 'chat', agentId: 'boo', kind: 'browser', details: { action: 'Abrir uma página' }, status: 'pending', createdAt: '', resolvedAt: null }
    const { container } = render(list([message({ text: 'Posso abrir?', status: 'waiting' })], [pending]))
    const region = within(container.querySelector<HTMLElement>('[data-message-id="reply"]')!).getByRole('region', { name: 'Aprovação de ferramenta' })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(respondApproval).not.toHaveBeenCalled()
    fireEvent.click(within(region).getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(respondApproval).toHaveBeenCalledExactlyOnceWith('approval-1', true))
  })
})

describe('Composer ligado ao runtime', () => {
  function ComposerWithRuntime({ onSend }: { onSend: SendMessage }) {
    const { runtime, send } = useV1ThreadRuntime(onSend)
    return <AssistantRuntimeProvider runtime={runtime}>
      <Composer conversationId="runtime-test" models={[{ name: 'Modelo real', efforts: ['medium'], defaultEffort: 'medium' }]} defaultModelName="Modelo real" onModelChange={vi.fn()} onSubmit={send} onStop={vi.fn()} />
    </AssistantRuntimeProvider>
  }

  it('envia pelo onNew do runtime para o caminho de envio existente, com modelo, plano e entrega', async () => {
    const onSend = vi.fn<SendMessage>().mockResolvedValue(undefined)
    render(<ComposerWithRuntime onSend={onSend} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.click(screen.getByRole('button', { name: 'Modo planejamento' }))
    fireEvent.change(textarea, { target: { value: 'Planeje a entrega' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledExactlyOnceWith('Planeje a entrega', 'Modelo real', expect.objectContaining({ planMode: true, delivery: 'queue', files: [], effort: 'medium', requestId: expect.any(String) })))
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('devolve o rascunho e mostra o erro quando o envio falha', async () => {
    const onSend = vi.fn<SendMessage>().mockRejectedValue(new Error('Host indisponível.'))
    render(<ComposerWithRuntime onSend={onSend} />)
    const textarea = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(textarea, { target: { value: 'Mensagem importante' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Host indisponível.'))
    expect(textarea).toHaveValue('Mensagem importante')
  })
})
