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
  const lyra = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as Agent
  const mira = { id: 'agent-2', name: 'Mira', alias: 'mira', color: '#3fb68b' } as Agent
  const agents = (id: string | null) => [lyra, mira].find(agent => agent.id === id)

  it('com um Boo só, a resposta é texto puro, sem avatar nem nome', () => {
    const { container } = render(<MessageList messages={[message]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={agents} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.queryByText('Lyra')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="reply"] [data-slot="avatar"]')).toBeNull()
  })

  it('quando dois Boos respondem no mesmo turno, cada troca de autor ganha avatar e nome', () => {
    const second: Message = { ...message, id: 'message-2', agentId: 'agent-2', author: 'Mira', text: 'Concordo.' }
    render(<MessageList messages={[message, second]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={agents} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(screen.getByTitle('Lyra')).toHaveTextContent('Lyra')
    expect(screen.getByTitle('Mira')).toHaveTextContent('Mira')
    expect(screen.getByRole('img', { name: 'Lyra — idle' })).toBeInTheDocument()
  })
})

describe('troca curta', () => {
  it('"oi" e "Oi! Como posso ajudar?" são exatamente dois blocos; hora e resumo só na barra do hover', () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 6, 12, 0, seconds)).toISOString()
    const user: Message = { ...message, id: 'u1', agentId: null, author: 'Você', role: 'user', text: 'oi', runId: null, createdAt: at(0) }
    const answer: Message = { ...message, id: 'r1', text: 'Oi! Como posso ajudar?', runId: 'run-1', createdAt: at(2), finishedAt: at(3) }
    const { container } = render(<MessageList messages={[user, answer]} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => ({ id: 'agent-1', name: 'Lyra', color: '#7565e8' } as Agent)} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />)
    expect(v1Ids(container)).toEqual(['u1', 'r1'])
    const turn = container.querySelector('[data-message-id="r1"]')!.parentElement!
    expect([...turn.children].map(child => child.getAttribute('data-part'))).toEqual(['reply'])
    expect(container.querySelector('[data-part="header"], [data-part="running"], [data-part="process"]')).toBeNull()
    expect(screen.queryByText('Lyra')).not.toBeInTheDocument()
    const reply = container.querySelector('[data-message-id="r1"]')!
    expect(reply.querySelector('[data-actions-reveal="hover"]')).not.toBeNull()
    const toolbar = within(reply as HTMLElement).getByRole('group', { name: 'Ações da mensagem' })
    expect(toolbar).toHaveTextContent('Concluído em 3s')
    expect(within(toolbar).getByRole('button', { name: 'Copiar mensagem' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Ouvir resposta do agente' })).toBeInTheDocument()
  })
})

