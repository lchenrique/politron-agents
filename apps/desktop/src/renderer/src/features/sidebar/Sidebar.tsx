import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, Building2, CalendarClock, Check, ChevronRight, CirclePlus, ClipboardList, Crown, LayoutDashboard, Folder, FolderOpen, FolderPlus, GitBranch, ListChecks, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Star, Store, Trash2, Triangle, Users } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import { Menu, Modal, type MenuEntry, type MenuItem } from '@/components/dsh'
import { GroupDialog, type GroupDraft } from './GroupDialog'
import { ProjectGroupSection } from './ProjectGroupSection'
import { useSidebarIndex } from './sidebarIndex'
import { WorkspaceSearch } from './WorkspaceSearch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Agent, Approval, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
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
/** Sessões recentes mostradas na árvore ao expandir um projeto; o resto fica em "Ver todas". */
const PREVIEW_LIMIT = 5
/** Itens de "Precisa de você" antes de "Ver mais". */
const NEEDS_LIMIT = 6
/** Boos na faixa de avatares antes de "Ver todos". */
const BOO_LIMIT = 12

/** Frase curta do que o Boo espera do usuário, a partir dos detalhes da aprovação. */
function approvalLabel(approval: Approval, agent: string) {
  const details = approval.details
  const file = details.path?.split(/[\\/]/).pop()
  if (approval.kind === 'question') return `${agent} pergunta: ${details.question || 'responder'}`
  if (approval.kind === 'plan') return `Revisar plano de ${agent}${details.planTitle ? ': ' + details.planTitle : ''}`
  if (approval.kind === 'command') return `Aprovar: ${agent} quer rodar ${details.command || 'um comando'}`
  if (approval.kind === 'write') return `Aprovar: ${agent} quer alterar ${file || 'um arquivo'}`
  if (approval.kind === 'browser') return `Aprovar: ${agent} quer usar o navegador`
  if (approval.kind === 'delegation') return `Aprovar: ${agent} quer delegar${details.recipientName ? ' a ' + details.recipientName : ''}`
  return `Aprovar: ${agent} quer alterar um Boo`
}

function readFlag(key: string) { try { return localStorage.getItem(key) === 'true' } catch { return false } }

function readSet(key: string): Set<string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { return new Set() }
}

