import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Globe, MoreHorizontal, Search, Settings2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Menu, MenuSurface, useAnchoredPosition, useDismissOnOutsidePointer } from '@/components/dsh'
import type { Agent, Conversation, MessageSearchHit, Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { assistantPlaceholder } from '../app/appShellShared'
import { conversationDisplayName } from '../../../../shared/delegation-title'

export interface ConversationChromeProps {
  assistant?: Agent
  onOpenAgent?: (agent: Agent) => void
  selected: Conversation
  agents: Agent[]
  selectedWorkspace: Workspace | undefined
  onParticipantsChange: (agentIds: string[]) => void
  onOpenComputerUse: () => void
  onOpenProjectFiles?: () => void
  onOpenMascot?: () => void
  onEditConversation: () => void
  onSearchHistory?: (query: string) => Promise<MessageSearchHit[]>
  onOpenSearchHit?: (hit: MessageSearchHit) => void
  focusedMessageId?: string | null
  onReturnToLatest?: () => void
  browserMode?: boolean
  canReadFiles?: boolean
  canChat?: boolean
}

/** Quem está na conversa e como ela se apresenta: o mesmo título serve à faixa e à aba. */
export function conversationIdentity(selected: Conversation, agents: Agent[], assistant?: Agent) {
  const participants = selected.agentIds.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent)
  const identities = participants.length ? participants : [assistant || assistantPlaceholder]
  const isGroup = selected.kind === 'group' || identities.length > 1
  // Sessões de delegação antigas têm nomes longos ("Pedido: X · Contexto: …"): mostra a forma curta.
  const name = conversationDisplayName(selected.name)
  const title = isGroup ? name : identities[0].name
  const subtitle = isGroup
    ? `${identities.length} ${identities.length === 1 ? 'participante' : 'participantes'}`
    : name !== title ? name : undefined
  return { identities, isGroup, title, subtitle }
}

// O avatar xs tem 30px; na aba ele é reduzido visualmente sem um tamanho novo no componente compartilhado.
function MiniAvatar({ agent }: { agent: Agent }) {
  return <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full"><span className="inline-flex scale-[0.667]"><Avatar agent={agent} size="xs" /></span></span>
}

/** Avatar do Boo ou da equipe: abre os detalhes do Boo ou a edição da equipe. */
export function ConversationAvatar({ selected, agents, assistant, onOpenAgent, onEditConversation, browserMode = false, canChat = true, compact = false }: ConversationChromeProps & { compact?: boolean }) {
  const { identities, isGroup } = conversationIdentity(selected, agents, assistant)
  if (isGroup) return <Button type="button" variant="ghost" size={null} aria-label="Ver participantes do grupo" title={identities.map(agent => agent.name).join(', ')} onClick={onEditConversation} disabled={browserMode || !canChat}
    className={compact ? 'relative flex h-5 w-8 shrink-0 items-center justify-start gap-0 rounded-full p-0 outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary' : 'relative flex h-10 w-12 shrink-0 items-center justify-start gap-0 rounded-md p-0 outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary'}>
    {identities.slice(0, compact ? 2 : 3).map((agent, index) =>
      <span key={agent.id} className={'absolute overflow-hidden rounded-full ring-2 ring-background ' + (compact ? 'top-0' : 'top-1')} style={{ left: index * (compact ? 10 : 9), zIndex: 3 - index }}>
        {compact ? <MiniAvatar agent={agent} /> : <Avatar agent={agent} size="xs" />}
      </span>)}
    {!compact && identities.length > 3 && <span className="absolute -bottom-0.5 right-0 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[9px] font-medium ring-1 ring-background">+{identities.length - 3}</span>}
  </Button>
  return <Button type="button" variant="ghost" size={null} aria-label={`Ver detalhes de ${identities[0].name}`} title={identities[0].name} onClick={() => onOpenAgent?.(identities[0])}
    className={compact ? 'flex size-6 shrink-0 items-center justify-center rounded-full p-0 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary' : 'flex size-10 shrink-0 items-center justify-center rounded-md p-0 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary'}>
    {compact ? <MiniAvatar agent={identities[0]} /> : <Avatar agent={identities[0]} size="xs" />}
  </Button>
}

