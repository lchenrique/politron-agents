import { useEffect, useMemo, useState } from 'react'
import { Archive, CalendarClock, ChevronDown, ChevronRight, Crown, LayoutDashboard, Folder, FolderOpen, FolderPlus, GitBranch, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GroupDialog, type GroupDraft } from './GroupDialog'
import { ProjectGroupSection } from './ProjectGroupSection'
import { buildPaletteItems, useSidebarIndex } from './sidebarIndex'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { AgentPresence, Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'
import { HostSelector } from '../hosts/HostSelector'
import { useProjectGroups } from './projectGroups'

/** Quantas sessoes cada projeto mostra antes de exigir "ver mais". Limita o DOM do sidebar sem esconder o trabalho recente. */
const SESSION_LIMIT = 10

function readSet(key: string): Set<string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { return new Set() }
}

export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onDeleteWorkspace, onDeleteConversation, onDeleteAgent, onSetChief, onNotice, view = null, onOpenHome, attentionCount = 0, browserMode = false, canChat = true }: {
  snapshot: Snapshot
  selected: Conversation | undefined
  activeWorkspaceId?: string | null
  unreadCounts: Record<string, number>
  agentStates: Record<string, 'idle' | 'working' | 'waiting'>
  onSelectConversation: (id: string) => void
  onSelectWorkspace?: (id: string) => void
  onStartConversation: (workspaceId?: string) => void | Promise<void>
  onOpenAgent: (agent: Agent, newConversation?: boolean) => void | Promise<void>
  onOpenEditor: (editor: { kind: EditorKind; initial?: Agent | Conversation | Workspace; workspaceId?: string | null }) => void
  onOpenSettings: () => void
  onDeleteWorkspace: (id: string) => void | Promise<void>
  onDeleteConversation: (id: string) => void | Promise<void>
  onDeleteAgent: (id: string) => void | Promise<void>
  onSetChief: (agent: Agent, chief: boolean) => void | Promise<void>
  onNotice: (value: string) => void
  view?: 'home' | 'routines' | null
  onOpenHome?: (view: 'home' | 'routines') => void
  attentionCount?: number
  browserMode?: boolean
  canChat?: boolean
}) {
  const [section, setSection] = useState<'projects' | 'agents'>(() => { try { return localStorage.getItem('politron.sidebar.section') === 'agents' ? 'agents' : 'projects' } catch { return 'projects' } })
  useEffect(() => { localStorage.setItem('politron.sidebar.section', section) }, [section])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet('politron.sidebar.collapsed-workspaces'))
  const [favorites, setFavorites] = useState<Set<string>>(() => readSet('politron.sidebar.favorites'))
  const [openAgentMenuId, setOpenAgentMenuId] = useState<string | null>(null)
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null)
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null)
  // Projetos com muitas sessoes mostram so as mais recentes; o resto fica sob demanda.
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set())
  const [deleteRequest, setDeleteRequest] = useState<{ kind: 'workspace' | 'conversation' | 'agent'; id: string; title: string; description: string } | null>(null)
  useEffect(() => { localStorage.setItem('politron.sidebar.collapsed-workspaces', JSON.stringify([...collapsed])) }, [collapsed])
  useEffect(() => { localStorage.setItem('politron.sidebar.favorites', JSON.stringify([...favorites])) }, [favorites])
  const { groups, workspaceGroup, collapsedGroups, moveWorkspaceToGroup, addGroup, renameGroup, removeGroup, toggleGroup } = useProjectGroups()
  const [groupDialog, setGroupDialog] = useState<GroupDraft | null>(null)
  const openGroupDialog = (mode: 'create' | 'rename', options: { workspaceId?: string; name?: string } = {}) => setGroupDialog({ mode, value: options.name || '', original: options.name, workspaceId: options.workspaceId })
  const confirmGroupDialog = () => {
    const draft = groupDialog
    setGroupDialog(null)
    if (!draft) return
    const name = draft.value.trim()
    if (!name) return
    if (draft.mode === 'create') {
      if (addGroup(name, draft.workspaceId)) onNotice(`A pasta "${name}" já existia; o projeto foi movido para ela.`)
    } else if (draft.original) renameGroup(draft.original, name)
  }
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const favoriteKey = (type: 'workspace' | 'conversation' | 'agent', id: string) => `${type}:${id}`
  const toggleFavorite = (key: string) => setFavorites(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const isFavorite = (type: 'workspace' | 'conversation' | 'agent', id: string) => favorites.has(favoriteKey(type, id))
  // Indices derivados do snapshot: a barra lateral nao pode varrer o snapshot inteiro por projeto.
  const { workspacesById, agentsById, legacyConversations, rootWorkspaces, childWorkspaces, conversationsOf, needsAttention } = useSidebarIndex(snapshot)
  const workspaceOf = (id: string) => workspacesById.get(id)
  const workspaceNeedsAttention = (workspaceId: string) => conversationsOf(workspaceId).some(conversation => (unreadCounts[conversation.id] || 0) > 0 || needsAttention(conversation.id))
  const archiveWorkspace = async (workspace: Workspace) => {
    const preserve = workspace.changes > 0
    const question = preserve
      ? `Este worktree tem ${workspace.changes} alteração(ões). Arquivar mantendo a pasta e os arquivos no disco?`
      : 'Arquivar e remover este worktree limpo?'
    if (!window.confirm(question)) return
    try { await window.appAPI.archiveWorkspace(workspace.id, preserve) }
    catch (error) {
      const message = errorText(error)
      if (!preserve && message.includes('preservando a pasta') && window.confirm('O worktree recebeu alterações desde a última verificação. Arquivar mantendo a pasta e os arquivos no disco?')) {
        try { await window.appAPI.archiveWorkspace(workspace.id, true) }
        catch (retryError) { onNotice(errorText(retryError)) }
      } else onNotice(message)
    }
  }
  const removeWorkspace = (workspace: Workspace) => {
    const children = childWorkspaces(workspace.id).length
    const conversations = snapshot.conversations.filter(item => !item.archived && item.workspaceId === workspace.id).length
    const preserved = workspace.name === 'Livre' && workspace.kind === 'free' ? conversationsOf(workspace.id).filter(item => item.workspaceId !== workspace.id).length : 0
    const warning = children || conversations
      ? `Excluir "${workspace.name}" também apaga ${conversations} conversa(s) e ${children} worktree(s) vinculado(s). Esta ação não pode ser desfeita.`
      : `Excluir o workspace "${workspace.name}"? Esta ação não pode ser desfeita.`
    setOpenWorkspaceMenuId(null)
    setDeleteRequest({ kind: 'workspace', id: workspace.id, title: `Excluir workspace “${workspace.name}”?`, description: warning + (preserved ? ` As ${preserved} sessão(ões) antigas permanecem preservadas em seus workspaces originais.` : '') })
  }
  const removeConversation = (conversation: Conversation) => { setOpenConversationMenuId(null); setDeleteRequest({ kind: 'conversation', id: conversation.id, title: `Excluir a conversa “${conversation.name}”?`, description: 'Esta ação não pode ser desfeita.' }) }
  const removeAgent = (agent: Agent) => { setOpenAgentMenuId(null); setDeleteRequest({ kind: 'agent', id: agent.id, title: `Excluir o agente ${agent.name}?`, description: 'As conversas continuam, mas perdem este participante.' }) }

  const agentRow = (agent: Agent, pinnedChief = false) => <div
    key={agent.id}
    className={'group flex items-center gap-1 rounded-md transition-colors ' + (pinnedChief ? 'border-l-2 border-amber-500/60 bg-amber-500/[0.035] hover:bg-amber-500/[0.07]' : 'hover:bg-accent/50')}
    onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}
  >
    <button onClick={() => void onOpenAgent(agent)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Avatar agent={agent} size="xs" state={agentStates[agent.id] || 'idle'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold">{agent.name}{agent.temporary && <span className="rounded bg-muted px-1 text-[9px] font-normal text-muted-foreground" title={agent.temporaryStatus === 'working' ? 'Boo temporário em execução' : 'Boo temporário'}>Temp</span>}{pinnedChief && <Crown aria-label="Chief" className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />}</span>
        <span className="truncate text-[10px] text-muted-foreground">{pinnedChief ? 'Chief · Coordenação' : agent.description || '@' + agent.alias}</span>
      </span>
      <AgentPresence state={agentStates[agent.id] || 'idle'} />
      {isFavorite('agent', agent.id) && <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" aria-label="Favorito" />}
    </button>
    <DropdownMenu open={openAgentMenuId === agent.id} onOpenChange={open => setOpenAgentMenuId(open ? agent.id : null)}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 text-muted-foreground opacity-70 hover:opacity-100" aria-label={'Ações de ' + agent.name}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canChat} onSelect={() => void onOpenAgent(agent, true)}><MessageSquarePlus className="mr-2 size-4" />Nova conversa</DropdownMenuItem>
        {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent', initial: agent })}><Pencil className="mr-2 size-4" />Editar perfil</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('agent', agent.id))}><Star className="mr-2 size-4" />{isFavorite('agent', agent.id) ? 'Remover dos favoritos' : 'Favoritar agente'}</DropdownMenuItem>
        {!browserMode && (agent.role === 'chief'
          ? <DropdownMenuItem onSelect={() => void onSetChief(agent, false)}><Crown className="mr-2 size-4" />Remover papel de Chief</DropdownMenuItem>
          : <DropdownMenuItem disabled={snapshot.agents.some(item => item.role === 'chief')} onSelect={() => void onSetChief(agent, true)}><Crown className="mr-2 size-4" />{snapshot.agents.some(item => item.role === 'chief') ? 'Já existe um Chief' : 'Promover a Chief'}</DropdownMenuItem>)}
        {!browserMode && <DropdownMenuItem onSelect={() => removeAgent(agent)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir agente</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  const chiefAgent = useMemo(() => snapshot.agents.find(agent => agent.role === 'chief'), [snapshot.agents])
  const showChief = !!chiefAgent
  const regularAgents = useMemo(() => snapshot.agents.filter(agent => agent.role !== 'chief' && agent.temporaryStatus !== 'retired'), [snapshot.agents])


  const conversationButton = (conversation: Conversation) =>
    <div key={conversation.id} className="group flex items-center gap-1 rounded-md hover:bg-accent/60" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <button onClick={() => onSelectConversation(conversation.id)} className={'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors ' + (conversation.id === selected?.id ? 'bg-sidebar-accent/75 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{conversation.agentIds.length > 1 ? <Users className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={conversation.name}>{conversation.name}</span>
        {isFavorite('conversation', conversation.id) && <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" aria-label="Favorito" />}
        {needsAttention(conversation.id) && <span aria-label="Aguardando aprovação" className="size-2 shrink-0 rounded-full bg-amber-500" />}
        {!!unreadCounts[conversation.id] && <span aria-label={unreadCounts[conversation.id] + ' não lidas'} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{unreadCounts[conversation.id] > 9 ? '9+' : unreadCounts[conversation.id]}</span>}
      </button>
      <DropdownMenu open={openConversationMenuId === conversation.id} onOpenChange={open => setOpenConversationMenuId(open ? conversation.id : null)}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100" aria-label={'Ações da conversa ' + conversation.name}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'conversation', initial: conversation })}><Pencil className="mr-2 size-4" />Renomear ou editar</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('conversation', conversation.id))}><Star className="mr-2 size-4" />{isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão'}</DropdownMenuItem>
          {!browserMode && <DropdownMenuItem onSelect={() => removeConversation(conversation)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir conversa</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

  const workspaceNode = (workspace: Workspace, depth = 0) => {
    const isCollapsed = collapsed.has(workspace.id)
    const allConversations = conversationsOf(workspace.id)
    const showAllSessions = expandedSessions.has(workspace.id)
    const conversations = showAllSessions ? allConversations : allConversations.slice(0, SESSION_LIMIT)
    const hiddenSessions = allConversations.length - conversations.length
    const children = childWorkspaces(workspace.id)
    return <div key={workspace.id} className={depth ? 'ml-4 border-l border-border/40 pl-2' : ''}>
      <div className="group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent/40" onContextMenu={event => { event.preventDefault(); setOpenWorkspaceMenuId(workspace.id) }}>
        <button className="flex size-5 shrink-0 items-center justify-center text-muted-foreground" aria-label={isCollapsed ? `Expandir ${workspace.name}` : `Recolher ${workspace.name}`} onClick={() => toggle(workspace.id)}>{isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button>
        <button onClick={() => onSelectWorkspace?.(workspace.id)} className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-medium ${activeWorkspaceId === workspace.id ? 'bg-accent text-foreground' : ''}`} title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path}>
          {workspace.kind === 'worktree' ? <GitBranch className="size-3.5 shrink-0 text-muted-foreground" /> : workspace.defaultAgentIds.length > 1 ? <Users className="size-3.5 shrink-0 text-muted-foreground" /> : <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{workspace.kind === 'worktree' ? workspace.branch || workspace.name : workspace.name}</span>
          {workspaceNeedsAttention(workspace.id) && <span aria-label="Workspace precisa de atenção" className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
          {workspace.defaultAgentIds.length > 1 && <span className="text-[10px] text-muted-foreground">{workspace.defaultAgentIds.length} bots</span>}
          {workspace.kind === 'worktree' && !!workspace.changes && <span className="text-[10px] text-amber-500">{workspace.changes} alter.</span>}
        </button>
        <Button variant="ghost" size="icon" disabled={!canChat} className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Nova conversa em ${workspace.name}`} title="Nova conversa neste workspace" onClick={() => void onStartConversation(workspace.id)}><Plus className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className={`size-6 shrink-0 ${isFavorite('workspace', workspace.id) ? 'text-amber-500' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`} aria-label={isFavorite('workspace', workspace.id) ? `Remover ${workspace.name} dos favoritos` : `Favoritar ${workspace.name}`} title={isFavorite('workspace', workspace.id) ? 'Remover dos favoritos' : 'Favoritar workspace'} onClick={() => toggleFavorite(favoriteKey('workspace', workspace.id))}><Star className="size-3.5" fill={isFavorite('workspace', workspace.id) ? 'currentColor' : 'none'} /></Button>
        <DropdownMenu open={openWorkspaceMenuId === workspace.id} onOpenChange={open => setOpenWorkspaceMenuId(open ? workspace.id : null)}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações de ${workspace.name}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace', initial: workspace })}><Settings2 className="mr-2 size-4" />Editar workspace</DropdownMenuItem>}
          {!browserMode && workspace.kind !== 'worktree' && workspace.kind !== 'free' && <DropdownMenuItem onSelect={() => { const branch = window.prompt('Nome da branch do novo worktree:'); if (!branch?.trim()) return; void window.appAPI.createWorktree({ sourceWorkspaceId: workspace.id, branch: branch.trim() }).catch(error => onNotice(errorText(error))) }}><GitBranch className="mr-2 size-4" />Novo worktree</DropdownMenuItem>}
          {!browserMode && workspace.kind === 'worktree' && <DropdownMenuItem onSelect={() => void archiveWorkspace(workspace)}><Archive className="mr-2 size-4" />Arquivar worktree</DropdownMenuItem>}
          {!browserMode && <DropdownMenuSub>
            <DropdownMenuSubTrigger><FolderPlus className="mr-2 size-4" />Mover para pasta</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={workspaceGroup[workspace.id] || 'none'} onValueChange={value => moveWorkspaceToGroup(workspace.id, value === 'none' ? null : value)}>
                <DropdownMenuRadioItem value="none">Sem pasta</DropdownMenuRadioItem>
                {groups.map(group => <DropdownMenuRadioItem key={group} value={group}>{group}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openGroupDialog('create', { workspaceId: workspace.id })}>Nova pasta…</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>}
          {!browserMode && <DropdownMenuItem onSelect={() => removeWorkspace(workspace)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir workspace</DropdownMenuItem>}
        </DropdownMenuContent></DropdownMenu>
      </div>
      {!isCollapsed && <div className="ml-6 space-y-0.5">
        {children.map(child => workspaceNode(child, depth + 1))}
        {conversations.map(conversationButton)}
        {!!hiddenSessions && <button type="button" onClick={() => setExpandedSessions(current => new Set(current).add(workspace.id))} className="flex w-full items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent/40 hover:text-foreground">Ver mais {hiddenSessions} sessões</button>}
        {!conversations.length && !children.length && <p className="px-2 py-1 text-[10px] text-muted-foreground">Nenhuma conversa ainda.</p>}
      </div>}
    </div>
  }

  const groupSection = (name: string | null, items: Workspace[], editable = true) => {
    if (!name) return <div className="space-y-0.5">{items.map(workspace => workspaceNode(workspace))}</div>
    return <ProjectGroupSection name={name} items={items} collapsed={collapsedGroups.has(name)} editable={editable} onToggle={() => toggleGroup(name)} onRename={() => openGroupDialog('rename', { name })} onRemove={() => removeGroup(name)} renderWorkspace={workspace => workspaceNode(workspace)} />
  }

  // A paleta fica fechada na maior parte do tempo: construir esses itens a cada render custava um elemento por sessao.
  const paletteItems = useMemo(() => buildPaletteItems(snapshot, { canChat, browserMode }, workspacesById, agentsById), [snapshot, canChat, browserMode, workspacesById, agentsById])
  const openPaletteItem = (item: CommandItem) => {
    const [type, id] = item.id.split(':')
    if (type === 'create') {
      if (id === 'session') void onStartConversation()
      if (id === 'workspace') onOpenEditor({ kind: 'workspace' })
      if (id === 'agent') onOpenEditor({ kind: 'agent' })
    } else if (type === 'workspace') { setSection('projects'); onSelectWorkspace?.(id) }
    else if (type === 'conversation') { setSection('projects'); onSelectConversation(id) }
    else if (type === 'agent') {
      const agent = snapshot.agents.find(agent => agent.id === id)
      if (agent) { setSection('agents'); void onOpenAgent(agent) }
    }
  }
  const visibleAgents = useMemo(() => regularAgents.sort((a, b) =>
    Number(favorites.has(favoriteKey('agent', b.id))) - Number(favorites.has(favoriteKey('agent', a.id))) || a.name.localeCompare(b.name, 'pt-BR')), [regularAgents, favorites])
  // Partition projects by folder in a single pass: filtering per folder cost O(folders * projects).
  const workspacesByGroup = useMemo(() => {
    const map = new Map<string, Workspace[]>()
    const ungrouped: Workspace[] = []
    for (const workspace of rootWorkspaces) {
      const group = workspaceGroup[workspace.id]
      if (!group) { ungrouped.push(workspace); continue }
      const list = map.get(group)
      if (list) list.push(workspace)
      else map.set(group, [workspace])
    }
    return { map, ungrouped }
  }, [rootWorkspaces, workspaceGroup])

  return <aside className="boobot-sidebar flex h-full min-w-0 flex-col border-r border-sidebar-border/75 bg-sidebar text-sidebar-foreground" aria-label="Barra lateral do Boobot">
    <header className="space-y-1.5 border-b border-sidebar-border/65 px-3 pb-3 pt-2">
      <div className="flex h-7 items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-tight">Espaço de trabalho</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7" aria-label="Criar novo"><Plus className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canChat} onSelect={() => void onStartConversation()}><MessageSquarePlus className="mr-2 size-4" />Nova sessão livre</DropdownMenuItem>
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="mr-2 size-4" />Novo projeto</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => openGroupDialog('create')}><Folder className="mr-2 size-4" />Nova pasta de projetos</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent' })}><Users className="mr-2 size-4" />Novo agente</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ActionSearchBar items={paletteItems} onSelect={openPaletteItem} shortcut label="Busca rápida" placeholder="Buscar projetos, agentes, comandos…" className="boobot-sidebar-search !max-w-none" surfaceClassName="!border-sidebar-border/80 !bg-sidebar !shadow-none dark:!border-sidebar-border/80 dark:!bg-sidebar" />
    </header>
    {onOpenHome && <nav aria-label="Trabalho" className="space-y-0.5 border-b border-sidebar-border/65 px-2 py-2">
      <button type="button" aria-current={view === 'home' ? 'page' : undefined} onClick={() => onOpenHome('home')} className={'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ' + (view === 'home' ? 'bg-sidebar-accent/75 text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')}>
        {chiefAgent ? <Avatar agent={chiefAgent} size="xs" state={agentStates[chiefAgent.id] || 'idle'} /> : <LayoutDashboard className="size-4" />}
        <span className="min-w-0 flex-1 truncate">Central {chiefAgent ? `do ${chiefAgent.name}` : 'do Chief'}</span>
        {attentionCount > 0 && <span aria-label={`${attentionCount} pendências`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-white">{attentionCount > 9 ? '9+' : attentionCount}</span>}
      </button>
      {!browserMode && <button type="button" aria-current={view === 'routines' ? 'page' : undefined} onClick={() => onOpenHome('routines')} className={'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ' + (view === 'routines' ? 'bg-sidebar-accent/75 text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')}>
        <span className="flex size-[30px] items-center justify-center"><CalendarClock className="size-4" /></span>
        <span className="min-w-0 flex-1 truncate">Rotinas</span>
        {!!snapshot.routines?.filter(item => item.enabled).length && <span className="text-[10px] tabular-nums text-muted-foreground">{snapshot.routines.filter(item => item.enabled).length}</span>}
      </button>}
    </nav>}
    {!onOpenHome && showChief && chiefAgent && <section aria-label="Chief" className="border-b border-sidebar-border/65 px-3 py-2">{agentRow(chiefAgent, true)}</section>}
    <Tabs value={section} onValueChange={value => setSection(value as 'projects' | 'agents')} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-3 mt-2 grid h-9 grid-cols-2 rounded-none border-b border-sidebar-border/70 bg-transparent p-0">
        <TabsTrigger value="projects" className="h-9 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent text-xs text-muted-foreground shadow-none data-[state=active]:border-sidebar-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><FolderOpen className="size-3.5" />Projetos <span className="text-[10px] opacity-65">{rootWorkspaces.length}</span></TabsTrigger>
        <TabsTrigger value="agents" className="h-9 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent text-xs text-muted-foreground shadow-none data-[state=active]:border-sidebar-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"><Users className="size-3.5" />Agentes <span className="text-[10px] opacity-65">{snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired').length}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto px-2 pb-3 pt-1">
        {!!favorites.size && <section aria-label="Favoritos" className="space-y-0.5">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Favoritos</p>
          {[...favorites].map(key => {
            const [type, id] = key.split(':', 2)
            if (type === 'workspace') {
              const workspace = snapshot.workspaces.find(item => item.id === id && !item.archived)
              return workspace ? <Button key={key} variant="ghost" onClick={() => onSelectWorkspace?.(id)} className="h-8 w-full justify-start gap-2 px-3 text-xs"><FolderOpen className="size-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-left">{workspace.name}</span><Star className="size-3 fill-amber-500 text-amber-500" /></Button> : null
            }
            if (type === 'conversation') {
              const conversation = snapshot.conversations.find(item => item.id === id && !item.archived)
              return conversation ? <Button key={key} variant="ghost" onClick={() => onSelectConversation(id)} className="h-8 w-full justify-start gap-2 px-3 text-xs"><MessageSquarePlus className="size-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-left">{conversation.name}</span><Star className="size-3 fill-amber-500 text-amber-500" /></Button> : null
            }
            return null
          })}
        </section>}
        <section aria-label="Projetos" className="space-y-0.5">
          {!!groups.length && <div className="flex items-center gap-1 px-1 pt-1">
            <p className="flex-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Pastas</p>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Nova pasta de projetos" title="Criar pasta de projetos" onClick={() => openGroupDialog('create')}><FolderPlus className="size-3.5" /></Button>
          </div>}
          {groups.map(group => groupSection(group, workspacesByGroup.map.get(group) || []))}
          {groupSection(groups.length ? 'Outros' : null, workspacesByGroup.ungrouped, false)}
          {!rootWorkspaces.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Crie um projeto pelo botão + para organizar suas sessões.</p>}
          {!!legacyConversations.length && !rootWorkspaces.some(item => item.name === 'Livre' && item.kind === 'free') && <div className="mt-2"><Button variant="ghost" className="h-8 w-full justify-start gap-1.5 px-2 text-xs" onClick={() => toggle('legacy')} aria-label={collapsed.has('legacy') ? 'Expandir sessões antigas' : 'Recolher sessões antigas'}>{collapsed.has('legacy') ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}<FolderOpen className="size-3.5" />Sessões antigas<span className="ml-auto text-[10px]">{legacyConversations.length}</span></Button>{!collapsed.has('legacy') && <div className="ml-5 border-l border-border/50 pl-1">{legacyConversations.map(conversationButton)}</div>}</div>}
        </section>
      </TabsContent>
      <TabsContent value="agents" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto px-2 pb-3 pt-1">
        <section aria-label="Catálogo de agentes" className="space-y-0.5">
          {onOpenHome && chiefAgent && agentRow(chiefAgent, true)}
          {visibleAgents.map(agent => agentRow(agent))}
          {!visibleAgents.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">{chiefAgent ? 'Nenhum outro agente cadastrado. Use o botão + para criar.' : 'Crie um Boo pelo botão + para começar.'}</p>}
        </section>
      </TabsContent>
    </Tabs>
    {!browserMode && <div className="border-t border-sidebar-border/65 px-2 py-1.5"><HostSelector /></div>}
    {!browserMode && <footer className="flex items-center gap-1 px-2 pb-2 pt-0.5">
      <Button variant="ghost" disabled={!selected?.workspaceId} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-2 text-[11px] text-muted-foreground"><FolderOpen className="size-3.5" />Pasta</Button>
      <Button variant="ghost" onClick={onOpenSettings} className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-2 text-[11px] text-muted-foreground"><Settings2 className="size-3.5" />Configurações</Button>
    </footer>}
    <GroupDialog draft={groupDialog} onChange={value => setGroupDialog(current => current ? { ...current, value } : current)} onCancel={() => setGroupDialog(null)} onConfirm={confirmGroupDialog} />
    <Dialog open={!!deleteRequest} onOpenChange={open => { if (!open) setDeleteRequest(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{deleteRequest?.title}</DialogTitle><DialogDescription>{deleteRequest?.description}</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteRequest(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => {
            const request = deleteRequest
            setDeleteRequest(null)
            if (!request) return
            if (request.kind === 'workspace') void onDeleteWorkspace(request.id)
            else if (request.kind === 'conversation') void onDeleteConversation(request.id)
            else void onDeleteAgent(request.id)
          }}>Excluir</Button>
        </div>
      </DialogContent>
    </Dialog>
  </aside>
}
