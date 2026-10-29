import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, CalendarClock, ChevronRight, CirclePlus, Crown, LayoutDashboard, Folder, FolderOpen, FolderPlus, GitBranch, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2, Triangle, Users } from 'lucide-react'
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
import { useSidebarLayout } from './projectGroups'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableArea, SortableGroup, SortableRow, type SortableData } from './SortableRows'
import { applyOrder, mergeSubset, moveTo, placeProject } from './sidebarOrder'
import { conversationDisplayName } from '../../../../shared/delegation-title'
import { relativeTime } from './relativeTime'
import './sidebar-dsh.css'

/** Quantas sessoes o projeto aberto mostra antes de exigir "ver mais". Limita o DOM do sidebar sem esconder o trabalho recente. */
const SESSION_LIMIT = 10

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
  const [expandedDelegations, setExpandedDelegations] = useState<Set<string>>(() => new Set())
  // Relógio das linhas de sessão: o tempo relativo avança a cada minuto.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const runningConversations = useMemo(() => new Set(snapshot.runs.filter(run => run.status === 'running' || run.status === 'queued').map(run => run.conversationId)), [snapshot.runs])
  const [deleteRequest, setDeleteRequest] = useState<{ kind: 'workspace' | 'conversation' | 'agent'; id: string; title: string; description: string } | null>(null)
  useEffect(() => { localStorage.setItem('politron.sidebar.collapsed-workspaces', JSON.stringify([...collapsed])) }, [collapsed])
  useEffect(() => { localStorage.setItem('politron.sidebar.favorites', JSON.stringify([...favorites])) }, [favorites])
  const { layout, save, groups, workspaceGroup, collapsedGroups, moveWorkspaceToGroup, addGroup, renameGroup, removeGroup, toggleGroup } = useSidebarLayout(onNotice)
  // Anúncio para leitores de tela depois de mover um item (Alt+↑/↓ ou arrastar).
  const [announcement, setAnnouncement] = useState('')
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
  const { workspacesById, agentsById, legacyConversations, rootWorkspaces, childWorkspaces, conversationsOf, needsAttention, delegatedConversations, isTopLevel } = useSidebarIndex(snapshot)
  const enteredProject = enteredId ? workspacesById.get(enteredId) : undefined
  // Projeto apagado ou arquivado volta para a lista. O id fica guardado: no início o snapshot ainda chega vazio.
  const project = enteredProject && !enteredProject.archived && enteredProject.name ? enteredProject : undefined
  const enterProject = (id: string | null) => { setEnteredId(id); setProjectTab('sessions') }
  // Abrir uma conversa ou projeto por fora (central, busca, links, notificações) leva a barra para o projeto dele.
  // A primeira conversa vista é a restaurada na inicialização: não sobrepõe o projeto lembrado.
  const navigationTarget = activeWorkspaceId || (selected && (workspacesById.get(selected.workspaceId)?.name ? selected.workspaceId : rootWorkspaces.find(item => item.name === 'Livre' && item.kind === 'free')?.id)) || null
  const navigationKey = activeWorkspaceId ? 'workspace:' + activeWorkspaceId : selected ? 'conversation:' + selected.id : ''
  const firstNavigation = useRef(true)
  const handledNavigation = useRef('')
  // App aberto sem conversa (ex.: na Central): não há restauração, então a próxima navegação é do usuário.
  const snapshotReady = snapshot.workspaces.length > 0 || snapshot.conversations.length > 0
  useEffect(() => { if (snapshotReady && !navigationKey) firstNavigation.current = false }, [snapshotReady, navigationKey])
  useEffect(() => {
    if (!navigationKey || handledNavigation.current === navigationKey) return
    if (firstNavigation.current) {
      firstNavigation.current = false
      if (!activeWorkspaceId) { handledNavigation.current = navigationKey; return }
    }
    // Sessão recém-criada: o projeto dela (ex.: Livre criado agora) pode chegar num snapshot seguinte; espera por ele.
    if (!navigationTarget) return
    handledNavigation.current = navigationKey
    enterProject(navigationTarget)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à navegação e à chegada do destino, não a cada snapshot
  }, [navigationKey, navigationTarget])
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
    className="dsh-row dsh-session group"
    onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}
  >
    <Button variant="ghost" size={null} onClick={() => void onOpenAgent(agent)} title={pinnedChief ? 'Chief · Coordenação' : agent.description || '@' + agent.alias} className="dsh-row-main">
      <span className="dsh-slot"><span className="dsh-glyph"><Avatar agent={agent} size="xxs" state={agentStates[agent.id] || 'idle'} /></span></span>
      <span className="dsh-title flex items-center gap-1">{agent.name}{agent.temporary && <span className="dsh-meta" title={agent.temporaryStatus === 'working' ? 'Boo temporário em execução' : 'Boo temporário'}>Temp</span>}{pinnedChief && <Crown aria-label="Chief" className="size-3.5 shrink-0 text-warning" />}</span>
      <span className="dsh-sub">{pinnedChief ? 'Chief · Coordenação' : agent.description || '@' + agent.alias}</span>
      <AgentPresence state={agentStates[agent.id] || 'idle'} />
      {isFavorite('agent', agent.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
    </Button>
    <DropdownMenu open={openAgentMenuId === agent.id} onOpenChange={open => setOpenAgentMenuId(open ? agent.id : null)}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size={null} className="dsh-row-action" aria-label={'Ações de ' + agent.name}><MoreHorizontal /></Button></DropdownMenuTrigger>
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

  const delegatedSubtree = (id: string): Conversation[] => delegatedConversations(id).flatMap(child => [child, ...delegatedSubtree(child.id)])
  const toggleDelegations = (id: string) => setExpandedDelegations(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  /** Sessão com as delegações dela recolhidas abaixo; enquanto recolhidas, avisos e não lidas das filhas aparecem na linha da mãe. */
  const conversationButton = (conversation: Conversation) => {
    const delegated = delegatedConversations(conversation.id)
    const open = expandedDelegations.has(conversation.id)
    const hidden = open ? [] : delegatedSubtree(conversation.id)
    const row = conversationRow(conversation, needsAttention(conversation.id) || hidden.some(item => needsAttention(item.id)), hidden.reduce((total, item) => total + (unreadCounts[item.id] || 0), unreadCounts[conversation.id] || 0), [conversation, ...hidden].some(item => runningConversations.has(item.id)))
    if (!delegated.length) return row
    return <div key={conversation.id}>
      {row}
      <Button variant="ghost" size={null} aria-expanded={open} onClick={() => toggleDelegations(conversation.id)} className="dsh-overflow">
        <ChevronRight className={open ? 'rotate-90' : undefined} />{delegated.length} {delegated.length === 1 ? 'delegação' : 'delegações'}
      </Button>
      {open && <div className="dsh-indent dsh-rows">{delegated.map(conversationButton)}</div>}
    </div>
  }
  /** Como no DSH: o espaço inicial só mostra estado (aprovação > execução > não lida); à direita, o tempo dá lugar ao menu no hover. */
  const conversationRow = (conversation: Conversation, attention: boolean, unread: number, running: boolean) =>
    <div key={conversation.id} data-active={conversation.id === selected?.id} className="dsh-row dsh-session group" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <Button variant="ghost" size={null} onClick={() => onSelectConversation(conversation.id)} aria-current={conversation.id === selected?.id ? 'page' : undefined} className="dsh-row-main">
        <span className="dsh-slot">{attention ? <span aria-label="Aguardando aprovação" className="dsh-dot" /> : running ? <svg role="img" aria-label="Em execução" className="dsh-spinner" viewBox="0 0 24 24" width="14" height="14"><g><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="9.5" /></g></svg> : unread ? <span aria-label={unread + ' não lidas'} className="dsh-dot" data-state="done" /> : null}</span>
        <span className="dsh-title" title={conversation.name}>{conversationDisplayName(conversation.name)}</span>
        {isFavorite('conversation', conversation.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
        <span className="dsh-meta dsh-resting">{attention ? 'Aprovação' : relativeTime(conversation.updatedAt || conversation.createdAt, now)}</span>
      </Button>
      <DropdownMenu open={openConversationMenuId === conversation.id} onOpenChange={open => setOpenConversationMenuId(open ? conversation.id : null)}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size={null} className="dsh-row-action" aria-label={'Ações da conversa ' + conversation.name}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'conversation', initial: conversation })}><Pencil className="mr-2 size-4" />Renomear ou editar</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => toggleFavorite(favoriteKey('conversation', conversation.id))}><Star className="mr-2 size-4" />{isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão'}</DropdownMenuItem>
          {!browserMode && <DropdownMenuItem onSelect={() => removeConversation(conversation)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir conversa</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

  const workspaceMenu = (workspace: Workspace, triggerClassName: string) =>
    <DropdownMenu open={openWorkspaceMenuId === workspace.id} onOpenChange={open => setOpenWorkspaceMenuId(open ? workspace.id : null)}><DropdownMenuTrigger asChild><Button variant="ghost" size={null} className={triggerClassName} aria-label={`Ações de ${workspace.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
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
    const sessions = conversationsOf(workspace.id).filter(isTopLevel).length
    return <div key={workspace.id} className="dsh-row group" onContextMenu={event => { event.preventDefault(); setOpenWorkspaceMenuId(workspace.id) }}>
      <Button variant="ghost" size={null} onClick={() => enterProject(workspace.id)} className="dsh-row-main" title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path}>
        <span className="dsh-slot">{workspace.kind === 'worktree' ? <GitBranch /> : <FolderOpen />}</span>
        <span className="dsh-title">{workspaceLabel(workspace)}</span>
        {isFavorite('workspace', workspace.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
        {workspaceNeedsAttention(workspace.id) && <span aria-label="Workspace precisa de atenção" className="dsh-dot" />}
        {workspace.kind === 'worktree' && !!workspace.changes && <span className="dsh-meta dsh-resting text-warning">{workspace.changes} alter.</span>}
        <span className="dsh-meta dsh-resting" title={`${sessions} sessões`}>{sessions}</span>
      </Button>
      {workspaceMenu(workspace, 'dsh-row-action')}
    </div>
  }

  /** Projeto aberto: cabeçalho com voltar e abas Projeto/Boos. Só a aba ativa é montada (Radix desmonta a inativa). */
  const projectView = (workspace: Workspace) => {
    const allConversations = conversationsOf(workspace.id)
    const topLevel = applyOrder(allConversations.filter(isTopLevel), layout.sessionOrder[workspace.id], item => item.id)
    const sessionIds = topLevel.map(item => item.id)
    const moveSession = (id: string, index: number) => {
      const next = moveTo(sessionIds, id, index)
      const conversation = topLevel.find(item => item.id === id)
      if (!next || !conversation) return
      save({ sessionOrder: { [workspace.id]: next } })
      setAnnouncement(`Sessão ${conversationDisplayName(conversation.name)} movida para a posição ${next.indexOf(id) + 1}`)
    }
    const showAllSessions = expandedSessions.has(workspace.id)
    const conversations = showAllSessions ? topLevel : topLevel.slice(0, SESSION_LIMIT)
    const hiddenSessions = topLevel.length - conversations.length
    const children = childWorkspaces(workspace.id)
    // Time: equipe padrão do projeto mais quem participa das conversas dele, como na elegibilidade de delegação.
    const team = new Set(workspace.defaultAgentIds)
    if (projectTab === 'team') for (const conversation of allConversations) for (const id of conversation.agentIds) team.add(id)
    const teamAgents = applyOrder([...team].map(id => agentsById.get(id)).filter((agent): agent is Agent => !!agent && agent.temporaryStatus !== 'retired'), layout.agentOrder, agent => agent.id)
    return <Tabs value={projectTab} onValueChange={value => setProjectTab(value as 'sessions' | 'team')} className="flex min-h-0 flex-1 flex-col">
      <div className="dsh-project-head">
        <Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Voltar aos projetos" title="Voltar aos projetos" onClick={() => enterProject(null)}><ArrowLeft /></Button>
        <div data-active={activeWorkspaceId === workspace.id} className="dsh-row group">
          <Button variant="ghost" size={null} onClick={() => onSelectWorkspace?.(workspace.id)} aria-current={activeWorkspaceId === workspace.id ? 'page' : undefined} title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path} className="dsh-row-main">
            <span className="dsh-slot dsh-folder-active">{workspace.kind === 'worktree' ? <GitBranch /> : <FolderOpen />}</span>
            <span className="dsh-title">{workspaceLabel(workspace)}</span>
            {isFavorite('workspace', workspace.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
          </Button>
          {workspaceMenu(workspace, 'dsh-row-action')}
        </div>
      </div>
      <TabsList className="dsh-tabs">
        <TabsTrigger value="sessions" className="dsh-tab">Projeto</TabsTrigger>
        <TabsTrigger value="team" className="dsh-tab">Boos</TabsTrigger>
      </TabsList>
      <TabsContent value="sessions" className="dsh-list dsh-rows mt-0">
        <div className="dsh-row dsh-session"><Button variant="ghost" size={null} disabled={!canChat} onClick={() => void onStartConversation(workspace.id)} className="dsh-row-main text-[var(--dsh-label-tertiary)]"><span className="dsh-slot"><Plus /></span><span className="dsh-title">Nova sessão no projeto</span></Button></div>
        {children.map(projectRow)}
        <SortableArea onDragEnd={listDragEnd(sessionIds, moveSession)}><SortableGroup ids={sessionIds}>
          {conversations.map(conversation => <SortableRow key={conversation.id} id={conversation.id} data={{ type: 'session' }} onMove={delta => moveSession(conversation.id, sessionIds.indexOf(conversation.id) + delta)}>{conversationButton(conversation)}</SortableRow>)}
        </SortableGroup></SortableArea>
        {!!hiddenSessions && <Button type="button" variant="ghost" size={null} onClick={() => setExpandedSessions(current => new Set(current).add(workspace.id))} className="dsh-overflow">Ver mais {hiddenSessions} sessões</Button>}
        {!conversations.length && !children.length && <p className="dsh-empty">Nenhuma conversa ainda.</p>}
      </TabsContent>
      <TabsContent value="team" className="dsh-list dsh-rows mt-0">
        {sortableAgents(teamAgents, agent => agentRow(agent, agent.role === 'chief'))}
        {!teamAgents.length && <p className="dsh-empty">Este projeto ainda não tem time.</p>}
      </TabsContent>
    </Tabs>
  }

  const rootProject = (workspace: Workspace) => <SortableRow key={workspace.id} id={workspace.id} data={{ type: 'project', group: workspaceGroup[workspace.id] ?? null }} onMove={delta => {
    const group = workspaceGroup[workspace.id] ?? null
    const ids = containerIds(group)
    const index = ids.indexOf(workspace.id) + delta
    if (index >= 0 && index < ids.length) moveProject(workspace, group, index)
  }}>{projectRow(workspace)}</SortableRow>

  const groupSection = (name: string | null, items: Workspace[], editable = true) => {
    if (!name) return <div className="dsh-rows"><SortableGroup ids={items.map(item => item.id)}>{items.map(rootProject)}</SortableGroup></div>
    return <ProjectGroupSection key={name} name={name} items={items} collapsed={collapsedGroups.has(name)} editable={editable} onToggle={() => toggleGroup(name)} onRename={() => openGroupDialog('rename', { name })} onRemove={() => removeGroup(name)} onMove={editable ? delta => moveGroup(name, groups.indexOf(name) + delta) : undefined} renderWorkspace={rootProject} />
  }

  // Ordem alfabética até o usuário arrastar; favoritos só ganham a estrela, sem forçar posição.
  const visibleAgents = useMemo(() => applyOrder([...regularAgents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), layout.agentOrder, agent => agent.id), [regularAgents, layout.agentOrder])
  const orderedAgentIds = useMemo(() => applyOrder(snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired'), layout.agentOrder, agent => agent.id).map(agent => agent.id), [snapshot.agents, layout.agentOrder])
  const listDragEnd = (ids: string[], move: (id: string, index: number) => void) => ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) move(String(active.id), ids.indexOf(String(over.id)))
  }
  /** Boos na ordem manual; mover no time do projeto reordena só o time dentro da ordem global. */
  const sortableAgents = (agents: Agent[], render: (agent: Agent) => React.ReactNode) => {
    const ids = agents.map(agent => agent.id)
    const move = (id: string, index: number) => {
      const next = moveTo(ids, id, index)
      const agent = agentsById.get(id)
      if (!next || !agent) return
      save({ agentOrder: mergeSubset(orderedAgentIds, next) })
      setAnnouncement(`Boo ${agent.name} movido para a posição ${next.indexOf(id) + 1}`)
    }
    return <SortableArea onDragEnd={listDragEnd(ids, move)}><SortableGroup ids={ids}>
      {agents.map(agent => <SortableRow key={agent.id} id={agent.id} data={{ type: 'agent' }} onMove={delta => move(agent.id, ids.indexOf(agent.id) + delta)}>{render(agent)}</SortableRow>)}
    </SortableGroup></SortableArea>
  }
  // Separa os projetos por pasta numa passada só (filtrar por pasta custava O(pastas * projetos)) e aplica a ordem manual.
  const projectContainers = useMemo(() => {
    const byGroup = new Map<string, Workspace[]>(groups.map(name => [name, []]))
    const ungrouped: Workspace[] = []
    for (const workspace of rootWorkspaces) {
      const list = byGroup.get(workspaceGroup[workspace.id])
      if (list) list.push(workspace)
      else ungrouped.push(workspace)
    }
    return { groups: layout.groups.map(group => ({ name: group.name, items: applyOrder(byGroup.get(group.name) || [], group.workspaceIds, item => item.id) })), ungrouped: applyOrder(ungrouped, layout.projectOrder, item => item.id) }
  }, [rootWorkspaces, workspaceGroup, groups, layout.groups, layout.projectOrder])
  const containerIds = (group: string | null) => (group === null ? projectContainers.ungrouped : projectContainers.groups.find(item => item.name === group)?.items || []).map(item => item.id)
  const moveProject = (workspace: Workspace, target: string | null, index: number) => {
    const next = placeProject({ groups: projectContainers.groups.map(group => ({ name: group.name, workspaceIds: containerIds(group.name) })), ungrouped: containerIds(null) }, workspace.id, target, index)
    save(next)
    const list = target === null ? next.projectOrder : next.groups.find(group => group.name === target)?.workspaceIds || []
    setAnnouncement(`Projeto ${workspaceLabel(workspace)} movido para a posição ${list.indexOf(workspace.id) + 1}${target ? ` da pasta ${target}` : ''}`)
  }
  const moveGroup = (name: string, index: number) => {
    const next = moveTo(groups, name, index)
    if (!next) return
    save({ groups: next.map(item => layout.groups.find(group => group.name === item)!) })
    setAnnouncement(`Pasta ${name} movida para a posição ${next.indexOf(name) + 1}`)
  }
  const rootDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = active.data.current as SortableData
    const to = over.data.current as SortableData
    if (from.type === 'group' && from.name) {
      const target = to.type === 'group' ? to.name : to.group
      moveGroup(from.name, target ? groups.indexOf(target) : groups.length - 1)
      return
    }
    const workspace = workspacesById.get(String(active.id))
    if (!workspace) return
    // Solto sobre o cabeçalho de uma pasta (ou de "Outros"): entra no topo dela.
    if (to.type === 'group') moveProject(workspace, to.name ?? null, 0)
    else moveProject(workspace, to.group ?? null, containerIds(to.group ?? null).indexOf(String(over.id)))
  }

  // A navegação faz parte do chrome da janela: mesma superfície da barra superior, sem bordas internas.
  return <aside className="boobot-sidebar flex h-full min-w-0 flex-col" aria-label="Barra lateral do Boobot">
    <header className="space-y-2">
      {browserMode && <>
        <div className="flex h-7 items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-tight">Espaço de trabalho</h2>
          {/* A PWA só cria sessões livres: ação direta em vez de um menu com um único item. */}
          <Button variant="ghost" size="sm" disabled={!canChat} className="h-7 gap-1.5 px-2 text-xs" title="Nova sessão livre" onClick={() => void onStartConversation()}><MessageSquarePlus className="size-3.5" />Nova sessão</Button>
        </div>
        <WorkspaceSearch snapshot={snapshot} canChat={canChat} browserMode onSelectWorkspace={onSelectWorkspace} onSelectConversation={onSelectConversation} onStartConversation={onStartConversation} onOpenAgent={onOpenAgent} onOpenEditor={onOpenEditor} onSectionChange={setSection} />
      </>}
      {!browserMode && <div className="dsh-new-row">
        <Button variant="outline" size={null} disabled={!canChat} onClick={() => void onStartConversation()} className="dsh-new-session"><CirclePlus />Nova sessão</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size={null} className="dsh-new-session dsh-square" aria-label="Criar novo" title="Criar novo"><Plus /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="mr-2 size-4" />Novo projeto</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => openGroupDialog('create')}><Folder className="mr-2 size-4" />Nova pasta de projetos</DropdownMenuItem>}
            {!browserMode && <DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent' })}><Users className="mr-2 size-4" />Novo Boo</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </header>
    {onOpenHome && <nav aria-label="Trabalho" className="dsh-panel-list">
      <Button type="button" variant={null} size={null} aria-current={view === 'home' ? 'page' : undefined} onClick={() => onOpenHome('home')} className="dsh-panel-row">
        <span className="dsh-glyph">{chiefAgent ? <Avatar agent={chiefAgent} size="xxs" state={agentStates[chiefAgent.id] || 'idle'} /> : <LayoutDashboard />}</span>
        <span className="min-w-0 flex-1 truncate">Central {chiefAgent ? `do ${chiefAgent.name}` : 'do Chief'}</span>
        {attentionCount > 0 && <span aria-label={`${attentionCount} pendências`} className="ds-count" data-tone="attention">{attentionCount > 9 ? '9+' : attentionCount}</span>}
      </Button>
      {!browserMode && <Button type="button" variant={null} size={null} aria-current={view === 'routines' ? 'page' : undefined} onClick={() => onOpenHome('routines')} className="dsh-panel-row">
        <span className="dsh-glyph"><CalendarClock /></span>
        <span className="min-w-0 flex-1 truncate">Rotinas</span>
        {!!snapshot.routines?.filter(item => item.enabled).length && <span className="ds-count">{snapshot.routines.filter(item => item.enabled).length}</span>}
      </Button>}
      {!browserMode && <HostSelector />}
    </nav>}
    {!browserMode && !onOpenHome && <div className="dsh-panel-list"><HostSelector /></div>}
    {!onOpenHome && showChief && chiefAgent && <section aria-label="Chief" className="dsh-panel-list">{agentRow(chiefAgent, true)}</section>}
    {project ? projectView(project) : <Tabs value={section} onValueChange={value => setSection(value as 'projects' | 'agents')} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="dsh-tabs">
        <TabsTrigger value="projects" className="dsh-tab">Projetos</TabsTrigger>
        <TabsTrigger value="agents" className="dsh-tab">Boos</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="dsh-list mt-0">
        {!!favorites.size && <section aria-label="Favoritos" className="dsh-rows">
          <div className="dsh-section-header"><p className="dsh-section-label">Favoritos</p></div>
          {[...favorites].map(key => {
            const [type, id] = key.split(':', 2)
            if (type === 'workspace') {
              const workspace = snapshot.workspaces.find(item => item.id === id && !item.archived)
              return workspace ? <div key={key} className="dsh-row"><Button variant="ghost" size={null} onClick={() => enterProject(id)} className="dsh-row-main"><span className="dsh-slot"><FolderOpen /></span><span className="dsh-title">{workspace.name}</span><Star className="dsh-star fill-warning text-warning" /></Button></div> : null
            }
            if (type === 'conversation') {
              const conversation = snapshot.conversations.find(item => item.id === id && !item.archived)
              return conversation ? <div key={key} className="dsh-row dsh-session"><Button variant="ghost" size={null} onClick={() => onSelectConversation(id)} className="dsh-row-main"><span className="dsh-slot" /><span className="dsh-title">{conversation.name}</span><Star className="dsh-star fill-warning text-warning" /></Button></div> : null
            }
            return null
          })}
        </section>}
        <section aria-label="Projetos">
          <div className="dsh-section-header">
            <h2 className="dsh-section-label">Projetos</h2>
            <Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Nova pasta de projetos" title="Criar pasta de projetos" onClick={() => openGroupDialog('create')}><FolderPlus /></Button>
          </div>
          <SortableArea onDragEnd={rootDragEnd}>
            <SortableGroup ids={groups.map(group => 'group:' + group)}>{projectContainers.groups.map(group => groupSection(group.name, group.items))}</SortableGroup>
            {groupSection(groups.length ? 'Outros' : null, projectContainers.ungrouped, false)}
          </SortableArea>
          {!rootWorkspaces.length && <p className="dsh-empty">Crie um projeto pelo botão + para organizar suas sessões.</p>}
          {!!legacyConversations.length && !rootWorkspaces.some(item => item.name === 'Livre' && item.kind === 'free') && <div className="dsh-rows mt-1"><div className="dsh-row dsh-folder"><Button variant="ghost" size={null} className="dsh-row-main" onClick={() => toggle('legacy')} aria-label={collapsed.has('legacy') ? 'Expandir sessões antigas' : 'Recolher sessões antigas'}><span className="dsh-slot"><Triangle className="dsh-arrow rotate-90 fill-current" data-open={!collapsed.has('legacy')} /><FolderOpen className="dsh-folder-icon" /></span><span className="dsh-title">Sessões antigas</span><span className="dsh-meta">{legacyConversations.length}</span></Button></div>{!collapsed.has('legacy') && <div className="dsh-indent dsh-rows">{legacyConversations.filter(isTopLevel).map(conversationButton)}</div>}</div>}
        </section>
      </TabsContent>
      <TabsContent value="agents" className="dsh-list mt-0">
        <section aria-label="Catálogo de agentes" className="dsh-rows">
          {onOpenHome && chiefAgent && agentRow(chiefAgent, true)}
          {sortableAgents(visibleAgents, agent => agentRow(agent))}
          {!visibleAgents.length && <p className="dsh-empty">{chiefAgent ? 'Nenhum outro agente cadastrado. Use o botão + para criar.' : 'Crie um Boo pelo botão + para começar.'}</p>}
        </section>
      </TabsContent>
    </Tabs>}
    {!browserMode && <footer className="dsh-foot">
      <Button variant="ghost" size={null} disabled={!selected?.workspaceId} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} title={selected?.workspaceId ? 'Abrir a pasta do projeto desta conversa' : 'Abra uma conversa de projeto para acessar a pasta'} className="dsh-panel-row"><FolderOpen />Abrir pasta</Button>
      <Button variant="ghost" size={null} onClick={onOpenSettings} className="dsh-panel-row"><Settings2 />Configurações</Button>
    </footer>}
    <div aria-live="polite" role="status" aria-label="Ordem do sidebar" className="sr-only">{announcement}</div>
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