/** Busca no histórico e ações da conversa. A busca usa portal para não ser cortada pela faixa de abas. */
export function ConversationTools({ selected, onOpenComputerUse, onOpenProjectFiles, onOpenMascot, onEditConversation, onSearchHistory, onOpenSearchHit, focusedMessageId, onReturnToLatest, browserMode = false, canReadFiles = true, compact = false }: ConversationChromeProps & { compact?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MessageSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [actionsOpen, setActionsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchPanelId = useId()
  const searchPosition = useAnchoredPosition({ open: searchOpen, anchorRef: searchTriggerRef, panelRef: searchPanelRef, side: 'bottom', align: 'end', gap: 4, margin: 12 })
  useDismissOnOutsidePointer(rootRef, searchOpen, setSearchOpen, searchPanelRef)
  useEffect(() => {
    if (!searchOpen) return
    const focusInput = requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setSearchOpen(false)
      searchTriggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => { cancelAnimationFrame(focusInput); document.removeEventListener('keydown', closeOnEscape, true) }
  }, [searchOpen])
  const submitSearch = async (event: FormEvent) => {
    event.preventDefault()
    if (!onSearchHistory || !query.trim() || searching) return
    setSearching(true)
    try { setHits(await onSearchHistory(query.trim())); setSearched(true); setSearchError('') }
    catch (error) { setSearchError(error instanceof Error ? error.message : 'Não foi possível pesquisar o histórico.') }
    finally { setSearching(false) }
  }
  const showFiles = !browserMode || canReadFiles
  const buttonClass = compact ? 'size-6 rounded-full' : undefined
  const iconClass = compact ? 'size-3.5' : 'size-4'
  const actionItems = [
    { id: 'files', label: 'Arquivos', icon: <FolderOpen /> },
    ...(!browserMode ? [
      { id: 'mascot', label: 'Mascote e voz', icon: <UserRound /> },
      { id: 'browser', label: 'Navegador', icon: <Globe /> },
      { id: 'conversation', label: 'Conversa e equipe', icon: <Settings2 /> },
    ] : []),
  ]
  return <div ref={rootRef} className={'flex shrink-0 items-center justify-end ' + (compact ? 'gap-0' : 'gap-1')}>
    <Button ref={searchTriggerRef} variant="ghost" size="icon" className={buttonClass} aria-label="Buscar no histórico desta conversa" title="Buscar no histórico"
      aria-haspopup="dialog" aria-expanded={searchOpen} aria-controls={searchOpen ? searchPanelId : undefined} onClick={() => setSearchOpen(value => !value)}>
      <Search className={iconClass} />
    </Button>
    {searchOpen && createPortal(<MenuSurface ref={searchPanelRef} id={searchPanelId} role="dialog" aria-label="Busca no histórico"
      className="fixed z-[1100] w-[min(22rem,calc(100vw-2rem))] rounded-lg p-3 shadow-xl"
      style={{ position: 'fixed', zIndex: 1100, ...(searchPosition || { left: -9999, top: -9999, visibility: 'hidden' }) }}>
        <form onSubmit={event => void submitSearch(event)} className="flex gap-2">
          <Input ref={searchInputRef} aria-label="Buscar no histórico desta conversa" value={query} onChange={event => { setQuery(event.target.value); setSearched(false); setSearchError('') }} placeholder="Buscar mensagens…" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-none outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-primary/40" />
          <Button type="submit" size="sm" disabled={searching || !query.trim()}>{searching ? 'Buscando…' : 'Buscar'}</Button>
        </form>
        {searched && hits.length > 0 && <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{hits.map(hit => <Button type="button" variant="ghost" size={null} key={hit.message.id} onClick={() => { onOpenSearchHit?.(hit); setSearchOpen(false) }} className="block h-auto w-full whitespace-normal rounded-sm px-2.5 py-2 text-left font-normal text-inherit hover:bg-accent hover:text-inherit"><span className="block text-xs font-semibold">{hit.message.author} · {new Date(hit.message.createdAt).toLocaleString('pt-BR')}</span><span className="mt-1 block text-xs text-muted-foreground">{hit.snippet}</span></Button>)}</div>}
        {searchError && <p role="alert" className="px-2 py-3 text-xs text-destructive">{searchError}</p>}
        {!searching && searched && hits.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma mensagem encontrada.</p>}
        {focusedMessageId && <Button type="button" variant="link" size={null} onClick={() => { onReturnToLatest?.(); setSearchOpen(false) }} className="mt-2 h-auto w-full justify-start rounded-none border-t border-border p-0 pt-2 text-left text-xs font-normal text-primary hover:underline">Voltar às mensagens recentes</Button>}
      </MenuSurface>, document.body)}
    {showFiles && <Menu open={actionsOpen} onClose={() => setActionsOpen(false)} anchor={<Button variant="ghost" size="icon" className={buttonClass} aria-label="Ações da conversa" title="Ações da conversa"
      aria-haspopup="menu" aria-expanded={actionsOpen} onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setActionsOpen(value => !value) } }} onClick={() => setActionsOpen(value => !value)}><MoreHorizontal className={iconClass} /></Button>}
      items={actionItems} onSelect={id => {
        setActionsOpen(false)
        if (id === 'files') { if (onOpenProjectFiles) onOpenProjectFiles(); else void window.appAPI.openFolder(selected.id) }
        else if (id === 'mascot') onOpenMascot?.()
        else if (id === 'browser') onOpenComputerUse()
        else if (id === 'conversation') onEditConversation()
      }} align="end" portal listClassName="w-56" autoFocus />}
  </div>
}

/** Faixa da conversa quando o chat é a única aba; com outras abas, a própria aba do chat assume este papel. */
export function ChatHeader(props: ConversationChromeProps) {
  const { title, subtitle } = conversationIdentity(props.selected, props.agents, props.assistant)
  return <header data-testid="compact-chat-header" className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4">
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <ConversationAvatar {...props} />
      <div className="flex min-w-0 flex-col justify-center">
        <h1 className="truncate font-display text-[14px] font-semibold leading-5 tracking-[-0.01em]" title={title}>{title}</h1>
        {subtitle && <p className="truncate text-[11.5px] leading-4 text-muted-foreground" title={subtitle}>{subtitle}</p>}
      </div>
    </div>
    <ConversationTools {...props} />
  </header>
}
