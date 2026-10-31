import { useMemo, useState } from 'react'
import { MoreVertical, Pin, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/dsh'
import type { Agent, Conversation, Message, Run, Snapshot } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { AgentAvatarGroup } from '../app/AgentAvatarGroup'
import { conversationIdentity } from '../chat/ChatHeader'
import { ThemeSelector } from '@/components/ide/ThemeSelector'
import { chiefOf, taskTitle } from './pwa-agent-model'
import './pwa-chats.css'

export type PwaMenuAction = 'home' | 'board' | 'office' | 'projects'
export interface PwaChat { conversation: Conversation; title: string; subtitle?: string; agents: Agent[]; group: boolean; pinned: boolean; at: string; preview: string; status?: 'typing' | 'waiting'; unread: number }

const ACTIVE: Run['status'][] = ['queued', 'running', 'waiting']

/** Hora no estilo de lista de conversas: hoje mostra hh:mm, ontem "ontem", antes a data curta. */
export function chatTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diff = Math.round((day(now) - day(date)) / 86_400_000)
  if (diff <= 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Conversas como numa lista de mensageiro: Chief fixado no topo, depois a mais recente, com prévia, estado e não lidas. */
export function chatList(snapshot: Snapshot, unread: Record<string, number>): PwaChat[] {
  const chief = chiefOf(snapshot)
  const last = new Map<string, Message>()
  for (const message of snapshot.messages) {
    if (message.role === 'activity' || !message.text.trim()) continue
    const previous = last.get(message.conversationId)
    if (!previous || previous.createdAt <= message.createdAt) last.set(message.conversationId, message)
  }
  return snapshot.conversations.filter(conversation => !conversation.archived).map(conversation => {
    const identity = conversationIdentity(conversation, snapshot.agents, snapshot.assistant)
    const runs = snapshot.runs.filter(run => run.conversationId === conversation.id && ACTIVE.includes(run.status))
    // Desktop tem as mensagens no snapshot; o PWA recebe só a prévia da última (lastMessage).
    const message = last.get(conversation.id) || conversation.lastMessage
    const author = message?.role === 'user' ? 'Você: ' : message && identity.isGroup ? `${message.author}: ` : ''
    const pinned = !!chief && !identity.isGroup && conversation.agentIds.length === 1 && conversation.agentIds[0] === chief.id && !conversation.parentConversationId
    return {
      conversation, title: identity.title, subtitle: identity.isGroup || !identity.subtitle ? undefined : taskTitle(identity.subtitle, identity.title), agents: identity.identities, group: identity.isGroup, pinned,
      at: message?.createdAt || conversation.updatedAt || conversation.createdAt,
      preview: message ? author + message.text.replace(/\s+/g, ' ').trim() : identity.subtitle || 'Toque para conversar',
      status: runs.some(run => run.status === 'waiting') ? 'waiting' as const : runs.length ? 'typing' as const : undefined,
      unread: unread[conversation.id] || 0,
    }
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at))
}

/**
 * Tela inicial do PWA no estilo de um mensageiro: conversas com os agentes e grupos, busca, nova conversa e um menu
 * para Central, Board, Escritório e Projetos. No navegador grande fica à esquerda, como uma versão web de mensageiro.
 */
export function PwaChatList({ snapshot, unreadCounts, selectedId, canChat, onSelect, onNewChat, onMenu }: {
  snapshot: Snapshot; unreadCounts: Record<string, number>; selectedId?: string; canChat: boolean
  onSelect: (conversationId: string) => void; onNewChat: (agent: Agent) => void; onMenu: (action: PwaMenuAction) => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const chats = useMemo(() => chatList(snapshot, unreadCounts), [snapshot, unreadCounts])
  const term = query.trim().toLocaleLowerCase('pt-BR')
  const visible = term ? chats.filter(chat => `${chat.title} ${chat.subtitle || ''} ${chat.preview}`.toLocaleLowerCase('pt-BR').includes(term)) : chats
  const contacts = [snapshot.assistant, ...snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired')]

  return <section className="pwa-chats" aria-label="Conversas">
    <header className="pwa-chats__header">
      {searching
        ? <label className="pwa-chats__search"><Search aria-hidden="true" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar conversas" aria-label="Pesquisar conversas" />
          <Button variant="ghost" size="icon" className="size-8" aria-label="Fechar pesquisa" onClick={() => { setSearching(false); setQuery('') }}><X /></Button></label>
        : <>
          <h1 className="pwa-chats__title">Boobot</h1>
          <ThemeSelector compact />
          <Button variant="ghost" size="icon" className="size-9" aria-label="Pesquisar" onClick={() => setSearching(true)}><Search /></Button>
          <Menu open={newOpen} onClose={() => setNewOpen(false)} align="end" portal autoFocus
            anchor={<Button variant="ghost" size="icon" className="size-9" aria-label="Nova conversa" disabled={!canChat} aria-haspopup="menu" aria-expanded={newOpen} onClick={() => setNewOpen(value => !value)}><Plus /></Button>}
            items={contacts.map(agent => ({ id: agent.id, label: agent.name, icon: <Avatar agent={agent} size="xxs" /> }))}
            onSelect={id => { setNewOpen(false); const agent = contacts.find(item => item.id === id); if (agent) onNewChat(agent) }} />
          <Menu open={menuOpen} onClose={() => setMenuOpen(false)} align="end" portal autoFocus
            anchor={<Button variant="ghost" size="icon" className="size-9" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreVertical /></Button>}
            items={[{ id: 'home', label: 'Central do Chief' }, { id: 'board', label: 'Board da empresa' }, { id: 'office', label: 'Escritório' }, { id: 'projects', label: 'Projetos' }]}
            onSelect={id => { setMenuOpen(false); onMenu(id as PwaMenuAction) }} />
        </>}
    </header>
    <ul className="pwa-chats__list">
      {visible.map(chat => <li key={chat.conversation.id}>
        <button type="button" className="pwa-chat" aria-current={chat.conversation.id === selectedId ? 'true' : undefined} onClick={() => onSelect(chat.conversation.id)}
          aria-label={`${chat.title}${chat.subtitle ? `, ${chat.subtitle}` : ''}. ${chat.status === 'typing' ? 'Digitando' : chat.status === 'waiting' ? 'Aguardando você' : chat.preview}${chat.unread ? `. ${chat.unread} não lidas` : ''}`}>
          <span className="pwa-chat__avatar">{chat.group ? <AgentAvatarGroup agents={chat.agents} maxVisible={2} /> : <Avatar agent={chat.agents[0]} size="sm" state={chat.status === 'typing' ? 'working' : chat.status === 'waiting' ? 'waiting' : 'idle'} />}</span>
          <span className="pwa-chat__body">
            <span className="pwa-chat__top">
              <span className="pwa-chat__name">{chat.title}{chat.subtitle && <span className="pwa-chat__subtitle"> · {chat.subtitle}</span>}</span>
              <span className="pwa-chat__time" data-unread={chat.unread > 0 || undefined}>{chatTime(chat.at)}</span>
            </span>
            <span className="pwa-chat__bottom">
              <span className="pwa-chat__preview" data-status={chat.status}>{chat.status === 'typing' ? 'digitando…' : chat.status === 'waiting' ? 'aguardando você' : chat.preview}</span>
              {chat.pinned && <Pin aria-label="Fixada" className="pwa-chat__pin" />}
              {chat.unread > 0 && <span className="pwa-chat__unread">{chat.unread > 99 ? '99+' : chat.unread}</span>}
            </span>
          </span>
        </button>
      </li>)}
      {!visible.length && <li className="pwa-chats__empty">{term ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda. Toque em + para falar com um Boo.'}</li>}
    </ul>
  </section>
}

/** Cabeçalho da conversa aberta no celular: voltar, avatar, nome e se o agente está digitando ou online. */
export function PwaChatTopBar({ snapshot, conversation, onBack, tools = [], onTool }: { snapshot: Snapshot; conversation: Conversation; onBack: () => void; tools?: { id: string; label: string }[]; onTool?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const identity = conversationIdentity(conversation, snapshot.agents, snapshot.assistant)
  const runs = snapshot.runs.filter(run => run.conversationId === conversation.id && ACTIVE.includes(run.status))
  const status = runs.some(run => run.status === 'waiting') ? 'aguardando você' : runs.length ? 'digitando…' : identity.isGroup ? identity.identities.map(agent => agent.name).join(', ') : 'online'
  return <header className="pwa-chat-top">
    <Button variant="ghost" size="icon" className="size-9" aria-label="Voltar para as conversas" onClick={onBack}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></Button>
    <span className="pwa-chat__avatar">{identity.isGroup ? <AgentAvatarGroup agents={identity.identities} maxVisible={2} /> : <Avatar agent={identity.identities[0]} size="xs" />}</span>
    <span className="min-w-0 flex-1"><span className="pwa-chat-top__name">{identity.title}</span><span className="pwa-chat-top__status" data-status={runs.length ? 'active' : undefined}>{status}</span></span>
    {!!tools.length && onTool && <Menu open={open} onClose={() => setOpen(false)} align="end" portal autoFocus
      anchor={<Button variant="ghost" size="icon" className="size-9" aria-label="Ferramentas da conversa" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><MoreVertical /></Button>}
      items={tools} onSelect={id => { setOpen(false); onTool(id) }} />}
  </header>
}
