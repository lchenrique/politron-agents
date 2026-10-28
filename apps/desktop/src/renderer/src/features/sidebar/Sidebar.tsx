import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, CalendarClock, ChevronDown, ChevronRight, CirclePlus, Crown, LayoutDashboard, Folder, FolderOpen, FolderPlus, GitBranch, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GroupDialog, type GroupDraft } from './GroupDialog'
import { ProjectGroupSection } from './ProjectGroupSection'
import { useSidebarIndex } from './sidebarIndex'
import { WorkspaceSearch } from './WorkspaceSearch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { AgentPresence, Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'
import { HostSelector } from '../hosts/HostSelector'
import { useProjectGroups } from './projectGroups'

/** Quantas sessoes o projeto aberto mostra antes de exigir "ver mais". Limita o DOM do sidebar sem esconder o trabalho recente. */
const SESSION_LIMIT = 10
const TAB_LIST = 'ds-segmented mx-2.5 flex h-auto rounded-[calc(var(--radius)+1px)] bg-[var(--segmented-track)] p-0.5'
const TAB_TRIGGER = 'h-[26px] flex-1 rounded-[calc(var(--radius)-1px)] px-2.5 py-0 text-xs text-muted-foreground shadow-none ring-offset-0 hover:text-foreground focus-visible:ring-offset-0 data-[state=active]:bg-[var(--segmented-thumb)] data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-xs),0_0_0_1px_var(--border)]'

function readSet(key: string): Set<string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { return new Set() }
}