export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onDeleteWorkspace, onDeleteConversation, onDeleteConversations, onDeleteAgent, onSetChief, onNotice, view = null, onOpenHome, onSectionChange, attentionCount = 0, browserMode = false, canChat = true }: {
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
  /** Exclusão em lote; sem ele, a seleção cai em exclusões individuais em sequência. */
  onDeleteConversations?: (ids: string[]) => void | Promise<void>
  onDeleteAgent: (id: string) => void | Promise<void>
  onSetChief: (agent: Agent, chief: boolean) => void | Promise<void>
  onNotice: (value: string) => void
  view?: 'home' | 'routines' | 'board' | 'office' | 'marketplace' | null
  onOpenHome?: (view: 'home' | 'routines' | 'board' | 'office' | 'marketplace') => void
  section?: 'projects' | 'agents'
  onSectionChange?: (section: 'projects' | 'agents') => void
  attentionCount?: number
  browserMode?: boolean
  canChat?: boolean
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet('politron.sidebar.collapsed-workspaces'))
  // Projeto aberto na parte de baixo da barra; null mostra a lista de projetos.
  const [enteredId, setEnteredId] = useState<string | null>(() => { try { return localStorage.getItem('politron.sidebar.project') } catch { return null } })
  useEffect(() => { try { if (enteredId) localStorage.setItem('politron.sidebar.project', enteredId); else localStorage.removeItem('politron.sidebar.project') } catch { /* preferência opcional */ } }, [enteredId])
  const [projectTab, setProjectTab] = useState<'sessions' | 'team'>('sessions')
  const [favorites, setFavorites] = useState<Set<string>>(() => readSet('politron.sidebar.favorites'))
  const [openAgentMenuId, setOpenAgentMenuId] = useState<string | null>(null)
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null)
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null)
  const [projectCreateMenuOpen, setProjectCreateMenuOpen] = useState(false)
  // Projetos abertos na árvore; o projeto da conversa atual abre sozinho.
  const [expanded, setExpanded] = useState<Set<string>>(() => readSet('politron.sidebar.expanded-projects'))
  useEffect(() => { try { localStorage.setItem('politron.sidebar.expanded-projects', JSON.stringify([...expanded])) } catch { /* preferência opcional */ } }, [expanded])
  const toggleExpanded = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const [companyCollapsed, setCompanyCollapsed] = useState(() => readFlag('politron.sidebar.company-collapsed'))
  useEffect(() => { try { localStorage.setItem('politron.sidebar.company-collapsed', String(companyCollapsed)) } catch { /* preferência opcional */ } }, [companyCollapsed])
  const [allNeeds, setAllNeeds] = useState(false)
  const [allBoos, setAllBoos] = useState(false)
  // Projetos com muitas sessoes mostram so as mais recentes; o resto fica sob demanda.
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set())
  const [expandedDelegations, setExpandedDelegations] = useState<Set<string>>(() => new Set())
  // Relógio das linhas de sessão: o tempo relativo avança a cada minuto.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const runningConversations = useMemo(() => new Set(snapshot.runs.filter(run => run.status === 'running' || run.status === 'queued').map(run => run.conversationId)), [snapshot.runs])
  const conversationsById = useMemo(() => new Map(snapshot.conversations.map(item => [item.id, item])), [snapshot.conversations])
  const [deleteRequest, setDeleteRequest] = useState<{ kind: 'workspace' | 'conversation' | 'conversations' | 'agent'; id: string; ids?: string[]; title: string; description: string } | null>(null)
  // Modo de seleção das sessões do projeto aberto, para excluir várias de uma vez.
  const [selecting, setSelecting] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const stopSelecting = () => { setSelecting(false); setCheckedIds(new Set()) }
  const toggleChecked = (id: string) => setCheckedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
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
  const enterProject = (id: string | null) => { setEnteredId(id); setProjectTab('sessions'); stopSelecting() }
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
    // A visão "Ver todas" de outro projeto fecha; a árvore mostra o projeto da conversa.
    if (enteredId && enteredId !== navigationTarget) enterProject(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à navegação e à chegada do destino, não a cada snapshot
  }, [navigationKey, navigationTarget])
  // O projeto da conversa atual (inclusive a restaurada na abertura) abre na árvore; recolher depois continua valendo.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o destino muda
  useEffect(() => { if (navigationTarget) expandTo(navigationTarget) }, [navigationTarget])
  /** Abre na árvore o projeto e os projetos acima dele (worktrees ficam dentro do projeto de origem). */
  const expandTo = (id: string) => setExpanded(current => {
    const next = new Set(current)
    for (let item = workspacesById.get(id); item; item = item.parentWorkspaceId ? workspacesById.get(item.parentWorkspaceId) : undefined) next.add(item.id)
    return next.size === current.size ? current : next
  })
  // Projetos com sessão rodando, pelo projeto da conversa (sessões antigas aparecem no Livre).
  const runningWorkspaces = useMemo(() => {
    const result = new Set<string>()
    const free = rootWorkspaces.find(item => item.name === 'Livre' && item.kind === 'free')
    for (const id of runningConversations) {
      const workspaceId = conversationsById.get(id)?.workspaceId
      if (!workspaceId) continue
      result.add(workspacesById.get(workspaceId)?.name ? workspaceId : free?.id || workspaceId)
    }
    return result
  }, [runningConversations, conversationsById, workspacesById, rootWorkspaces])
  /** "Precisa de você": aprovações e perguntas pendentes, missões esperando resposta e sessões rodando, de todos os projetos. */
  const needsYou = useMemo(() => {
    const items: { key: string; conversation: Conversation; attention: boolean; label: string }[] = []
    const seen = new Set<string>()
    const live = (id: string) => { const conversation = conversationsById.get(id); return conversation && !conversation.archived ? conversation : undefined }
    for (const approval of snapshot.approvals) {
      const conversation = approval.status === 'pending' ? live(approval.conversationId) : undefined
      if (!conversation) continue
      items.push({ key: 'approval:' + approval.id, conversation, attention: true, label: approvalLabel(approval, agentsById.get(approval.agentId)?.name || 'Boo') })
      seen.add(conversation.id)
    }
    for (const mission of snapshot.missions || []) {
      const conversation = mission.status === 'waiting' ? live(mission.conversationId) : undefined
      if (!conversation) continue
      items.push({ key: 'mission:' + mission.id, conversation, attention: true, label: `Responder: ${mission.question || mission.title}` })
      seen.add(conversation.id)
    }
    for (const run of snapshot.runs) {
      const conversation = run.status === 'running' || run.status === 'queued' ? live(run.conversationId) : undefined
      if (!conversation || seen.has(conversation.id)) continue
      seen.add(conversation.id)
      const agentName = agentsById.get(run.agentId)?.name
      items.push({ key: 'run:' + conversation.id, conversation, attention: false, label: conversationDisplayName(conversation.name) + (agentName ? ' · ' + agentName : '') })
    }
    return items
  }, [snapshot.approvals, snapshot.missions, snapshot.runs, conversationsById, agentsById])
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
  const removeConversations = (ids: string[]) => {
    if (!ids.length) return
    setDeleteRequest({ kind: 'conversations', id: '', ids, title: ids.length === 1 ? 'Excluir 1 conversa?' : `Excluir ${ids.length} conversas?`, description: 'As mensagens e o histórico das conversas selecionadas serão apagados. Esta ação não pode ser desfeita.' })
  }
  const removeAgent = (agent: Agent) => { setOpenAgentMenuId(null); setDeleteRequest({ kind: 'agent', id: agent.id, title: `Excluir o agente ${agent.name}?`, description: 'As conversas continuam, mas perdem este participante.' }) }

  const agentMenuEntries = (agent: Agent): MenuEntry[] => {
    const chiefExists = snapshot.agents.some(item => item.role === 'chief')
    const favoriteLabel = isFavorite('agent', agent.id) ? 'Remover dos favoritos' : 'Favoritar agente'
    return [
      { id: 'new-conversation', label: 'Nova conversa', icon: <MessageSquarePlus />, disabled: !canChat },
      ...(!browserMode ? [{ id: 'edit-agent', label: 'Editar perfil', icon: <Pencil /> }] : []),
      { id: 'favorite-agent', label: favoriteLabel, icon: <Star /> },
      ...(!browserMode ? [{ id: 'chief-role', label: agent.role === 'chief' ? 'Remover papel de Chief' : chiefExists ? 'Já existe um Chief' : 'Promover a Chief', icon: <Crown />, disabled: agent.role !== 'chief' && chiefExists }] : []),
      ...(!browserMode ? [{ id: 'delete-agent', label: 'Excluir agente', icon: <Trash2 />, danger: true }] : []),
    ]
  }

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
    <Menu open={openAgentMenuId === agent.id} onClose={() => setOpenAgentMenuId(null)} align="end" portal autoFocus
      anchor={<Button variant="ghost" size={null} className="dsh-row-action" aria-label={'Ações de ' + agent.name} aria-haspopup="menu" aria-expanded={openAgentMenuId === agent.id}
        onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenAgentMenuId(current => current === agent.id ? null : agent.id) } }}
        onClick={() => setOpenAgentMenuId(current => current === agent.id ? null : agent.id)}><MoreHorizontal /></Button>}
      items={agentMenuEntries(agent)} onSelect={id => {
        setOpenAgentMenuId(null)
        if (id === 'new-conversation') void onOpenAgent(agent, true)
        else if (id === 'edit-agent') onOpenEditor({ kind: 'agent', initial: agent })
        else if (id === 'favorite-agent') toggleFavorite(favoriteKey('agent', agent.id))
        else if (id === 'chief-role') void onSetChief(agent, agent.role !== 'chief')
        else if (id === 'delete-agent') removeAgent(agent)
      }} />
  </div>
  const chiefAgent = useMemo(() => snapshot.agents.find(agent => agent.role === 'chief'), [snapshot.agents])
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
  const conversationMenuEntries = (conversation: Conversation): MenuEntry[] => [
    ...(!browserMode ? [{ id: 'edit-conversation', label: 'Renomear ou editar', icon: <Pencil /> }] : []),
    { id: 'favorite-conversation', label: isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão', icon: <Star /> },
    ...(!browserMode ? [{ id: 'delete-conversation', label: 'Excluir conversa', icon: <Trash2 />, danger: true }] : []),
  ]
  const conversationRow = (conversation: Conversation, attention: boolean, unread: number, running: boolean) =>
    selecting ? <div key={conversation.id} data-active={checkedIds.has(conversation.id)} className="dsh-row dsh-session">
      <Button variant="ghost" size={null} role="checkbox" aria-checked={checkedIds.has(conversation.id)} onClick={() => toggleChecked(conversation.id)} className="dsh-row-main">
        <span className="dsh-slot"><span aria-hidden="true" className="dsh-check" data-checked={checkedIds.has(conversation.id)}>{checkedIds.has(conversation.id) && <Check />}</span></span>
        <span className="dsh-title" title={conversation.name}>{conversationDisplayName(conversation.name)}</span>
        <span className="dsh-meta">{relativeTime(conversation.updatedAt || conversation.createdAt, now)}</span>
      </Button>
    </div> :
    <div key={conversation.id} data-active={conversation.id === selected?.id} className="dsh-row dsh-session group" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <Button variant="ghost" size={null} onClick={() => onSelectConversation(conversation.id)} aria-current={conversation.id === selected?.id ? 'page' : undefined} className="dsh-row-main">
        <span className="dsh-slot">{attention ? <span aria-label="Aguardando aprovação" className="dsh-dot" /> : running ? <svg role="img" aria-label="Em execução" className="dsh-spinner" viewBox="0 0 24 24" width="14" height="14"><g><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="9.5" /></g></svg> : unread ? <span aria-label={unread + ' não lidas'} className="dsh-dot" data-state="done" /> : null}</span>
        <span className="dsh-title" title={conversation.name}>{conversationDisplayName(conversation.name)}</span>
        {isFavorite('conversation', conversation.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
        <span className="dsh-meta dsh-resting">{attention ? 'Aprovação' : relativeTime(conversation.updatedAt || conversation.createdAt, now)}</span>
      </Button>
      <Menu open={openConversationMenuId === conversation.id} onClose={() => setOpenConversationMenuId(null)} align="end" portal autoFocus
        anchor={<Button variant="ghost" size={null} className="dsh-row-action" aria-label={'Ações da conversa ' + conversation.name} aria-haspopup="menu" aria-expanded={openConversationMenuId === conversation.id}
          onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenConversationMenuId(current => current === conversation.id ? null : conversation.id) } }}
          onClick={() => setOpenConversationMenuId(current => current === conversation.id ? null : conversation.id)}><MoreHorizontal /></Button>}
        items={conversationMenuEntries(conversation)} onSelect={id => {
          setOpenConversationMenuId(null)
          if (id === 'edit-conversation') onOpenEditor({ kind: 'conversation', initial: conversation })
          else if (id === 'favorite-conversation') toggleFavorite(favoriteKey('conversation', conversation.id))
          else if (id === 'delete-conversation') removeConversation(conversation)
        }} />
    </div>

  const workspaceMenu = (workspace: Workspace, triggerClassName: string) => {
    const selectedGroup = workspaceGroup[workspace.id] || null
    const groupItems: MenuItem[] = [
      { id: 'move:__none', label: 'Sem pasta', icon: selectedGroup === null ? <Check /> : <span className="size-4" /> },
      ...groups.map(group => ({ id: `move:${group}`, label: group, icon: selectedGroup === group ? <Check /> : <span className="size-4" /> })),
      { id: 'create-group', label: 'Nova pasta…', icon: <FolderPlus /> },
    ]
    // A API abre a pasta pela conversa; sem sessão no projeto não há como abrir.
    const folderConversation = conversationsOf(workspace.id).find(item => item.workspaceId === workspace.id)
    const items: MenuEntry[] = [
      { id: 'new-conversation', label: 'Nova sessão', icon: <Plus />, disabled: !canChat },
      ...(onSelectWorkspace ? [{ id: 'open-workspace', label: 'Abrir projeto', icon: <FolderOpen /> }] : []),
      ...(!browserMode && workspace.kind !== 'free' ? [{ id: 'open-folder', label: 'Abrir pasta', icon: <Folder />, disabled: !folderConversation }] : []),
      ...(!browserMode && conversationsOf(workspace.id).length ? [{ id: 'select-sessions', label: 'Selecionar sessões…', icon: <ListChecks /> }] : []),
      { id: 'favorite-workspace', label: isFavorite('workspace', workspace.id) ? 'Remover dos favoritos' : 'Favoritar projeto', icon: <Star /> },
      ...(!browserMode ? [{ id: 'edit-workspace', label: 'Editar projeto', icon: <Settings2 /> }] : []),
      ...(!browserMode && workspace.kind !== 'worktree' && workspace.kind !== 'free' ? [{ id: 'new-worktree', label: 'Novo worktree', icon: <GitBranch /> }] : []),
      ...(!browserMode && workspace.kind === 'worktree' ? [{ id: 'archive-worktree', label: 'Arquivar worktree', icon: <Archive /> }] : []),
      ...(!browserMode ? [{ id: 'move-workspace', label: 'Mover para pasta', icon: <FolderPlus />, submenu: groupItems }] : []),
      ...(!browserMode ? [{ id: 'delete-workspace', label: 'Excluir projeto', icon: <Trash2 />, danger: true }] : []),
    ]
    return <Menu open={openWorkspaceMenuId === workspace.id} onClose={() => setOpenWorkspaceMenuId(null)} align="end" portal autoFocus
      anchor={<Button variant="ghost" size={null} className={triggerClassName} aria-label={`Ações de ${workspace.name}`} aria-haspopup="menu" aria-expanded={openWorkspaceMenuId === workspace.id}
        onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenWorkspaceMenuId(current => current === workspace.id ? null : workspace.id) } }}
        onClick={() => setOpenWorkspaceMenuId(current => current === workspace.id ? null : workspace.id)}><MoreHorizontal /></Button>}
      items={items} onSelect={id => {
        setOpenWorkspaceMenuId(null)
        if (id === 'new-conversation') void onStartConversation(workspace.id)
        else if (id === 'open-workspace') onSelectWorkspace?.(workspace.id)
        else if (id === 'open-folder') { if (folderConversation) void window.appAPI.openFolder(folderConversation.id).catch(error => onNotice(errorText(error))) }
        else if (id === 'select-sessions') { enterProject(workspace.id); setSelecting(true); setExpandedSessions(current => new Set(current).add(workspace.id)) }
        else if (id === 'favorite-workspace') toggleFavorite(favoriteKey('workspace', workspace.id))
        else if (id === 'edit-workspace') onOpenEditor({ kind: 'workspace', initial: workspace })
        else if (id === 'new-worktree') {
          const branch = window.prompt('Nome da branch do novo worktree:')
          if (branch?.trim()) void window.appAPI.createWorktree({ sourceWorkspaceId: workspace.id, branch: branch.trim() }).catch(error => onNotice(errorText(error)))
        } else if (id === 'archive-worktree') void archiveWorkspace(workspace)
        else if (id === 'delete-workspace') removeWorkspace(workspace)
        else if (id === 'create-group') openGroupDialog('create', { workspaceId: workspace.id })
        else if (id.startsWith('move:')) moveWorkspaceToGroup(workspace.id, id === 'move:__none' ? null : id.slice('move:'.length))
      }} />
  }

  const workspaceLabel = (workspace: Workspace) => workspace.kind === 'worktree' ? workspace.branch || workspace.name : workspace.name

  /** Projeto na árvore: clicar abre ou recolhe; aberto, mostra worktrees, as sessões mais recentes e "Ver todas". */
  const projectNode = (workspace: Workspace): React.ReactNode => {
    const top = conversationsOf(workspace.id).filter(isTopLevel)
    const open = expanded.has(workspace.id)
    // Mesmo vocabulário das sessões: âmbar pede você, anel gira enquanto roda, verde marca não lidas.
    const attention = conversationsOf(workspace.id).some(item => needsAttention(item.id))
    const unread = !attention && conversationsOf(workspace.id).some(item => (unreadCounts[item.id] || 0) > 0)
    const running = runningWorkspaces.has(workspace.id)
    const label = workspaceLabel(workspace)
    const children = open ? childWorkspaces(workspace.id) : []
    // Recentes por atividade; a conversa aberta aparece mesmo fora das recentes.
    const recent = open ? [...top].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)).slice(0, PREVIEW_LIMIT) : []
    if (open && selected && !recent.includes(selected) && top.includes(selected)) recent.push(selected)
    return <div key={workspace.id}>
      <div className="dsh-row dsh-project group" data-active={activeWorkspaceId === workspace.id} onContextMenu={event => { event.preventDefault(); setOpenWorkspaceMenuId(workspace.id) }}>
        <Button variant="ghost" size={null} onClick={() => toggleExpanded(workspace.id)} aria-expanded={open} className="dsh-row-main" title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path}>
          <span className="dsh-slot"><ChevronRight aria-hidden="true" className="dsh-chevron" data-open={open} /></span>
          {workspace.kind === 'worktree' && <GitBranch aria-hidden="true" className="dsh-kind" />}
          <span className="dsh-title">{label}</span>
          {isFavorite('workspace', workspace.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
          {attention ? <span aria-label="Workspace precisa de atenção" className="dsh-dot" /> : running ? <svg role="img" aria-label="Sessão em execução" className="dsh-spinner" viewBox="0 0 24 24" width="14" height="14"><g><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="9.5" /></g></svg> : unread ? <span aria-label="Sessões não lidas" className="dsh-dot" data-state="done" /> : null}
          {workspace.kind === 'worktree' && !!workspace.changes && <span className="dsh-meta dsh-resting text-warning">{workspace.changes} alter.</span>}
          <span className="dsh-meta dsh-resting" title={`${top.length} sessões`}>{top.length || ''}</span>
        </Button>
        <Button variant="ghost" size={null} className="dsh-row-action" disabled={!canChat} aria-label={`Nova sessão em ${label}`} title="Nova sessão neste projeto" onClick={() => void onStartConversation(workspace.id)}><Plus /></Button>
        {workspaceMenu(workspace, 'dsh-row-action')}
      </div>
      {/* Sessões dentro de um projeto arrastável não arrastam nem reordenam o projeto. */}
      {open && <div className="dsh-indent dsh-rows" onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onKeyDown={event => { if (event.altKey) event.stopPropagation() }}>
        {children.map(projectNode)}
        {recent.map(conversationButton)}
        {top.length > recent.length && <Button type="button" variant="ghost" size={null} className="dsh-overflow" onClick={() => enterProject(workspace.id)}>Ver todas ({top.length})</Button>}
        {!top.length && !children.length && <Button type="button" variant="ghost" size={null} disabled={!canChat} className="dsh-overflow" onClick={() => void onStartConversation(workspace.id)}><Plus />Nova sessão no projeto</Button>}
      </div>}
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
    // Só conta o que ainda existe neste projeto: sessões apagadas por fora saem da seleção.
    const selectable = [...sessionIds, ...topLevel.flatMap(item => delegatedSubtree(item.id).map(child => child.id))]
    const checked = selectable.filter(id => checkedIds.has(id))
    const allChecked = sessionIds.length > 0 && sessionIds.every(id => checkedIds.has(id))
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
        {!browserMode && !!topLevel.length && (selecting
          ? <div role="toolbar" aria-label="Seleção de sessões" className="dsh-section-header dsh-bulk-bar">
              <p className="dsh-section-label" aria-live="polite">{checked.length ? `${checked.length} selecionada${checked.length === 1 ? '' : 's'}` : 'Selecione sessões'}</p>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCheckedIds(allChecked ? new Set() : new Set(sessionIds))}>{allChecked ? 'Nenhuma' : 'Todas'}</Button>
              <Button variant="destructive" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={!checked.length} onClick={() => removeConversations(checked)}><Trash2 className="size-3.5" />Excluir</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={stopSelecting}>Cancelar</Button>
            </div>
          : <div className="dsh-section-header">
              <p className="dsh-section-label">Sessões</p>
              <Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Selecionar sessões" title="Selecionar várias sessões para excluir" onClick={() => { setSelecting(true); if (hiddenSessions) setExpandedSessions(current => new Set(current).add(workspace.id)) }}><ListChecks /></Button>
            </div>)}
        {!selecting && children.map(projectNode)}
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
  }}>{projectNode(workspace)}</SortableRow>

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

  const workingCount = new Set(snapshot.runs.filter(run => run.status === 'running' || run.status === 'waiting').map(run => run.agentId)).size
  const openBoardTasks = snapshot.board?.tasks.filter(item => !['done', 'cancelled'].includes(item.status)).length || 0
  const enabledRoutines = snapshot.routines?.filter(item => item.enabled).length || 0
  const favoriteProjects = rootWorkspaces.filter(item => isFavorite('workspace', item.id))
  const favoriteSessions = [...favorites].flatMap(key => {
    const [type, id] = key.split(':', 2)
    const conversation = type === 'conversation' ? conversationsById.get(id) : undefined
    return conversation && !conversation.archived ? [conversation] : []
  })
  // Favoritos ficam fixados no topo da árvore; dentro das pastas não se repetem.
  const unpinned = (items: Workspace[]) => items.filter(item => !isFavorite('workspace', item.id))
  const strip = [...(chiefAgent ? [chiefAgent] : []), ...visibleAgents]
  const shownBoos = allBoos ? strip : strip.slice(0, BOO_LIMIT)
  const shownNeeds = allNeeds ? needsYou : needsYou.slice(0, NEEDS_LIMIT)
  const stateLabel = (state: 'idle' | 'working' | 'waiting') => state === 'working' ? 'trabalhando' : state === 'waiting' ? 'aguardando você' : 'livre'

  /** Boo na faixa: clicar abre a conversa; o menu (botão direito ou tecla de menu) guarda as outras ações. */
  const booButton = (agent: Agent) => {
    const state = agentStates[agent.id] || 'idle'
    const chief = agent.role === 'chief'
    const name = `${agent.name}${chief ? ', Chief' : ''}${agent.temporary ? ', temporário' : ''}${isFavorite('agent', agent.id) ? ', favorito' : ''} · ${stateLabel(state)}`
    return <Menu open={openAgentMenuId === agent.id} onClose={() => setOpenAgentMenuId(null)} align="start" portal autoFocus
      anchor={<Button variant="ghost" size={null} className="dsh-boo" data-state={state} aria-label={name} title={chief ? `${agent.name} · Chief` : agent.description ? `${agent.name} · ${agent.description}` : agent.name}
        onClick={() => void onOpenAgent(agent)}
        onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}>
        <Avatar agent={agent} size="xs" state={state} />
        {chief && <Crown aria-hidden="true" className="dsh-boo-crown" />}
        {state !== 'idle' && <span aria-hidden="true" className="dsh-boo-state" data-state={state} />}
      </Button>}
      items={agentMenuEntries(agent)} onSelect={id => {
        setOpenAgentMenuId(null)
        if (id === 'new-conversation') void onOpenAgent(agent, true)
        else if (id === 'edit-agent') onOpenEditor({ kind: 'agent', initial: agent })
        else if (id === 'favorite-agent') toggleFavorite(favoriteKey('agent', agent.id))
        else if (id === 'chief-role') void onSetChief(agent, agent.role !== 'chief')
        else if (id === 'delete-agent') removeAgent(agent)
      }} />
  }
  const booIds = shownBoos.map(agent => agent.id)
  const moveBoo = (id: string, index: number) => {
    const next = moveTo(booIds, id, index)
    const agent = agentsById.get(id)
    if (!next || !agent) return
    save({ agentOrder: mergeSubset(orderedAgentIds, next) })
    setAnnouncement(`Boo ${agent.name} movido para a posição ${next.indexOf(id) + 1}`)
  }
  const companyItem = (target: 'board' | 'office' | 'routines' | 'marketplace', icon: React.ReactNode, label: string, count?: React.ReactNode) =>
    <Button type="button" variant={null} size={null} aria-current={view === target ? 'page' : undefined} onClick={() => onOpenHome?.(target)} className="dsh-panel-row">
      <span className="dsh-glyph">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count}
    </Button>

  const overview = <div className="dsh-list">
    {!!needsYou.length && <section aria-labelledby="dsh-needs-you" className="dsh-rows dsh-section">
      <div className="dsh-section-header"><h2 id="dsh-needs-you" className="dsh-section-label">Precisa de você</h2><span className="dsh-meta dsh-section-count">{needsYou.length}</span></div>
      {shownNeeds.map(item => <div key={item.key} data-active={item.conversation.id === selected?.id} className="dsh-row dsh-session">
        <Button variant="ghost" size={null} onClick={() => onSelectConversation(item.conversation.id)} title={item.label} className="dsh-row-main">
          <span className="dsh-slot">{item.attention ? <span aria-label="Aguardando você" role="img" className="dsh-dot" /> : <svg role="img" aria-label="Em execução" className="dsh-spinner" viewBox="0 0 24 24" width="14" height="14"><g><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="9.5" /></g></svg>}</span>
          <span className="dsh-title">{item.label}</span>
        </Button>
      </div>)}
      {needsYou.length > shownNeeds.length && <Button type="button" variant="ghost" size={null} className="dsh-overflow" onClick={() => setAllNeeds(true)}>Ver mais {needsYou.length - shownNeeds.length}</Button>}
    </section>}
    <section aria-labelledby="dsh-projects" className="dsh-section">
      <div className="dsh-section-header">
        <h2 id="dsh-projects" className="dsh-section-label">Projetos</h2>
        {!browserMode && <Menu open={projectCreateMenuOpen} onClose={() => setProjectCreateMenuOpen(false)} align="end" portal autoFocus
          anchor={<Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Novo projeto ou pasta" title="Novo projeto ou pasta" aria-haspopup="menu" aria-expanded={projectCreateMenuOpen}
            onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setProjectCreateMenuOpen(value => !value) } }} onClick={() => setProjectCreateMenuOpen(value => !value)}><Plus /></Button>}
          items={[{ id: 'new-workspace', label: 'Novo projeto', icon: <FolderPlus /> }, { id: 'new-group', label: 'Nova pasta de projetos', icon: <Folder /> }]}
          onSelect={id => {
            setProjectCreateMenuOpen(false)
            if (id === 'new-workspace') onOpenEditor({ kind: 'workspace' })
            else if (id === 'new-group') openGroupDialog('create')
          }} />}
      </div>
      {(!!favoriteProjects.length || !!favoriteSessions.length) && <div role="group" aria-label="Favoritos" className="dsh-rows dsh-pinned">
        {favoriteProjects.map(projectNode)}
        {favoriteSessions.map(conversation => conversationRow(conversation, needsAttention(conversation.id), unreadCounts[conversation.id] || 0, runningConversations.has(conversation.id)))}
      </div>}
      <SortableArea onDragEnd={rootDragEnd}>
        <SortableGroup ids={groups.map(group => 'group:' + group)}>{projectContainers.groups.map(group => groupSection(group.name, unpinned(group.items)))}</SortableGroup>
        {groupSection(groups.length ? 'Outros' : null, unpinned(projectContainers.ungrouped), false)}
      </SortableArea>
      {!rootWorkspaces.length && <p className="dsh-empty">Crie um projeto pelo botão + para organizar suas sessões.</p>}
      {!!legacyConversations.length && !rootWorkspaces.some(item => item.name === 'Livre' && item.kind === 'free') && <div className="dsh-rows mt-1"><div className="dsh-row dsh-folder"><Button variant="ghost" size={null} className="dsh-row-main" onClick={() => toggle('legacy')} aria-label={collapsed.has('legacy') ? 'Expandir sessões antigas' : 'Recolher sessões antigas'}><span className="dsh-slot"><Triangle className="dsh-arrow rotate-90 fill-current" data-open={!collapsed.has('legacy')} /><FolderOpen className="dsh-folder-icon" /></span><span className="dsh-title">Sessões antigas</span><span className="dsh-meta">{legacyConversations.length}</span></Button></div>{!collapsed.has('legacy') && <div className="dsh-indent dsh-rows">{legacyConversations.filter(isTopLevel).map(conversationButton)}</div>}</div>}
    </section>
    <section aria-labelledby="dsh-boos" className="dsh-section">
      <div className="dsh-section-header">
        <h2 id="dsh-boos" className="dsh-section-label">Boos</h2>
        {!browserMode && <Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Novo Boo" title="Novo Boo" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus /></Button>}
      </div>
      {!!strip.length && <div className="dsh-boos">
        <SortableArea onDragEnd={listDragEnd(booIds, moveBoo)}><SortableGroup ids={booIds} grid>
          {shownBoos.map(agent => <SortableRow key={agent.id} id={agent.id} data={{ type: 'agent' }} onMove={delta => moveBoo(agent.id, booIds.indexOf(agent.id) + delta)}>{booButton(agent)}</SortableRow>)}
        </SortableGroup></SortableArea>
        {strip.length > shownBoos.length && <Button type="button" variant="ghost" size={null} className="dsh-boo dsh-boo-more" aria-label={`Ver todos os ${strip.length} Boos`} title="Ver todos os Boos" onClick={() => setAllBoos(true)}>+{strip.length - shownBoos.length}</Button>}
      </div>}
      {!visibleAgents.length && <p className="dsh-empty">{chiefAgent ? 'Nenhum outro Boo ainda. Use o + para criar.' : 'Crie um Boo pelo + para começar.'}</p>}
      {!browserMode && onOpenHome && <Button type="button" variant="ghost" size={null} className="dsh-overflow dsh-hire" onClick={() => onOpenHome('marketplace')}><Store />Contratar equipe</Button>}
    </section>
    {onOpenHome && <section aria-label="Empresa" className="dsh-section">
      <div className="dsh-section-header">
        <Button variant="ghost" size={null} className="dsh-section-toggle" aria-expanded={!companyCollapsed} onClick={() => setCompanyCollapsed(value => !value)}>
          <span className="dsh-section-label">Empresa</span>
          <ChevronRight aria-hidden="true" className="dsh-chevron" data-open={!companyCollapsed} />
        </Button>
        {companyCollapsed && !!workingCount && <span className="dsh-meta dsh-section-count" aria-label={`${workingCount} trabalhando`}>{workingCount}</span>}
      </div>
      {!companyCollapsed && <nav aria-label="Empresa" className="dsh-panel-list">
        {companyItem('board', <ClipboardList />, 'Board da empresa', !!openBoardTasks && <span className="ds-count">{openBoardTasks}</span>)}
        {companyItem('office', <Building2 />, 'Escritório', !!workingCount && <span className="ds-count" aria-label={`${workingCount} trabalhando`}>{workingCount}</span>)}
        {!browserMode && companyItem('routines', <CalendarClock />, 'Rotinas', !!enabledRoutines && <span className="ds-count">{enabledRoutines}</span>)}
        {!browserMode && companyItem('marketplace', <Store />, 'Marketplace')}
      </nav>}
    </section>}
  </div>

  // A navegação faz parte do chrome da janela: mesma superfície da barra superior, sem bordas internas.
  return <aside className="boobot-sidebar flex h-full min-w-0 flex-col" aria-label="Barra lateral do Boobot">
    <header className="space-y-2">
      {browserMode && <>
        <div className="flex h-7 items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-tight">Espaço de trabalho</h2>
          {/* A PWA só cria sessões livres: ação direta em vez de um menu com um único item. */}
          <Button variant="ghost" size="sm" disabled={!canChat} className="h-7 gap-1.5 px-2 text-xs" title="Nova sessão livre" onClick={() => void onStartConversation()}><MessageSquarePlus className="size-3.5" />Nova sessão</Button>
        </div>
        <WorkspaceSearch snapshot={snapshot} canChat={canChat} browserMode onSelectWorkspace={onSelectWorkspace} onSelectConversation={onSelectConversation} onStartConversation={onStartConversation} onOpenAgent={onOpenAgent} onOpenEditor={onOpenEditor} onSectionChange={onSectionChange ?? (() => undefined)} />
      </>}
      {/* Uma única ação de criar no topo; cada seção cria o seu (projeto, Boo) pelo próprio +. */}
      {!browserMode && <div className="dsh-new-row">
        <Button variant="outline" size={null} disabled={!canChat} onClick={() => void onStartConversation()} aria-keyshortcuts="Control+N" title="Nova sessão (Ctrl+N)" className="dsh-new-session"><CirclePlus />Nova sessão<Kbd aria-hidden="true" className="dsh-kbd">Ctrl N</Kbd></Button>
      </div>}
    </header>
    {onOpenHome && <nav aria-label="Trabalho" className="dsh-panel-list">
      <Button type="button" variant={null} size={null} aria-current={view === 'home' ? 'page' : undefined} onClick={() => onOpenHome('home')} className="dsh-panel-row">
        <span className="dsh-glyph">{chiefAgent ? <Avatar agent={chiefAgent} size="xxs" state={agentStates[chiefAgent.id] || 'idle'} /> : <LayoutDashboard />}</span>
        <span className="min-w-0 flex-1 truncate">Central {chiefAgent ? `do ${chiefAgent.name}` : 'do Chief'}</span>
        {attentionCount > 0 && <span aria-label={`${attentionCount} pendências`} className="ds-count" data-tone="attention">{attentionCount > 9 ? '9+' : attentionCount}</span>}
      </Button>
    </nav>}
    {project ? projectView(project) : overview}
    {!browserMode && <footer className="dsh-foot">
      <div className="dsh-foot-host"><HostSelector /></div>
      <Button variant="ghost" size={null} onClick={onOpenSettings} className="dsh-panel-row dsh-foot-settings"><Settings2 />Configurações</Button>
    </footer>}
    <div aria-live="polite" role="status" aria-label="Ordem do sidebar" className="sr-only">{announcement}</div>
    <GroupDialog draft={groupDialog} onChange={value => setGroupDialog(current => current ? { ...current, value } : current)} onCancel={() => setGroupDialog(null)} onConfirm={confirmGroupDialog} />
    <Modal open={!!deleteRequest} onClose={() => setDeleteRequest(null)} title={deleteRequest?.title || 'Confirmar exclusão'} description={deleteRequest?.description} closeLabel="Fechar"
      footer={<div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteRequest(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => {
            const request = deleteRequest
            setDeleteRequest(null)
            if (!request) return
            if (request.kind === 'workspace') void onDeleteWorkspace(request.id)
            else if (request.kind === 'conversation') void onDeleteConversation(request.id)
            else if (request.kind === 'conversations') {
              const ids = request.ids || []
              stopSelecting()
              if (onDeleteConversations) void onDeleteConversations(ids)
              else void ids.reduce<Promise<void>>((chain, id) => chain.then(() => onDeleteConversation(id)), Promise.resolve())
            }
            else void onDeleteAgent(request.id)
          }}>Excluir</Button>
      </div>} />
  </aside>
}
