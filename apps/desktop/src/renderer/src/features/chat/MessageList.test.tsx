import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Approval, Conversation, FileChange, Message } from '../../../../shared/v9'
import { MessageList } from '@/features/chat/MessageList'

const message: Message = { id: 'message-1', conversationId: 'conversation-1', agentId: 'agent-1', author: 'Revisora', role: 'assistant', text: 'Revisei o arquivo.', status: 'completed', runId: 'run-1', createdAt: '' }
const change: FileChange = { id: 'change-1', runId: 'run-1', messageId: message.id, toolCallId: 'tool-1', agentId: 'agent-1', workspaceId: 'workspace-1', path: 'notes.md', status: 'applied', before: 'antes', after: 'depois', additions: 1, deletions: 1, truncated: false, binary: false, createdAt: '' }
const approval: Approval = { id: 'approval-1', runId: 'run-1', conversationId: message.conversationId, agentId: 'agent-1', kind: 'write', details: { path: 'notes.md', before: 'antes', after: 'depois' }, status: 'pending', createdAt: '', resolvedAt: null }

describe('diffs e aprovações no chat', () => {
  it('não duplica no histórico o run revisado acima do composer e mantém a decisão pendente inline', () => {
    render(<MessageList messages={[message]} fileChanges={[change]} reviewRunId="run-1" approvals={[approval]} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
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
  const list = (messages: Message[], fileChanges: FileChange[], reviewRunId: string | null = null) => <MessageList messages={messages} fileChanges={fileChanges} reviewRunId={reviewRunId} approvals={[]} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />
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

  it('mantém a revisão dentro da mensagem do turno que a produziu', () => {
    const { container } = render(list([reply('m1', 'run-1')], [write('c1', 'm1', 'run-1', 'src/primeiro.ts')]))
    expect(wrapperOf(container, 'm1')).toContainElement(screen.getByRole('region', { name: 'Arquivos modificados nesta resposta' }))
  })
})

describe('balão do usuário', () => {
  it('usa o balão neutro do DSH em vez da cor primary dos temas', () => {
    const userMessage: Message = { ...message, id: 'human-1', agentId: null, role: 'user', author: 'Você', text: 'Mensagem do usuário', runId: null }
    render(<MessageList messages={[userMessage]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    const bubble = screen.getByText('Mensagem do usuário').closest('[data-slot="dsh-user-message-bubble"]')
    expect(bubble).toBeInTheDocument()
    expect(bubble).not.toHaveClass('bg-primary')
    expect(bubble).not.toHaveClass('text-primary-foreground')
  })
})

/** Ids das mensagens V1 no DOM; a mensagem assistant do runtime leva o id do turno e fica de fora. */
const v1Ids = (container: HTMLElement) => [...container.querySelectorAll('[data-message-id]')].map(node => node.getAttribute('data-message-id')!).filter(id => !id.startsWith('turn:'))

describe('rolagem e posição de leitura', () => {
  const makeMessage = (id: string, text: string): Message => ({ id, conversationId: 'conversation-1', agentId: 'agent-1', author: 'Pits', role: 'assistant', text, status: 'completed', runId: null, createdAt: '' })
  const human = (id: string, text: string): Message => ({ ...makeMessage(id, text), role: 'user', agentId: null, author: 'Você' })
  const props = { fileChanges: [], approvals: [], conversations: [], agentOf: () => undefined, onOpenRelatedConversation: () => undefined, onNotice: () => undefined }

  it('já mostra o histórico no primeiro render, sem esperar o runtime sincronizar', () => {
    const html = renderToString(<MessageList messages={[human('u1', 'Pergunta inicial'), makeMessage('m1', 'Resposta inicial')]} {...props} />)
    expect(html).toContain('Pergunta inicial')
    expect(html).toContain('Resposta inicial')
  })

  it('usa o viewport e o botão de fim do assistant-ui', () => {
    const { container } = render(<MessageList messages={[makeMessage('m1', 'Oi')]} {...props} />)
    expect(container.querySelector('[data-aui-thread-root]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir para as mensagens mais recentes' })).toBeInTheDocument()
  })

  it('o streaming não desmonta a mensagem já montada ao receber fragmentos', async () => {
    const streaming = (text: string) => [human('u1', 'Pergunta'), { ...makeMessage('m1', text), status: 'running' as const, runId: 'run-1' }]
    const { container, rerender } = render(<MessageList messages={streaming('Primeiro')} {...props} />)
    const reply = container.querySelector('[data-message-id="m1"]')!
    const turn = reply.parentElement!
    rerender(<MessageList messages={streaming('Primeiro fragmento')} {...props} />)
    rerender(<MessageList messages={streaming('Primeiro fragmento e mais um')} {...props} />)
    expect(container.querySelector('[data-message-id="m1"]')).toBe(reply)
    expect(reply.parentElement).toBe(turn)
    await waitFor(() => expect(reply).toHaveTextContent('Primeiro fragmento e mais um'))
    // Ao concluir, o mesmo bloco continua na tela com o texto final.
    rerender(<MessageList messages={[human('u1', 'Pergunta'), { ...makeMessage('m1', 'Primeiro fragmento e mais um. Fim.'), runId: 'run-1' }]} {...props} />)
    expect(container.querySelector('[data-message-id="m1"]')).toBe(reply)
    await waitFor(() => expect(reply).toHaveTextContent('Fim.'))
  })

  it('mostra marcadores acessíveis e navega para o turno escolhido', () => {
    const scrollIntoView = vi.fn()
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scrollIntoView)
    const { container } = render(<MessageList messages={[human('u1', 'Pergunta um'), makeMessage('m2', 'Resposta um'), human('u3', 'Pergunta dois'), makeMessage('m4', 'Resposta dois'), human('u5', 'Pergunta três'), makeMessage('m6', 'Resposta três')]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o turno 2' }))
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector('[data-message-id="u3"]'))
    expect(screen.getByRole('button', { name: 'Ir para o turno 2' })).toHaveAttribute('aria-current', 'location')
    vi.restoreAllMocks()
  })

  it('rola até a mensagem focada pela busca e a destaca, sem puxar para o fim', () => {
    const scrollIntoView = vi.fn()
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scrollIntoView)
    const messages = [human('u1', 'Pergunta um'), makeMessage('m2', 'Resposta um'), human('u3', 'Pergunta dois'), makeMessage('m4', 'Resposta dois')]
    const { container, rerender } = render(<MessageList messages={messages} {...props} hasNewerMessages />)
    expect(scrollIntoView).not.toHaveBeenCalled()
    rerender(<MessageList messages={messages} {...props} hasNewerMessages focusedMessageId="m2" />)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(container.querySelector('[data-message-id="m2"]'))
    expect(container.querySelector('[data-message-id="m2"]')!.className).toMatch(/focused/)
    vi.restoreAllMocks()
  })

  it('oferece voltar às mensagens recentes quando há mensagens mais novas fora da janela', () => {
    const onReturnToLatest = vi.fn()
    render(<MessageList messages={[makeMessage('m1', 'Antiga')]} {...props} hasNewerMessages onReturnToLatest={onReturnToLatest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às mensagens recentes' }))
    expect(onReturnToLatest).toHaveBeenCalledOnce()
  })

  it('carrega mensagens anteriores e mantém a linha que o usuário estava lendo', async () => {
    const recent = [human('u3', 'Pergunta recente'), makeMessage('m4', 'Resposta recente')]
    const older = [human('u1', 'Pergunta antiga'), makeMessage('m2', 'Resposta antiga')]
    let load!: () => void
    const onLoadOlder = vi.fn(() => new Promise<void>(resolve => { load = resolve }))
    const { container, rerender } = render(<MessageList messages={recent} {...props} hasOlderMessages onLoadOlder={onLoadOlder} />)
    const scroller = container.querySelector<HTMLElement>('[data-aui-thread-root] > div')!
    // Layout simulado: cada turno ocupa 200px.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => container.querySelectorAll('[data-turn-start]').length * 200 })
    scroller.scrollTop = 30
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }))
    expect(onLoadOlder).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Carregando…' })).toBeDisabled()
    rerender(<MessageList messages={[...older, ...recent]} {...props} hasOlderMessages onLoadOlder={onLoadOlder} />)
    await act(async () => { load() })
    expect(container).toHaveTextContent('Pergunta antiga')
    expect(scroller.scrollTop).toBe(30 + 200)
  })

  it('avisa quando o carregamento de mensagens anteriores falha e não mexe na posição', async () => {
    const onNotice = vi.fn()
    const { container } = render(<MessageList messages={[makeMessage('m1', 'Oi')]} {...props} onNotice={onNotice} hasOlderMessages onLoadOlder={() => Promise.reject(new Error('Sem rede.'))} />)
    const scroller = container.querySelector<HTMLElement>('[data-aui-thread-root] > div')!
    scroller.scrollTop = 40
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Sem rede.'))
    expect(scroller.scrollTop).toBe(40)
  })
})

describe('estado vazio da conversa', () => {
  const emptyList = (workspaceName?: string) => <MessageList messages={[]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} workspaceName={workspaceName} />

  it('mostra o título e o workspace da conversa sem duplicar o avatar do cabeçalho', () => {
    render(emptyList('Politron'))
    const hero = screen.getByTestId('chat-empty-state')
    expect(within(hero).getByRole('heading', { name: 'Como posso ajudar?' })).toBeInTheDocument()
    expect(within(hero).getByText('Politron')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Pits, mascote do Politron' })).not.toBeInTheDocument()
    expect(within(hero).queryByRole('button')).not.toBeInTheDocument()
  })

  it('explicita quando a conversa não pertence a um workspace e não sugere prompts', () => {
    render(emptyList())
    const hero = screen.getByTestId('chat-empty-state')
    expect(within(hero).getByText('Sem projeto')).toBeInTheDocument()
    expect(within(hero).queryByText(/sugestão|exemplo/i)).not.toBeInTheDocument()
  })
})

describe('identificação de agentes no chat', () => {
  it('mostra avatar e nome discreto do Boo no primeiro bloco da resposta', () => {
    const agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as import('../../../../shared/v9').Agent
    render(<MessageList messages={[message]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => agent} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByText('Lyra')).toBeInTheDocument()
    expect(screen.getByTitle('Lyra')).toHaveTextContent('Lyra')
    expect(screen.getByRole('img', { name: 'Lyra — idle' })).toBeInTheDocument()
  })
})

describe('linha de atividade do agente', () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 9, 28, 12, 0, seconds)).toISOString()
  const reply = (id: string, text: string, status: Message['status'], seconds: number): Message => ({ ...message, id, text, status, runId: 'run-9', createdAt: at(seconds) })
  const act = (id: string, text: string, seconds: number): Message => ({ ...message, id, role: 'activity', text, status: 'completed', runId: 'run-9', createdAt: at(seconds) })
  const browser = (n: number) => Array.from({ length: n }, (_, index) => act(`a${index}`, `Navegador real · js · alvo https://example.com/\nawait tab.goto(${index})`, 2 + index))
  const list = (messages: Message[], approvals: Approval[] = []) => <MessageList messages={messages} fileChanges={[]} approvals={approvals} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />

  it('mostra o Boo do agente digitando no card enquanto roda, e nunca para agente com foto', () => {
    const lyra = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as import('../../../../shared/v9').Agent
    const calls = browser(2)
    calls[1] = { ...calls[1]!, status: 'running' }
    const view = (agent: typeof lyra) => <MessageList messages={[reply('pre', 'Vou abrir o site.', 'running', 0), ...calls]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => agent} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />
    const { container, rerender } = render(view(lyra))
    const working = within(container.querySelector('[data-part="work-card"]') as HTMLElement).getByRole('img', { name: 'Lyra está trabalhando' })
    expect(working.style.getPropertyValue('--boo-body')).toBe('#7565e8')
    rerender(view({ ...lyra, avatar: 'data:image/png;base64,AA==' }))
    expect(container.querySelector('[data-part="work-card"]')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Lyra está trabalhando' })).not.toBeInTheDocument()
    rerender(view(lyra))
  })

  it('ao terminar a ferramenta, o card vira a linha do turno e nada some', () => {
    const calls = browser(2)
    const { container, rerender } = render(list([reply('pre', 'Vou abrir o site.', 'running', 0), ...calls.slice(0, 1), { ...calls[1]!, status: 'running' }]))
    expect(container.querySelector('[data-part="work-card"]')).toBeInTheDocument()
    const turn = container.querySelector('[data-part="reply"]')!.parentElement!
    rerender(list([reply('pre', 'Vou abrir o site.', 'completed', 0), ...calls, reply('final', 'Pronto.', 'completed', 5)]))
    expect(container.querySelector('[data-part="work-card"]')).not.toBeInTheDocument()
    // O mesmo turno continua montado, o texto anterior e a ferramenta seguem visíveis.
    expect(container.querySelector('[data-part="reply"]')!.parentElement).toBe(turn)
    expect(v1Ids(container)).toEqual(['pre', 'final'])
    expect(screen.getByRole('button', { name: 'Navegou na web' })).toBeInTheDocument()
    expect(container).toHaveTextContent('Vou abrir o site.')
    expect(container).toHaveTextContent('Pronto.')
  })

  it('durante uma ferramenta ativa, abre o card "Executando tarefa" com os passos em ordem e mantém o status do turno genérico', () => {
    const calls = browser(6)
    calls[5] = { ...calls[5]!, status: 'running' }
    // Chegam fora de ordem: o card ordena pelo início de cada ferramenta.
    const { container } = render(list([reply('pre', 'Vou abrir o site.', 'running', 0), ...[...calls].reverse()]))
    const card = container.querySelector('[data-part="work-card"]') as HTMLElement
    expect(card).toHaveTextContent('Executando tarefa')
    expect(within(card).getAllByText(/^Navegando/).length).toBeGreaterThan(0)
    const steps = within(card).getAllByRole('listitem')
    expect(steps.map(step => step.getAttribute('data-message-id'))).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5'])
    expect(steps.at(-1)).toHaveAttribute('data-state', 'running')
    expect(screen.getByRole('status')).toHaveTextContent('Em andamento')
    expect(container).not.toHaveTextContent('está trabalhando')
    // Detalhes de um passo abrem sob demanda; recolher esconde a lista.
    const first = within(steps[0]!).getByRole('button')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(card).getByRole('button', { name: 'Recolher passos' }))
    expect(within(card).queryByRole('list')).not.toBeInTheDocument()
  })

  it('mostra só os seis passos mais recentes e o bloco de comandos com o resultado', () => {
    const calls = [...browser(7), { ...act('cmd', 'Terminal · npm test', 20), tool: { name: 'workspace_run_command', args: '{"command":"npm test"}', status: 'completed' as const, output: 'Tests 12 passed', startedAt: at(20), finishedAt: at(21) } }, { ...act('run', 'Terminal · npm run build', 22), status: 'running' as const, tool: { name: 'workspace_run_command', args: '{"command":"npm run build"}', status: 'running' as const, startedAt: at(22) } }]
    const { container } = render(list([reply('pre', 'Vou testar.', 'running', 0), ...calls]))
    const card = container.querySelector('[data-part="work-card"]') as HTMLElement
    expect(within(card).getByRole('button', { name: '+3 passos anteriores' })).toBeInTheDocument()
    const terminal = within(card).getByLabelText('Comandos executados')
    expect(terminal).toHaveTextContent('> npm test')
    expect(terminal).toHaveTextContent('✓ Tests 12 passed')
    expect(terminal).toHaveTextContent('executando…')
    fireEvent.click(within(card).getByRole('button', { name: '+3 passos anteriores' }))
    expect(within(card).getAllByRole('listitem')).toHaveLength(9)
  })

  it('entre chamadas já concluídas, o turno ativo mostra "Pensando" em vez de repetir a última ação', () => {
    render(list([reply('pre', 'Vou abrir o site.', 'running', 0), ...browser(6)]))
    expect(screen.getByRole('status')).toHaveTextContent('Pensando')
    expect(screen.getByRole('status')).not.toHaveTextContent('Navegando')
  })

  it('ao terminar, mantém o resumo no rodapé, as ferramentas na ordem e a resposta final abaixo', () => {
    const { container } = render(list([reply('pre', 'Vou abrir o site.', 'completed', 0), ...browser(6), act('t1', 'Terminal · npm test', 30), act('t2', 'Terminal · ls', 35), reply('final', 'Pronto.', 'completed', 38)]))
    // Nada é recolhido por trás de um cabeçalho: o resumo é só um rodapé informativo.
    expect(screen.queryByRole('button', { name: /Concluído em/ })).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="header"]')).toHaveTextContent('Concluído em 38s · 8 ferramentas')
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Navegou na web e executou comandos/ }))
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(8)
    expect(container.querySelector('[data-chat-call-id="t1"]')).toBeInTheDocument()
    const lastTool = container.querySelectorAll('[data-chat-call-id]')[7]!
    const firstReply = container.querySelector('[data-message-id="pre"]')!
    const finalReply = container.querySelector('[data-message-id="final"]')!
    expect(firstReply.compareDocumentPosition(lastTool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lastTool.compareDocumentPosition(finalReply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('o estado aberto escolhido pelo usuário persiste quando o turno termina', () => {
    const calls = browser(2)
    const { container, rerender } = render(list([reply('pre', 'Vou abrir o site.', 'running', 0), ...calls]))
    fireEvent.click(screen.getByRole('button', { name: 'Navegou na web' }))
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(2)
    rerender(list([reply('pre', 'Vou abrir o site.', 'completed', 0), ...calls, reply('final', 'Pronto.', 'completed', 9)]))
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(2)
  })

  it('mantém raciocínio, delegação e nota na ordem original do histórico', () => {
    const reasoning = act('r1', 'Raciocínio', 1)
    const origin: Message = { ...message, id: 'origin', role: 'activity', text: 'Pedido para Mimir: revisar\nExecutando.', status: 'running', runId: null, delegationId: 'del', relatedConversationId: 'child', delegationTask: 'revisar', createdAt: at(3) }
    const note: Message = { ...message, id: 'note', role: 'activity', text: 'Missão retomada', status: 'completed', runId: null, createdAt: at(4) }
    const { container } = render(list([reply('a', 'Primeiro.', 'completed', 0), { ...reasoning, tool: { name: 'reasoning', output: 'pensando alto', status: 'completed', startedAt: at(1) } }, act('t', 'Terminal · ls', 2), origin, note, reply('z', 'Último.', 'running', 5)]))
    expect(v1Ids(container)).toEqual(['a', 'r1', 'origin', 'note', 'z'])
    expect(screen.getByRole('button', { name: 'Executou comandos' })).toBeInTheDocument()
  })

  it('mostra aprovações do run uma única vez, sob a última linha, e oculta a resposta vazia concluída', () => {
    const pending = { ...approval, runId: 'run-9' }
    const { container } = render(list([reply('empty', '', 'completed', 0), ...browser(2), reply('final', 'Confirma?', 'waiting', 5)], [pending]))
    expect(screen.getAllByRole('region', { name: 'Aprovação de ferramenta' })).toHaveLength(1)
    expect(within(container.querySelector<HTMLElement>('[data-message-id="final"]')!).getByRole('region', { name: 'Aprovação de ferramenta' })).toBeInTheDocument()
    expect(container.querySelector('[data-message-id="empty"]')).toBeNull()
  })

  it('mantém a aprovação visível quando a última mensagem do run é uma resposta vazia aguardando', () => {
    const pending = { ...approval, runId: 'run-9' }
    const { container } = render(list([reply('pre', 'Vou escrever.', 'running', 0), ...browser(1), reply('espera', '', 'waiting', 3)], [pending]))
    expect(screen.getAllByRole('region', { name: 'Aprovação de ferramenta' })).toHaveLength(1)
    expect(container.querySelector('[data-part="running"]')).toHaveTextContent('Aguardando sua aprovação')
    expect(v1Ids(container)).not.toContain('espera')
  })

  it('mensagens na fila ou removidas da fila não aparecem no chat', () => {
    const user = (id: string, status: Message['status']): Message => ({ id, conversationId: 'conversation-1', agentId: null, author: 'Você', role: 'user', text: `Texto ${id}`, status, runId: null, createdAt: '' })
    const { container } = render(list([user('sent', 'completed'), message, user('waiting', 'queued'), user('removed', 'cancelled')]))
    expect(v1Ids(container)).toEqual(['sent', 'message-1'])
  })
})

describe('cartão de delegações', () => {
  const boos = ['Examen', 'Mimir', 'Hermes', 'Atena'].map((name, index) => ({ id: `boo-${index}`, name, alias: name.toLowerCase(), color: '#786bea' }) as Agent)
  const conversations = boos.map((boo, index) => ({ id: `child-${index}`, name: `${boo.name} · tarefa ${index}`, kind: 'direct', agentIds: [boo.id], workspaceId: 'w', titleAuto: false, revision: 1, archived: false, createdAt: '' }) as Conversation)
  const ask = (index: number): Message => ({ id: `ask-${index}`, conversationId: 'chief', agentId: 'atlas', author: 'Atlas', role: 'activity', text: `Delegação · ${boos[index]!.name}`, status: 'completed', runId: 'run-chief', createdAt: '' })
  const task = (index: number) => `Contexto: monorepo BubbleDesk, SaaS multi-tenant.\nTarefa: revisar a parte ${index}.\nDetalhes longos ${index}.`
  const origin = (index: number, status: Message['status'] = 'running'): Message => ({
    id: `origin-${index}`, conversationId: 'chief', agentId: boos[index]!.id, author: boos[index]!.name, role: 'activity', status, runId: null,
    delegationId: `delegation-${index}`, relatedConversationId: `child-${index}`, delegationTask: task(index), createdAt: '',
    text: status === 'completed' ? `Pedido concluído por ${boos[index]!.name}. Resultado disponível na conversa relacionada.\n\nResultado da parte ${index}.` : `Pedido para ${boos[index]!.name}: ${task(index)}\nExecutando na conversa privada do agente.`,
  })
  const renderCard = (messages: Message[], onOpen = vi.fn()) => render(<MessageList messages={messages} fileChanges={[]} approvals={[]} conversations={conversations} agentOf={id => boos.find(boo => boo.id === id)} onOpenRelatedConversation={onOpen} onNotice={() => undefined} />)

  it('agrupa 4 delegações num cartão com uma linha por Boo, sem repetir "Delegando tarefa"', () => {
    const { container } = renderCard([ask(0), origin(0), ask(1), origin(1), ask(2), origin(2, 'completed'), ask(3), origin(3, 'failed')])
    const card = screen.getByRole('region', { name: 'Delegou para 4 Boos' })
    expect(within(card).getAllByRole('listitem')).toHaveLength(4)
    expect(v1Ids(container)).toEqual(['origin-0'])
    expect(container).not.toHaveTextContent(/Delega(ndo|ção ·)/)
    expect(within(card).getAllByRole('img', { name: 'Trabalhando' })).toHaveLength(2)
    expect(within(card).getByRole('img', { name: 'Concluído' })).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Erro' })).toBeInTheDocument()
    expect(within(card).getAllByText('revisar a parte 0')).toHaveLength(1)
    expect(within(card).getAllByRole('button', { name: 'Cancelar pedido' })).toHaveLength(2)
  })

  it('abre a conversa, cancela pelo handler existente e expande pedido e resultado', () => {
    const cancelDelegation = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('appAPI', { cancelDelegation })
    const onOpen = vi.fn()
    renderCard([origin(0), origin(1, 'completed')], onOpen)
    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir conversa' })[1]!)
    expect(onOpen).toHaveBeenCalledWith('child-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(cancelDelegation).toHaveBeenCalledWith('delegation-0')
    expect(screen.queryByText('Resultado da parte 1.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver pedido para Mimir' }))
    expect(screen.getByRole('region', { name: 'Pedido completo' })).toHaveTextContent('Detalhes longos 1.')
    expect(screen.getByRole('region', { name: 'Resultado' })).toHaveTextContent('Resultado da parte 1.')
    vi.unstubAllGlobals()
  })

  it('cartão de uma delegação usa o singular e mensagens antigas sem delegationTask ainda entram', () => {
    const legacy = { ...origin(0), delegationTask: undefined }
    renderCard([legacy])
    expect(screen.getByRole('region', { name: 'Delegou para 1 Boo' })).toHaveTextContent('revisar a parte 0')
  })
})
