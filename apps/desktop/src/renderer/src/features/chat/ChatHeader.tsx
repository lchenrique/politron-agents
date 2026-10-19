import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FolderOpen, Globe, MoreHorizontal, Search, Settings2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, MessageSearchHit, Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { assistantPlaceholder } from '../app/appShellShared'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function ChatHeader({ selected, agents, onOpenComputerUse, onOpenProjectFiles, onOpenMascot, onEditConversation, onSearchHistory, onOpenSearchHit, focusedMessageId, onReturnToLatest, assistant, onOpenAgent }: {
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
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MessageSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!searchOpen) return
    const onPointerDown = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSearchOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown) }
  }, [searchOpen])
  const submitSearch = async (event: FormEvent) => {
    event.preventDefault()
    if (!onSearchHistory || !query.trim() || searching) return
    setSearching(true)
    try { setHits(await onSearchHistory(query.trim())); setSearched(true); setSearchError('') }
    catch (error) { setSearchError(error instanceof Error ? error.message : 'Não foi possível pesquisar o histórico.') }
    finally { setSearching(false) }
  }
  const participants = selected.agentIds.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent)
  const identities = participants.length ? participants : [assistant || assistantPlaceholder]
  const isGroup = selected.kind === 'group' || identities.length > 1
  const conversationTitle = isGroup ? selected.name : identities[0].name
  const conversationSubtitle = isGroup
    ? `${identities.length} ${identities.length === 1 ? 'participante' : 'participantes'}`
    : selected.name !== conversationTitle ? selected.name : undefined
  return <header data-testid="compact-chat-header" className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/40 px-3 sm:px-5">
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {isGroup
        ? <button type="button" aria-label="Ver participantes do grupo" title={identities.map(agent => agent.name).join(', ')} onClick={onEditConversation}
            className="relative flex h-10 w-12 shrink-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {identities.slice(0, 3).map((agent, index) =>
              <span key={agent.id} className="absolute top-1 overflow-hidden rounded-full ring-2 ring-background" style={{ left: index * 9, zIndex: 3 - index }}>
                <Avatar agent={agent} size="xs" />
              </span>)}
            {identities.length > 3 && <span className="absolute -bottom-0.5 right-0 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[9px] font-medium ring-1 ring-background">+{identities.length - 3}</span>}
          </button>
        : <button type="button" aria-label={`Ver detalhes de ${identities[0].name}`} title={identities[0].name}
            onClick={() => onOpenAgent?.(identities[0])} className="flex size-10 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary">
            <Avatar agent={identities[0]} size="xs" />
          </button>}
      <div className="flex min-w-0 flex-col justify-center">
        <h1 className="truncate text-sm font-semibold leading-5" title={conversationTitle}>{conversationTitle}</h1>
        {conversationSubtitle && <p className="truncate text-[11px] leading-4 text-muted-foreground" title={conversationSubtitle}>{conversationSubtitle}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center justify-end gap-1">
      <div ref={searchRef} className="relative">
        <Button variant="ghost" size="icon" aria-label="Buscar no histórico desta conversa" title="Buscar no histórico" aria-expanded={searchOpen} onClick={() => setSearchOpen(open => !open)}><Search className="size-4" /></Button>
        {searchOpen && <section aria-label="Busca no histórico" className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
          <form onSubmit={event => void submitSearch(event)} className="flex gap-2">
            <input autoFocus aria-label="Buscar no histórico desta conversa" value={query} onChange={event => { setQuery(event.target.value); setSearched(false); setSearchError('') }} placeholder="Buscar mensagens…" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            <Button type="submit" size="sm" disabled={searching || !query.trim()}>{searching ? 'Buscando…' : 'Buscar'}</Button>
          </form>
          {searched && hits.length > 0 && <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{hits.map(hit => <button type="button" key={hit.message.id} onClick={() => { onOpenSearchHit?.(hit); setSearchOpen(false) }} className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-accent"><span className="block text-xs font-semibold">{hit.message.author} · {new Date(hit.message.createdAt).toLocaleString('pt-BR')}</span><span className="mt-1 block text-xs text-muted-foreground">{hit.snippet}</span></button>)}</div>}
          {searchError && <p role="alert" className="px-2 py-3 text-xs text-destructive">{searchError}</p>}
          {!searching && searched && hits.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma mensagem encontrada.</p>}
          {focusedMessageId && <button type="button" onClick={() => { onReturnToLatest?.(); setSearchOpen(false) }} className="mt-2 w-full border-t border-border pt-2 text-left text-xs text-primary hover:underline">Voltar às mensagens recentes</button>}
        </section>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Ações da conversa"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => { if (onOpenProjectFiles) onOpenProjectFiles(); else void window.appAPI.openFolder(selected.id) }}><FolderOpen />Arquivos</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenMascot}><UserRound />Mascote e voz</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenComputerUse}><Globe />Navegador</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEditConversation}><Settings2 />Conversa e equipe</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
}