describe('linha de atividade do agente', () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 9, 28, 12, 0, seconds)).toISOString()
  const reply = (id: string, text: string, status: Message['status'], seconds: number): Message => ({ ...message, id, text, status, runId: 'run-9', createdAt: at(seconds) })
  const act = (id: string, text: string, seconds: number): Message => ({ ...message, id, role: 'activity', text, status: 'completed', runId: 'run-9', createdAt: at(seconds) })
  const browser = (n: number) => Array.from({ length: n }, (_, index) => act(`a${index}`, `Navegador real · js · alvo https://example.com/\nawait tab.goto(${index})`, 2 + index))
  const list = (messages: Message[], approvals: Approval[] = []) => <MessageList messages={messages} fileChanges={[]} approvals={approvals} conversations={[]} agentOf={() => undefined} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />

  it('enquanto roda, uma linha só com o Boo e o passo ao vivo; as ferramentas aparecem quando o turno termina', () => {
    const lyra = { id: 'agent-1', name: 'Lyra', alias: 'lyra', color: '#7565e8' } as Agent
    const calls = browser(2)
    const view = (messages: Message[]) => <MessageList messages={messages} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => lyra} onOpenRelatedConversation={() => undefined} onNotice={() => undefined} />
    const { container, rerender } = render(view([reply('pre', 'Vou abrir o site.', 'running', 0), calls[0]!, { ...calls[1]!, status: 'running' }]))
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/^Navegando/)
    expect(status.querySelector('[data-slot="avatar"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Naveg/ })).not.toBeInTheDocument()
    const turn = container.querySelector('[data-part="reply"]')!.parentElement!
    rerender(view([reply('pre', 'Vou abrir o site.', 'completed', 0), ...calls, reply('final', 'Pronto.', 'completed', 5)]))
    // O mesmo turno continua montado; o status some e a linha discreta das ferramentas aparece.
    expect(container.querySelector('[data-part="reply"]')!.parentElement).toBe(turn)
    expect(container.querySelector('[data-part="running"]')).toBeNull()
    expect(v1Ids(container)).toEqual(['pre', 'final'])
    expect(screen.getByRole('button', { name: 'Navegou na web' })).toBeInTheDocument()
    expect(container).toHaveTextContent('Vou abrir o site.')
    expect(container).toHaveTextContent('Pronto.')
  })

  it('antes de qualquer ferramenta, diz que está entendendo o assunto; a resposta chegando substitui a linha', () => {
    const user: Message = { ...message, id: 'u1', agentId: null, author: 'Você', role: 'user', text: 'oi', runId: null, createdAt: at(0) }
    const { container, rerender } = render(list([user, reply('r', '', 'running', 1)]))
    expect(screen.getByRole('status')).toHaveTextContent('Entendendo o assunto…')
    rerender(list([user, reply('r', 'Oi!', 'running', 1)]))
    expect(container.querySelector('[data-part="running"]')).toBeNull()
  })
  it('entre chamadas já concluídas, o turno ativo mostra "Pensando" em vez de repetir a última ação', () => {
    render(list([reply('pre', 'Vou abrir o site.', 'running', 0), ...browser(6)]))
    expect(screen.getByRole('status')).toHaveTextContent('Pensando')
    expect(screen.getByRole('status')).not.toHaveTextContent('Navegando')
  })

  it('ao terminar, mantém o resumo no rodapé, as ferramentas na ordem e a resposta final abaixo', () => {
    const { container } = render(list([reply('pre', 'Vou abrir o site.', 'completed', 0), ...browser(6), act('t1', 'Terminal · npm test', 30), act('t2', 'Terminal · ls', 35), reply('final', 'Pronto.', 'completed', 38)]))
    // Sem linha de rodapé: o resumo do turno fica só na barra de ações (hover) da última resposta.
    expect(container.querySelector('[data-part="header"]')).toBeNull()
    expect(within(container.querySelector<HTMLElement>('[data-message-id="final"]')!).getByRole('group', { name: 'Ações da mensagem' })).toHaveTextContent('Concluído em 38s · 8 ferramentas')
    expect(within(container.querySelector<HTMLElement>('[data-message-id="pre"]')!).getByRole('group', { name: 'Ações da mensagem' })).not.toHaveTextContent('Concluído')
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

  it('o detalhe aberto pelo usuário continua aberto quando um novo turno começa', () => {
    const calls = browser(2)
    const done = [reply('pre', 'Vou abrir o site.', 'completed', 0), ...calls, reply('final', 'Pronto.', 'completed', 9)]
    const { container, rerender } = render(list(done))
    fireEvent.click(screen.getByRole('button', { name: 'Navegou na web' }))
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(2)
    const next: Message = { ...message, id: 'u2', agentId: null, author: 'Você', role: 'user', text: 'E agora?', runId: null, createdAt: at(20) }
    rerender(list([...done, next, { ...reply('r2', '', 'running', 21), runId: 'run-10' }]))
    expect(container.querySelectorAll('[data-chat-call-id]')).toHaveLength(2)
  })

  it('mantém raciocínio, delegação e nota na ordem original do histórico', () => {
    const reasoning = act('r1', 'Raciocínio', 1)
    const origin: Message = { ...message, id: 'origin', role: 'activity', text: 'Pedido para Mimir: revisar\nExecutando.', status: 'completed', runId: null, delegationId: 'del', relatedConversationId: 'child', delegationTask: 'revisar', createdAt: at(3) }
    const note: Message = { ...message, id: 'note', role: 'activity', text: 'Missão retomada', status: 'completed', runId: null, createdAt: at(4) }
    const { container } = render(list([reply('a', 'Primeiro.', 'completed', 0), { ...reasoning, tool: { name: 'reasoning', output: 'pensando alto', status: 'completed', startedAt: at(1) } }, act('t', 'Terminal · ls', 2), origin, note, reply('z', 'Último.', 'completed', 5)]))
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
