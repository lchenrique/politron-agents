import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent, Conversation, Message, Run, Snapshot } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { PwaChatList, chatList, chatTime } from './PwaChatList'

const agent = (id: string, name: string, role?: Agent['role']) => ({ id, name, alias: id, color: '#ffffff', avatar: '', role }) as Agent
const conversation = (id: string, name: string, agentIds: string[], extra: Partial<Conversation> = {}) => ({ id, name, kind: agentIds.length > 1 ? 'group' : 'direct', agentIds, workspaceId: 'w', archived: false, createdAt: '2026-10-30T10:00:00Z', ...extra }) as Conversation
const message = (conversationId: string, role: Message['role'], text: string, createdAt: string, author = 'Boo') => ({ id: `${conversationId}-${createdAt}`, conversationId, role, text, createdAt, author, status: 'completed' }) as Message
const snapshot = {
  ...emptySnapshot,
  agents: [agent('chief', 'Chief', 'chief'), agent('freya', 'Freya'), agent('tyr', 'Tyr')],
  conversations: [conversation('c-chief', 'Chief', ['chief']), conversation('c-freya', 'Freya', ['freya']), conversation('c-team', 'Politron', ['chief', 'freya', 'tyr'])],
  messages: [message('c-chief', 'assistant', 'Distribuí as tarefas.', '2026-10-31T09:00:00Z'), message('c-freya', 'user', 'Revise o board', '2026-10-31T10:00:00Z'), message('c-team', 'assistant', 'Aprovado', '2026-10-31T11:00:00Z', 'Tyr')],
  runs: [{ id: 'r', agentId: 'freya', conversationId: 'c-freya', status: 'running' }] as Run[],
} as unknown as Snapshot

describe('lista de conversas do PWA', () => {
  it('fixa o Chief no topo, ordena pela mais recente e mostra prévia, autor, digitando e não lidas', () => {
    const chats = chatList(snapshot, { 'c-team': 3 })
    expect(chats.map(chat => chat.conversation.id)).toEqual(['c-chief', 'c-team', 'c-freya'])
    expect(chats[0]).toMatchObject({ pinned: true, preview: 'Distribuí as tarefas.' })
    expect(chats[1]).toMatchObject({ group: true, preview: 'Tyr: Aprovado', unread: 3 })
    expect(chats[2]).toMatchObject({ status: 'typing', preview: 'Você: Revise o board' })
  })

  it('usa a prévia enviada pelo PWA e não repete o nome do Boo no título da tarefa', () => {
    const pwa = { ...snapshot, messages: [], conversations: [conversation('c-task', 'Freya · Redesenhar o board', ['freya'], { lastMessage: { text: 'Cards prontos', author: 'Freya', role: 'assistant', createdAt: '2026-10-31T12:00:00Z' } })] } as unknown as Snapshot
    expect(chatList(pwa, {})[0]).toMatchObject({ title: 'Freya', subtitle: 'Redesenhar o board', preview: 'Cards prontos' })
  })

  it('formata a hora como num mensageiro', () => {
    const now = new Date('2026-10-31T15:00:00')
    expect(chatTime('2026-10-31T09:05:00', now)).toMatch(/09:05/)
    expect(chatTime('2026-10-30T09:05:00', now)).toBe('ontem')
    expect(chatTime('2026-10-20T09:05:00', now)).toBe('20/10')
  })

  it('abre a conversa tocada, pesquisa pelo nome e abre o menu de Central, Board, Escritório e Projetos', () => {
    const onSelect = vi.fn(), onMenu = vi.fn()
    render(<PwaChatList snapshot={snapshot} unreadCounts={{}} canChat onSelect={onSelect} onNewChat={vi.fn()} onMenu={onMenu} />)
    const list = screen.getByRole('region', { name: 'Conversas' })
    expect(within(list).getByText('digitando…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Politron\./ }))
    expect(onSelect).toHaveBeenCalledWith('c-team')
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Pesquisar conversas' }), { target: { value: 'frey' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar pesquisa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Escritório' }))
    expect(onMenu).toHaveBeenCalledWith('office')
  })
})
