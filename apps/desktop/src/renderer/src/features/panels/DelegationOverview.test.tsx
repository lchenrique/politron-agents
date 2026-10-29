import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation, Message, Run } from '../../../../shared/v9'
import { DelegationOverview } from './DelegationOverview'

const at = '2026-10-29T12:00:00.000Z'
const boo = (id: string, name: string) => ({ id, name, alias: id, color: '#786bea', avatar: '' }) as Agent
const rootConversation = (id: string, name: string, agentId: string, parentConversationId?: string): Conversation => ({ id, kind: 'direct', name, agentIds: [agentId], workspaceId: 'ws1', titleAuto: false, revision: 1, archived: false, createdAt: at, ...(parentConversationId ? { parentConversationId } : {}) })
const origin = (id: string, target: string, agentId: string, author: string, task: string, status: Message['status']): Message => ({ id, conversationId: 'root', agentId, author, role: 'activity', text: `Pedido para ${author}: ${task}\nAguardando execução na conversa privada do agente.`, status, runId: null, delegationId: `delegation-${id}`, relatedConversationId: target, delegationTask: task, createdAt: at })
const childRun = (id: string, conversationId: string, agent: Agent, input: string, status: Run['status']): Run => ({ id, conversationId, agentId: agent.id, rootId: 'run-root', parentId: 'run-parent', ancestry: ['root-agent', agent.id], status, threadId: null, turnId: null, messageId: `message-${id}`, input, agent, workspaceId: 'ws1', workspacePath: 'C:/workspace', createdAt: at })

describe('visão de agentes delegados', () => {
  const renderOverview = (props: Partial<React.ComponentProps<typeof DelegationOverview>> = {}) => render(<DelegationOverview conversationId="root" messages={[]} conversations={[rootConversation('root', 'Conversa principal', 'root-agent')]} runs={[]} agents={[]} onOpenConversation={vi.fn()} {...props} />)

  it('mostra um estado vazio sem iniciar ou criar delegações', () => {
    renderOverview()
    expect(screen.getByRole('region', { name: 'Agentes delegados' })).toHaveTextContent('Nenhuma delegação nesta conversa')
    expect(screen.queryByRole('button', { name: /Abrir conversa/ })).not.toBeInTheDocument()
  })

  it('lista delegações paralelas uma vez cada com status concluído, aguardando e falha', () => {
    const agents = [boo('atlas', 'Atlas'), boo('lyra', 'Lyra'), boo('mimir', 'Mimir')]
    const children = agents.map((agent, index) => rootConversation(`child-${index}`, `${agent.name} · tarefa`, agent.id, 'root'))
    const messages = [
      origin('one', 'child-0', 'atlas', 'Atlas', 'Revisar a campanha', 'completed'),
      origin('two', 'child-1', 'lyra', 'Lyra', 'Escrever a copy', 'waiting'),
      origin('three', 'child-2', 'mimir', 'Mimir', 'Validar métricas', 'failed'),
    ]
    renderOverview({ agents, conversations: [rootConversation('root', 'Principal', 'root-agent'), ...children], messages })
    const entries = screen.getAllByTestId('delegation-entry')
    expect(entries).toHaveLength(3)
    expect(within(entries[0]).getByText('Revisar a campanha')).toBeInTheDocument()
    expect(within(entries[0]).getByText('Concluído')).toBeInTheDocument()
    expect(within(entries[1]).getByText('Aguardando')).toBeInTheDocument()
    expect(within(entries[2]).getByText('Falhou')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Abrir conversa de/ })).toHaveLength(3)
  })

  it('monta níveis encadeados a partir da relação entre conversas e runs', () => {
    const atlas = boo('atlas', 'Atlas')
    const lyra = boo('lyra', 'Lyra')
    const messages = [origin('one', 'child', 'atlas', 'Atlas', 'Planejar a entrega', 'running')]
    renderOverview({
      agents: [atlas, lyra], messages,
      conversations: [rootConversation('root', 'Principal', 'root-agent'), rootConversation('child', 'Pedido para Atlas', 'atlas', 'root'), rootConversation('grandchild', 'Pedido para Lyra', 'lyra', 'child')],
      runs: [childRun('run-grandchild', 'grandchild', lyra, 'Revisar os testes', 'waiting')],
    })
    const entries = screen.getAllByTestId('delegation-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveAttribute('data-depth', '0')
    expect(within(entries[0]).getByText('Planejar a entrega')).toBeInTheDocument()
    expect(entries[1]).toHaveAttribute('data-depth', '1')
    expect(within(entries[1]).getByText('Revisar os testes')).toBeInTheDocument()
    expect(within(entries[1]).getByText('Aguardando')).toBeInTheDocument()
  })

  it('abre a conversa privada vinculada ao pedido', () => {
    const onOpenConversation = vi.fn()
    renderOverview({
      agents: [boo('atlas', 'Atlas')],
      conversations: [rootConversation('root', 'Principal', 'root-agent'), rootConversation('child', 'Pedido para Atlas', 'atlas', 'root')],
      messages: [origin('one', 'child', 'atlas', 'Atlas', 'Executar pedido', 'running')],
      onOpenConversation,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa de Atlas' }))
    expect(onOpenConversation).toHaveBeenCalledWith('child')
  })

  it('não duplica conversa já descrita pela mensagem de origem', () => {
    renderOverview({
      agents: [boo('atlas', 'Atlas')],
      conversations: [rootConversation('root', 'Principal', 'root-agent'), rootConversation('child', 'Pedido para Atlas', 'atlas', 'root')],
      messages: [origin('one', 'child', 'atlas', 'Atlas', 'Fazer revisão', 'running')],
      runs: [childRun('run-child', 'child', boo('atlas', 'Atlas'), 'Fazer revisão', 'running')],
    })
    expect(screen.getAllByTestId('delegation-entry')).toHaveLength(1)
  })

  it('lê o formato legado sem delegationTask estruturado', () => {
    const legacy = origin('legacy', 'child', 'atlas', 'Atlas', 'Descartar este campo auxiliar', 'completed')
    delete legacy.delegationTask
    legacy.text = 'Pedido para Atlas: Revisar o legado\nAguardando execução na conversa privada do agente.'
    renderOverview({
      agents: [boo('atlas', 'Atlas')],
      conversations: [rootConversation('root', 'Principal', 'root-agent'), rootConversation('child', 'Pedido para Atlas', 'atlas', 'root')],
      messages: [legacy],
    })
    const entry = screen.getByTestId('delegation-entry')
    expect(within(entry).getByText('Revisar o legado')).toBeInTheDocument()
    expect(within(entry).getByText('Concluído')).toBeInTheDocument()
  })
})