export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onDeleteWorkspace, onDeleteConversation, onDeleteAgent, onSetChief, onNotice, view = null, onOpenHome, section: controlledSection, onSectionChange, attentionCount = 0, browserMode = false, canChat = true }: {
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
  section?: 'projects' | 'agents'
  onSectionChange?: (section: 'projects' | 'agents') => void
  attentionCount?: number
  browserMode?: boolean
  canChat?: boolean
}) {
  const [storedSection, setStoredSection] = useState<'projects' | 'agents'>(() => { try { return localStorage.getItem('politron.sidebar.section') === 'agents' ? 'agents' : 'projects' } catch { return 'projects' } })
  const section = controlledSection ?? storedSection
  const setSection = onSectionChange ?? setStoredSection
  useEffect(() => { localStorage.setItem('politron.sidebar.section', section) }, [section])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet('politron.sidebar.collapsed-workspaces'))
  // Projeto aberto na parte de baixo da barra; null mostra a lista de projetos.
  const [enteredId, setEnteredId] = useState<string | null>(() => { try { return localStorage.getItem('politron.sidebar.project') } catch { return null } })
  useEffect(() => { try { if (enteredId) localStorage.setItem('politron.sidebar.project', enteredId); else localStorage.removeItem('politron.sidebar.project') } catch { /* preferência opcional */ } }, [enteredId])
  const [projectTab, setProjectTab] = useState<'sessions' | 'team'>('sessions')
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
  const enteredProject = enteredId ? workspacesById.get(enteredId) : undefined
  // Projeto apagado ou arquivado volta para a lista. O id fica guardado: no início o snapshot ainda chega vazio.
  const project = enteredProject && !enteredProject.archived && enteredProject.name ? enteredProject : undefined
  const enterProject = (id: string | null) => { setEnteredId(id); setProjectTab('sessions') }
  // Abrir uma conversa ou projeto por fora (central, busca, links, notificações) leva a barra para o projeto dele.
  // A primeira conversa vista é a restaurada na inicialização: não sobrepõe o projeto lembrado.
  const navigationTarget = activeWorkspaceId || (selected && (workspacesById.get(selected.workspaceId)?.name ? selected.workspaceId : rootWorkspaces.find(item => item.name === 'Livre' && item.kind === 'free')?.id)) || null
  const navigationKey = activeWorkspaceId ? 'workspace:' + activeWorkspaceId : selected ? 'conversation:' + selected.id : ''
  const firstNavigation = useRef(true)
  useEffect(() => {
    if (!navigationKey) return
    const first = firstNavigation.current
    firstNavigation.current = false
    if (first && !activeWorkspaceId) return
    if (navigationTarget) enterProject(navigationTarget)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à navegação, não a cada snapshot
  }, [navigationKey])
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
      : `Excluir o projeto "${workspace.name}"? Esta ação não pode ser desfeita.`
    setOpenWorkspaceMenuId(null)
    setDeleteRequest({ kind: 'workspace', id: workspace.id, title: `Excluir projeto “${workspace.name}”?`, description: warning + (preserved ? ` As ${preserved} sessão(ões) antigas permanecem preservadas em seus workspaces originais.` : '') })
  }
  const removeConversation = (conversation: Conversation) => { setOpenConversationMenuId(null); setDeleteRequest({ kind: 'conversation', id: conversation.id, title: `Excluir a conversa “${conversation.name}”?`, description: 'Esta ação não pode ser desfeita.' }) }
  const removeAgent = (agent: Agent) => { setOpenAgentMenuId(null); setDeleteRequest({ kind: 'agent', id: agent.id, title: `Excluir o agente ${agent.name}?`, description: 'As conversas continuam, mas perdem este participante.' }) }

  const agentRow = (agent: Agent, pinnedChief = false) => <div
    key={agent.id}
    className={'ds-nav-item group flex items-center gap-1 ' + (pinnedChief ? 'bg-warning-soft/60' : '')}
    onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}
  >
    <Button variant="ghost" size={null} onClick={() => void onOpenAgent(agent)} className="flex h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal rounded-md px-2 py-1 text-left font-normal text-inherit hover:bg-transparent hover:text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Avatar agent={agent} size="xs" state={agentStates[agent.id] || 'idle'} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold">{agent.name}{agent.temporary && <span className="rounded bg-muted px-1 text-[9px] font-normal text-muted-foreground" title={agent.temporaryStatus === 'working' ? 'Boo temporário em execução' : 'Boo temporário'}>Temp</span>}{pinnedChief && <Crown aria-label="Chief" className="size-3.5 shrink-0 fill-warning/20 text-warning" />}</span>
        <span className="truncate text-[10px] text-muted-foreground">{pinnedChief ? 'Chief · Coordenação' : agent.description || '@' + agent.alias}</span>
      </span>
      <AgentPresence state={agentStates[agent.id] || 'idle'} />
      {isFavorite('agent', agent.id) && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
    </Button>
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
    <div key={conversation.id} data-active={conversation.id === selected?.id} className="ds-nav-item group flex items-center gap-1" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <Button variant="ghost" size={null} onClick={() => onSelectConversation(conversation.id)} aria-current={conversation.id === selected?.id ? 'page' : undefined} className="flex h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-md px-1.5 text-left font-normal text-inherit hover:bg-transparent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:ring-0">
        <span className="flex size-5 shrink-0 items-center justify-center text-faint-foreground">{conversation.agentIds.length > 1 ? <Users className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate text-[12px]" title={conversation.name}>{conversation.name}</span>
        {isFavorite('conversation', conversation.id) && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
        {needsAttention(conversation.id) && <span aria-label="Aguardando aprovação" className="size-2 shrink-0 rounded-full bg-warning" />}
        {!!unreadCounts[conversation.id] && <span aria-label={unreadCounts[conversation.id] + ' não lidas'} className="ds-count" data-tone="primary">{unreadCounts[conversation.id] > 9 ? '9+' : unreadCounts[conversation.id]}</span>}
      </Button>
      <DropdownMenu open={openConversationMenuId === conversation.id} onOpenChange={open => setOpenConversationMenuId(open ? conversation.id : null)}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100" aria-label={'Ações da conversa ' + conversation.name}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'conversation', initial: conversation })}><Pencil className="mr-2 size-4" />Renomear ou editar</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('conversation', conversation.id))}><Star className="mr-2 size-4" />{isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão'}</DropdownMenuItem>
          {!browserMode && <DropdownMenuItem onSelect={() => removeConversation(conversation)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir conversa</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

  const workspaceMenu = (workspace: Workspace, triggerClassName: string) =>
    <DropdownMenu open={openWorkspaceMenuId === workspace.id} onOpenChange={open => setOpenWorkspaceMenuId(open ? workspace.id : null)}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={'size-6 shrink-0 ' + triggerClassName} aria-label={`Ações de ${workspace.name}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      <DropdownMenuItem disabled={!canChat} onSelect={() => void onStartConversation(workspace.id)}><Plus className="mr-2 size-4" />Nova conversa</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('workspace', workspace.id))}><Star className="mr-2 size-4" />{isFavorite('workspace', workspace.id) ? 'Remover dos favoritos' : 'Favoritar projeto'}</DropdownMenuItem>
      {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace', initial: workspace })}><Settings2 className="mr-2 size-4" />Editar projeto</DropdownMenuItem>}
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
      {!browserMode && <DropdownMenuItem onSelect={() => removeWorkspace(workspace)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir projeto</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu>

  const workspaceLabel = (workspace: Workspace) => workspace.kind === 'worktree' ? workspace.branch || workspace.name : workspace.name

  /** Uma linha por projeto: clicar entra no projeto, sem renderizar as sessões dele. */
  const projectRow = (workspace: Workspace) => {
    const sessions = conversationsOf(workspace.id).length
    return <div key={workspace.id} className="ds-nav-item group flex items-center gap-0.5 px-0.5" onContextMenu={event => { event.preventDefault(); setOpenWorkspaceMenuId(workspace.id) }}>
      <Button variant="ghost" size={null} onClick={() => enterProject(workspace.id)} className="flex h-7 min-w-0 flex-1 justify-start gap-1.5 rounded px-1.5 text-left text-[12.5px] font-medium text-foreground/90 hover:bg-transparent hover:text-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:ring-0" title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path}>
        {workspace.kind === 'worktree' ? <GitBranch className="size-3.5 shrink-0 text-muted-foreground" /> : <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate">{workspaceLabel(workspace)}</span>
        {isFavorite('workspace', workspace.id) && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
        {workspaceNeedsAttention(workspace.id) && <span aria-label="Workspace precisa de atenção" className="size-1.5 shrink-0 rounded-full bg-warning" />}
        {workspace.kind === 'worktree' && !!workspace.changes && <span className="text-[10px] font-normal text-warning">{workspace.changes} alter.</span>}
        <span className="text-[10px] font-normal tabular-nums text-faint-foreground" title={`${sessions} sessões`}>{sessions}</span>
      </Button>
      {workspaceMenu(workspace, 'mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100')}
    </div>
  }

  /** Projeto aberto: cabeçalho com voltar e abas Projeto/Boos. Só a aba ativa é montada (Radix desmonta a inativa). */
  const projectView = (workspace: Workspace) => {
    const allConversations = conversationsOf(workspace.id)
    const showAllSessions = expandedSessions.has(workspace.id)
    const conversations = showAllSessions ? allConversations : allConversations.slice(0, SESSION_LIMIT)
    const hiddenSessions = allConversations.length - conversations.length
    const children = childWorkspaces(workspace.id)
    // Time: equipe padrão do projeto mais quem participa das conversas dele, como na elegibilidade de delegação.
    const team = new Set(workspace.defaultAgentIds)
    if (projectTab === 'team') for (const conversation of allConversations) for (const id of conversation.agentIds) team.add(id)
    const teamAgents = [...team].map(id => agentsById.get(id)).filter((agent): agent is Agent => !!agent && agent.temporaryStatus !== 'retired')
    return <Tabs value={projectTab} onValueChange={value => setProjectTab(value as 'sessions' | 'team')} className="flex min-h-0 flex-1 flex-col">
      <div className="mx-2.5 mt-2 flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Voltar aos projetos" title="Voltar aos projetos" onClick={() => enterProject(null)}><ArrowLeft className="size-4" /></Button>
        <Button variant="ghost" size={null} onClick={() => onSelectWorkspace?.(workspace.id)} aria-current={activeWorkspaceId === workspace.id ? 'page' : undefined} title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path} className="flex h-7 min-w-0 flex-1 justify-start gap-1.5 rounded px-1.5 text-left text-[13px] font-semibold">
          <span className="min-w-0 flex-1 truncate">{workspaceLabel(workspace)}</span>
          {isFavorite('workspace', workspace.id) && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
        </Button>
        {workspaceMenu(workspace, '')}
      </div>
      <TabsList className={TAB_LIST + ' mt-1.5'}>
        <TabsTrigger value="sessions" className={TAB_TRIGGER}>Projeto</TabsTrigger>
        <TabsTrigger value="team" className={TAB_TRIGGER}>Boos</TabsTrigger>
      </TabsList>
      <TabsContent value="sessions" className="mt-0 min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3 pt-1">
        <Button variant="ghost" size={null} disabled={!canChat} onClick={() => void onStartConversation(workspace.id)} className="flex h-7 w-full justify-start gap-1.5 rounded-md px-1.5 text-[12px] font-normal text-muted-foreground hover:text-foreground"><Plus className="size-3.5" />Nova sessão no projeto</Button>
        {children.map(projectRow)}
        {conversations.map(conversationButton)}
        {!!hiddenSessions && <Button type="button" variant="ghost" size={null} onClick={() => setExpandedSessions(current => new Set(current).add(workspace.id))} className="flex h-auto w-full justify-start gap-1 rounded px-2 py-1 text-[10px] font-normal text-muted-foreground hover:bg-accent/40 hover:text-foreground">Ver mais {hiddenSessions} sessões</Button>}
        {!conversations.length && !children.length && <p className="px-2 py-1 text-[10px] text-muted-foreground">Nenhuma conversa ainda.</p>}
      </TabsContent>
      <TabsContent value="team" className="mt-0 min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3 pt-1">
        {teamAgents.map(agent => agentRow(agent, agent.role === 'chief'))}
        {!teamAgents.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Este projeto ainda não tem time.</p>}
      </TabsContent>
    </Tabs>
  }

  const groupSection = (name: string | null, items: Workspace[], editable = true) => {
    if (!name) return <div className="space-y-0.5">{items.map(projectRow)}</div>
    return <ProjectGroupSection key={name} name={name} items={items} collapsed={collapsedGroups.has(name)} editable={editable} onToggle={() => toggleGroup(name)} onRename={() => openGroupDialog('rename', { name })} onRemove={() => removeGroup(name)} renderWorkspace={projectRow} />
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

  // A navegação faz parte do chrome da janela: mesma superfície da barra superior, sem bordas internas.
  return <aside className="boobot-sidebar flex h-full min-w-0 flex-col bg-chrome text-sidebar-foreground" aria-label="Barra lateral do Boobot">
    <header className="space-y-2 px-2.5 pb-1.5 pt-1">
      {browserMode && <>
        <div className="flex h-7 items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-tight">Espaço de trabalho</h2>
          {/* A PWA só cria sessões livres: ação direta em vez de um menu com um único item. */}
          <Button variant="ghost" size="sm" disabled={!canChat} className="h-7 gap-1.5 px-2 text-xs" title="Nova sessão livre" onClick={() => void onStartConversation()}><MessageSquarePlus className="size-3.5" />Nova sessão</Button>
        </div>
        <WorkspaceSearch snapshot={snapshot} canChat={canChat} browserMode onSelectWorkspace={onSelectWorkspace} onSelectConversation={onSelectConversation} onStartConversation={onStartConversation} onOpenAgent={onOpenAgent} onOpenEditor={onOpenEditor} onSectionChange={setSection} />
      </>}
      {!browserMode && <div className="flex items-center gap-1">
        <Button variant="outline" disabled={!canChat} onClick={() => void onStartConversation()} className="h-8 min-w-0 flex-1 justify-start gap-2 px-2.5 text-[12.5px] font-medium"><CirclePlus className="size-4 text-primary" />Nova sessão</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="size-8 shrink-0" aria-label="Criar novo" title="Criar novo"><Plus className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="mr-2 size-4" />Novo projeto</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => openGroupDialog('create')}><Folder className="mr-2 size-4" />Nova pasta de projetos</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent' })}><Users className="mr-2 size-4" />Novo Boo</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </header>
    {onOpenHome && <nav aria-label="Trabalho" className="space-y-px px-2.5 py-1.5">
      <Button type="button" variant={null} size={null} aria-current={view === 'home' ? 'page' : undefined} onClick={() => onOpenHome('home')} className="ds-nav-item flex h-9 w-full items-center justify-start gap-2 rounded-[calc(var(--radius)-1px)] px-2 text-left text-[12.5px] font-medium focus-visible:ring-0">
        {chiefAgent ? <Avatar agent={chiefAgent} size="xs" state={agentStates[chiefAgent.id] || 'idle'} /> : <span className="flex size-[30px] items-center justify-center"><LayoutDashboard className="size-4" /></span>}
        <span className="min-w-0 flex-1 truncate">Central {chiefAgent ? `do ${chiefAgent.name}` : 'do Chief'}</span>
        {attentionCount > 0 && <span aria-label={`${attentionCount} pendências`} className="ds-count" data-tone="attention">{attentionCount > 9 ? '9+' : attentionCount}</span>}
      </Button>
      {!browserMode && <Button type="button" variant={null} size={null} aria-current={view === 'routines' ? 'page' : undefined} onClick={() => onOpenHome('routines')} className="ds-nav-item flex h-9 w-full items-center justify-start gap-2 rounded-[calc(var(--radius)-1px)] px-2 text-left text-[12.5px] font-medium focus-visible:ring-0">
        <span className="flex size-[30px] items-center justify-center"><CalendarClock className="size-4" /></span>
        <span className="min-w-0 flex-1 truncate">Rotinas</span>
        {!!snapshot.routines?.filter(item => item.enabled).length && <span className="ds-count">{snapshot.routines.filter(item => item.enabled).length}</span>}
      </Button>}
      {!browserMode && <div className="mt-0.5"><HostSelector /></div>}
    </nav>}
    {!browserMode && !onOpenHome && <div className="px-2.5 py-1.5"><HostSelector /></div>}
    {!onOpenHome && showChief && chiefAgent && <section aria-label="Chief" className="px-3 py-2">{agentRow(chiefAgent, true)}</section>}
    {project ? projectView(project) : <Tabs value={section} onValueChange={value => setSection(value as 'projects' | 'agents')} className="flex min-h-0 flex-1 flex-col">
      <TabsList className={TAB_LIST + ' mt-2'}>
        <TabsTrigger value="projects" className={TAB_TRIGGER}>Projetos</TabsTrigger>
        <TabsTrigger value="agents" className={TAB_TRIGGER}>Boos</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto px-2 pb-3 pt-1">
        {!!favorites.size && <section aria-label="Favoritos" className="space-y-0.5">
          <p className="ds-eyebrow px-2.5 pb-1 pt-2">Favoritos</p>
          {[...favorites].map(key => {
            const [type, id] = key.split(':', 2)
            if (type === 'workspace') {
              const workspace = snapshot.workspaces.find(item => item.id === id && !item.archived)
              return workspace ? <Button key={key} variant="ghost" onClick={() => enterProject(id)} className="h-8 w-full justify-start gap-2 px-3 text-xs"><FolderOpen className="size-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-left">{workspace.name}</span><Star className="size-3 fill-warning text-warning" /></Button> : null
            }
            if (type === 'conversation') {
              const conversation = snapshot.conversations.find(item => item.id === id && !item.archived)
              return conversation ? <Button key={key} variant="ghost" onClick={() => onSelectConversation(id)} className="h-8 w-full justify-start gap-2 px-3 text-xs"><MessageSquarePlus className="size-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-left">{conversation.name}</span><Star className="size-3 fill-warning text-warning" /></Button> : null
            }
            return null
          })}
        </section>}
        <section aria-label="Projetos" className="space-y-0.5">
          <div className="flex items-center gap-1 px-1 pt-1">
            <h2 className="ds-eyebrow flex-1 px-1.5 py-1">Projetos</h2>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Nova pasta de projetos" title="Criar pasta de projetos" onClick={() => openGroupDialog('create')}><FolderPlus className="size-3.5" /></Button>
          </div>
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
    </Tabs>}
    {!browserMode && <footer className="flex items-center gap-1 border-t border-sidebar-border px-2 py-1.5">
      <Button variant="ghost" disabled={!selected?.workspaceId} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} title={selected?.workspaceId ? 'Abrir a pasta do projeto desta conversa' : 'Abra uma conversa de projeto para acessar a pasta'} className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-2 text-[11px] text-muted-foreground"><FolderOpen className="size-3.5" />Abrir pasta</Button>
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
