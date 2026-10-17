import { useEffect, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, Crown, FolderOpen, FolderPlus, GitBranch, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { AgentPresence, Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'

function readSet(key: string): Set<string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { return new Set() }
}
function readBoolean(key: string): boolean { try { return JSON.parse(localStorage.getItem(key) || 'false') === true } catch { return false } }

export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onDeleteWorkspace, onDeleteConversation, onDeleteAgent, onSetChief, onNotice }: {
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
}) {
  const [section, setSection] = useState<'projects' | 'agents'>(() => { try { return localStorage.getItem('politron.sidebar.section') === 'agents' ? 'agents' : 'projects' } catch { return 'projects' } })
  useEffect(() => { localStorage.setItem('politron.sidebar.section', section) }, [section])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet('politron.sidebar.collapsed-workspaces'))
  const [agentsCollapsed, setAgentsCollapsed] = useState(() => readBoolean('politron.sidebar.agents-collapsed'))
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(() => readBoolean('politron.sidebar.workspaces-collapsed'))
  const [favorites, setFavorites] = useState<Set<string>>(() => readSet('politron.sidebar.favorites'))
  const [openAgentMenuId, setOpenAgentMenuId] = useState<string | null>(null)
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null)
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null)
  useEffect(() => { localStorage.setItem('politron.sidebar.collapsed-workspaces', JSON.stringify([...collapsed])) }, [collapsed])
  useEffect(() => { localStorage.setItem('politron.sidebar.agents-collapsed', JSON.stringify(agentsCollapsed)) }, [agentsCollapsed])
  useEffect(() => { localStorage.setItem('politron.sidebar.workspaces-collapsed', JSON.stringify(workspacesCollapsed)) }, [workspacesCollapsed])
  useEffect(() => { localStorage.setItem('politron.sidebar.favorites', JSON.stringify([...favorites])) }, [favorites])
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const favoriteKey = (type: 'workspace' | 'conversation' | 'agent', id: string) => `${type}:${id}`
  const toggleFavorite = (key: string) => setFavorites(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const isFavorite = (type: 'workspace' | 'conversation' | 'agent', id: string) => favorites.has(favoriteKey(type, id))
  const workspaceOf = (id: string) => snapshot.workspaces.find(item => item.id === id)
  const named = (workspace: Workspace | undefined) => !!workspace?.name
  const conversationsOf = (workspaceId: string) => snapshot.conversations.filter(item => !item.archived && (item.workspaceId === workspaceId || (workspaceOf(workspaceId)?.name === 'Livre' && workspaceOf(workspaceId)?.kind === 'free' && !named(workspaceOf(item.workspaceId))))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // Sessões legadas conservam os diretórios originais, mas não aparecem soltas.
  const legacyConversations = snapshot.conversations.filter(item => !item.archived && !named(workspaceOf(item.workspaceId)))
  const rootWorkspaces = snapshot.workspaces.filter(item => !item.archived && !item.parentWorkspaceId && item.name).sort((a, b) => Number(b.name === 'Livre' && b.kind === 'free') - Number(a.name === 'Livre' && a.kind === 'free') || a.name.localeCompare(b.name, 'pt-BR'))
  const childWorkspaces = (id: string) => snapshot.workspaces.filter(item => !item.archived && item.parentWorkspaceId === id)
  const needsAttention = (conversationId: string) => snapshot.approvals.some(approval => approval.conversationId === conversationId && approval.status === 'pending')
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
    if (window.confirm(warning + (preserved ? ` As ${preserved} sessão(ões) antigas permanecem preservadas em seus workspaces originais.` : ''))) void onDeleteWorkspace(workspace.id)
  }
  const removeConversation = (conversation: Conversation) => { if (window.confirm(`Excluir a conversa "${conversation.name}"? Esta ação não pode ser desfeita.`)) void onDeleteConversation(conversation.id) }
  const removeAgent = (agent: Agent) => { if (window.confirm(`Excluir o agente ${agent.name}? As conversas continuam, mas perdem este participante.`)) void onDeleteAgent(agent.id) }

  const agentRow = (agent: Agent, pinnedChief = false) => <div
    key={agent.id}
    className={'group flex items-center gap-1 rounded-lg transition-colors ' + (pinnedChief ? 'border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-accent/50')}
    onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}
  >
    <button onClick={() => void onOpenAgent(agent)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Avatar agent={agent} state={agentStates[agent.id] || 'idle'} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1 truncate text-xs font-semibold">{agent.name}{pinnedChief && <Crown aria-label="Chief" className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />}</span>
        <span className="truncate text-[10px] text-muted-foreground">{pinnedChief ? 'Chief · Coordena a equipe' : agent.description || '@' + agent.alias}</span>
      </span>
      <AgentPresence state={agentStates[agent.id] || 'idle'} />
      {isFavorite('agent', agent.id) && <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" aria-label="Favorito" />}
    </button>
    <DropdownMenu open={openAgentMenuId === agent.id} onOpenChange={open => setOpenAgentMenuId(open ? agent.id : null)}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-7 shrink-0 text-muted-foreground opacity-70 hover:opacity-100" aria-label={'Ações de ' + agent.name}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void onOpenAgent(agent, true)}><MessageSquarePlus className="mr-2 size-4" />Nova conversa</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent', initial: agent })}><Pencil className="mr-2 size-4" />Editar perfil</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('agent', agent.id))}><Star className="mr-2 size-4" />{isFavorite('agent', agent.id) ? 'Remover dos favoritos' : 'Favoritar agente'}</DropdownMenuItem>
        {agent.role === 'chief'
          ? <DropdownMenuItem onSelect={() => void onSetChief(agent, false)}><Crown className="mr-2 size-4" />Remover papel de Chief</DropdownMenuItem>
          : <DropdownMenuItem disabled={snapshot.agents.some(item => item.role === 'chief')} onSelect={() => void onSetChief(agent, true)}><Crown className="mr-2 size-4" />{snapshot.agents.some(item => item.role === 'chief') ? 'Já existe um Chief' : 'Promover a Chief'}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => removeAgent(agent)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir agente</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  const chiefAgent = snapshot.agents.find(agent => agent.role === 'chief')
  const showChief = !!chiefAgent
  const regularAgents = snapshot.agents.filter(agent => agent.role !== 'chief')


  const conversationButton = (conversation: Conversation) =>
    <div key={conversation.id} className="group flex items-center gap-1 rounded-md hover:bg-accent/60" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <button onClick={() => onSelectConversation(conversation.id)} className={'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors ' + (conversation.id === selected?.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}>
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{conversation.agentIds.length > 1 ? <Users className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={conversation.name}>{conversation.name}</span>
        {isFavorite('conversation', conversation.id) && <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" aria-label="Favorito" />}
        {needsAttention(conversation.id) && <span aria-label="Aguardando aprovação" className="size-2 shrink-0 rounded-full bg-amber-500" />}
        {!!unreadCounts[conversation.id] && <span aria-label={unreadCounts[conversation.id] + ' não lidas'} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{unreadCounts[conversation.id] > 9 ? '9+' : unreadCounts[conversation.id]}</span>}
      </button>
      <DropdownMenu open={openConversationMenuId === conversation.id} onOpenChange={open => setOpenConversationMenuId(open ? conversation.id : null)}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100" aria-label={'Ações da conversa ' + conversation.name}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'conversation', initial: conversation })}><Pencil className="mr-2 size-4" />Renomear ou editar</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('conversation', conversation.id))}><Star className="mr-2 size-4" />{isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão'}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => removeConversation(conversation)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir conversa</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

  const workspaceNode = (workspace: Workspace, depth = 0): JSX.Element => {
    const isCollapsed = collapsed.has(workspace.id)
    const conversations = conversationsOf(workspace.id)
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
        <Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Nova conversa em ${workspace.name}`} title="Nova conversa neste workspace" onClick={() => void onStartConversation(workspace.id)}><Plus className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className={`size-6 shrink-0 ${isFavorite('workspace', workspace.id) ? 'text-amber-500' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`} aria-label={isFavorite('workspace', workspace.id) ? `Remover ${workspace.name} dos favoritos` : `Favoritar ${workspace.name}`} title={isFavorite('workspace', workspace.id) ? 'Remover dos favoritos' : 'Favoritar workspace'} onClick={() => toggleFavorite(favoriteKey('workspace', workspace.id))}><Star className="size-3.5" fill={isFavorite('workspace', workspace.id) ? 'currentColor' : 'none'} /></Button>
        <DropdownMenu open={openWorkspaceMenuId === workspace.id} onOpenChange={open => setOpenWorkspaceMenuId(open ? workspace.id : null)}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações de ${workspace.name}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace', initial: workspace })}><Settings2 className="mr-2 size-4" />Editar workspace</DropdownMenuItem>
          {workspace.kind !== 'worktree' && workspace.kind !== 'free' && <DropdownMenuItem onSelect={() => { const branch = window.prompt('Nome da branch do novo worktree:'); if (!branch?.trim()) return; void window.appAPI.createWorktree({ sourceWorkspaceId: workspace.id, branch: branch.trim() }).catch(error => onNotice(errorText(error))) }}><GitBranch className="mr-2 size-4" />Novo worktree</DropdownMenuItem>}
          {workspace.kind === 'worktree' && <DropdownMenuItem onSelect={() => void archiveWorkspace(workspace)}><Archive className="mr-2 size-4" />Arquivar worktree</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => removeWorkspace(workspace)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir workspace</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>
      {!isCollapsed && <div className="ml-6 space-y-0.5">
        {children.map(child => workspaceNode(child, depth + 1))}
        {conversations.map(conversationButton)}
        {!conversations.length && !children.length && <p className="px-2 py-1 text-[10px] text-muted-foreground">Nenhuma conversa ainda.</p>}
      </div>}
    </div>
  }


  const paletteItems: CommandItem[] = [
    { id: 'create:session', group: 'Criar', label: 'Nova sessão livre', icon: <MessageSquarePlus className="size-4" />, keywords: ['conversa', 'chat', 'livre'] },
    { id: 'create:workspace', group: 'Criar', label: 'Novo projeto', icon: <FolderPlus className="size-4" />, keywords: ['pasta', 'workspace'] },
    { id: 'create:agent', group: 'Criar', label: 'Novo agente', icon: <Plus className="size-4" />, keywords: ['poli', 'pits', 'bot'] },
    ...snapshot.workspaces.filter(workspace => workspace.name && !workspace.archived).map(workspace => ({
      id: 'workspace:' + workspace.id, group: 'Projetos', label: workspace.name,
      keywords: [workspace.path, workspace.branch || '', 'workspace', 'projeto'],
      icon: <FolderOpen className="size-4" />
    })),
    ...snapshot.conversations.filter(conversation => !conversation.archived).map(conversation => ({
      id: 'conversation:' + conversation.id, group: 'Sessões', label: conversation.name,
      keywords: [workspaceOf(conversation.workspaceId)?.name || '', ...conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)?.name || ''), 'conversa'],
      icon: <MessageSquarePlus className="size-4" />
    })),
    ...snapshot.agents.map(agent => ({
      id: 'agent:' + agent.id, group: 'Agentes', label: agent.name,
      keywords: [agent.alias, agent.description, agent.role === 'chief' ? 'chief' : 'poli'],
      icon: <Users className="size-4" />
    }))
  ]
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
  const visibleAgents = regularAgents.sort((a, b) =>
    Number(isFavorite('agent', b.id)) - Number(isFavorite('agent', a.id)) || a.name.localeCompare(b.name, 'pt-BR'))

  return <aside className="flex w-[296px] shrink-0 flex-col border-r border-border/60 bg-card/35" aria-label="Barra lateral do Politron">
    <header className="space-y-2.5 border-b border-border/40 px-3 pb-3 pt-3">
      <div className="flex items-center justify-between px-1">
        <div><h2 className="text-sm font-semibold tracking-tight">Espaço de trabalho</h2><p className="text-[10px] text-muted-foreground">Projetos, sessões e seus Polis</p></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Criar novo"><Plus className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void onStartConversation()}><MessageSquarePlus className="mr-2 size-4" />Nova sessão livre</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="mr-2 size-4" />Novo projeto</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent' })}><Users className="mr-2 size-4" />Novo agente</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button variant="outline" className="h-9 w-full justify-start gap-2 border-border/60 bg-background/60 text-xs" onClick={() => void onStartConversation()}><MessageSquarePlus className="size-4" />Nova sessão livre<Plus className="ml-auto size-3.5 text-muted-foreground" /></Button>
      <ActionSearchBar items={paletteItems} onSelect={openPaletteItem} shortcut label="Busca rápida" placeholder="Buscar ou executar… Ctrl K" className="!max-w-none" />
    </header>
    {showChief && chiefAgent && <section aria-label="Chief" className="border-b border-border/40 px-2 py-2"><div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.12em] text-amber-600"><Crown className="size-3.5 fill-amber-500/20" /> Chief · Coordenação</div>{agentRow(chiefAgent, true)}</section>}
    <Tabs value={section} onValueChange={value => setSection(value as 'projects' | 'agents')} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-3 mt-3 grid h-9 grid-cols-2">
        <TabsTrigger value="projects" className="gap-1.5 text-xs"><FolderOpen className="size-3.5" />Projetos <span className="text-[10px] opacity-65">{rootWorkspaces.length}</span></TabsTrigger>
        <TabsTrigger value="agents" className="gap-1.5 text-xs"><Users className="size-3.5" />Agentes <span className="text-[10px] opacity-65">{regularAgents.length}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="mt-0 min-h-0 flex-1 space-y-3 overflow-auto px-2 pb-4 pt-2">
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
        <section aria-label="Projetos" className="space-y-1">
          <div className="flex items-center justify-between px-2">
            <Button type="button" variant="ghost" size="sm" aria-label={workspacesCollapsed ? 'Expandir workspaces' : 'Recolher workspaces'} onClick={() => setWorkspacesCollapsed(value => !value)} className="h-7 gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">
              {workspacesCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}Workspaces
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Novo workspace" title="Novo projeto" onClick={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="size-4" /></Button>
          </div>
          <div hidden={workspacesCollapsed} className="space-y-0.5">
            {rootWorkspaces.map(workspace => workspaceNode(workspace))}
            {!rootWorkspaces.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Crie um projeto para organizar sua equipe e seus históricos.</p>}
            {!!legacyConversations.length && !rootWorkspaces.some(item => item.name === 'Livre' && item.kind === 'free') && <div className="mt-2"><Button variant="ghost" className="h-8 w-full justify-start gap-1.5 px-2 text-xs" onClick={() => toggle('legacy')} aria-label={collapsed.has('legacy') ? 'Expandir sessões antigas' : 'Recolher sessões antigas'}>{collapsed.has('legacy') ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}<FolderOpen className="size-3.5" />Sessões antigas<span className="ml-auto text-[10px]">{legacyConversations.length}</span></Button>{!collapsed.has('legacy') && <div className="ml-5 border-l border-border/50 pl-1">{legacyConversations.map(conversationButton)}</div>}</div>}
          </div>
        </section>
      </TabsContent>
      <TabsContent value="agents" className="mt-0 min-h-0 flex-1 space-y-3 overflow-auto px-2 pb-4 pt-2">
        <section aria-label="Catálogo de agentes">
          <div className="mb-2 flex items-center justify-between px-2">
            <Button variant="ghost" size="sm" type="button" className="h-7 gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground" aria-label={agentsCollapsed ? 'Expandir agentes' : 'Recolher agentes'} onClick={() => setAgentsCollapsed(value => !value)}>
              {agentsCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}Meus Polis <span className="opacity-65">{visibleAgents.length}</span>
            </Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Criar agente" title="Adicionar Poli" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus className="size-4" /></Button>
          </div>
          <div hidden={agentsCollapsed} className="space-y-1">
            {visibleAgents.map(agent => agentRow(agent))}
            {!visibleAgents.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Adicione um Poli para conversar ou montar uma equipe.</p>}
          </div>
        </section>
        {regularAgents.length > 0 && <p className="px-3 text-[10px] leading-4 text-muted-foreground">Clique para conversar. Use o menu ⋯ para editar, favoritar ou promover a Chief.</p>}
      </TabsContent>
    </Tabs>
    <footer className="border-t border-border/60 px-3 py-2">
      <Button variant="ghost" disabled={!selected?.workspaceId} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} className="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"><FolderOpen className="size-3.5" />Abrir pasta da conversa</Button>
      <Button variant="ghost" onClick={onOpenSettings} className="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"><Settings2 className="size-3.5" />Configurações</Button>
    </footer>
  </aside>
}