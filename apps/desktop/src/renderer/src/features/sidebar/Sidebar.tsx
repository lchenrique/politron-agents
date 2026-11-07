import { useEffect, useMemo, useState } from 'react'
import { Archive, Check, ChevronRight, Crown, Folder, FolderOpen, FolderPlus, GitBranch, ListChecks, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Search, Settings2, SquarePen, Star, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, Modal, type MenuEntry, type MenuItem } from '@/components/dsh'
import { GroupDialog, type GroupDraft } from './GroupDialog'
import { ProjectGroupSection } from './ProjectGroupSection'
import { useSidebarIndex } from './sidebarIndex'
import type { Agent, Approval, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'
import { useSidebarLayout } from './projectGroups'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableArea, SortableGroup, SortableRow, SortableSection, type SortableData } from './SortableRows'
import { applyOrder, mergeSubset, moveTo, placeProject } from './sidebarOrder'
import { conversationDisplayName } from '../../../../shared/delegation-title'
import { listTime } from './relativeTime'
import './sidebar-dsh.css'

/** Conversas por projeto antes de "Ver mais"; a conversa aberta sempre aparece. */
const SESSION_LIMIT = 8

/** Na barra todo Boo usa a figura padrão; só a cor do corpo o diferencia (sem foto, forma ou acessórios). */
const colorOnly = (agent: Agent): Agent => ({ id: agent.id, name: agent.name, color: agent.color } as Agent)
const oneLine = (text: string | undefined) => (text || '').replace(/\s+/g, ' ').trim()
const recency = (a: Conversation, b: Conversation) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)

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

function readSet(key: string): Set<string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) } catch { return new Set() }
}

const Spinner = ({ label }: { label: string }) => <svg role="img" aria-label={label} className="dsh-spinner" viewBox="0 0 24 24" width="14" height="14"><g><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="9.5" /></g></svg>

/**
 * Barra lateral no modelo de mensageiro: busca, faixa de Boos e uma lista única de conversas,
 * agrupada por projeto em seções recolhíveis. Delegações não viram linhas: o estado delas acende a conversa que delegou.
 */
export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onDeleteWorkspace, onDeleteConversation, onDeleteConversations, onDeleteAgent, onSetChief, onNotice }: {
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
  onDeleteWorkspace: (id: string) => void | Promise<void>
  onDeleteConversation: (id: string) => void | Promise<void>
  /** Exclusão em lote; sem ele, a seleção cai em exclusões individuais em sequência. */
  onDeleteConversations?: (ids: string[]) => void | Promise<void>
  onDeleteAgent: (id: string) => void | Promise<void>
  onSetChief: (agent: Agent, chief: boolean) => void | Promise<void>
  onNotice: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => readSet('politron.sidebar.favorites'))
  useEffect(() => { try { localStorage.setItem('politron.sidebar.favorites', JSON.stringify([...favorites])) } catch { /* preferência opcional */ } }, [favorites])
  const [openAgentMenuId, setOpenAgentMenuId] = useState<string | null>(null)
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null)
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  // Seções recolhidas (projetos, favoritos, sessões antigas); abertas por padrão.
  const [closedSections, setClosedSections] = useState<Set<string>>(() => readSet('politron.sidebar.closed-sections'))
  useEffect(() => { try { localStorage.setItem('politron.sidebar.closed-sections', JSON.stringify([...closedSections])) } catch { /* preferência opcional */ } }, [closedSections])
  const isOpen = (key: string) => !closedSections.has(key)
  const toggleSection = (key: string) => setClosedSections(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set())
  // Hora das linhas: avança a cada minuto.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const [deleteRequest, setDeleteRequest] = useState<{ kind: 'workspace' | 'conversation' | 'conversations' | 'agent'; id: string; ids?: string[]; title: string; description: string } | null>(null)
  // Seleção em lote dentro de um projeto, para excluir várias conversas de uma vez.
  const [selecting, setSelecting] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const stopSelecting = () => { setSelecting(null); setCheckedIds(new Set()) }
  const toggleChecked = (id: string) => setCheckedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
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
  const favoriteKey = (type: 'workspace' | 'conversation' | 'agent', id: string) => `${type}:${id}`
  const toggleFavorite = (key: string) => setFavorites(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const isFavorite = (type: 'workspace' | 'conversation' | 'agent', id: string) => favorites.has(favoriteKey(type, id))
  // Índices derivados do snapshot: a barra lateral não pode varrer o snapshot inteiro por projeto.
  const { workspacesById, agentsById, legacyConversations, rootWorkspaces, childWorkspaces, conversationsOf, delegatedConversations, isTopLevel } = useSidebarIndex(snapshot)
  const freeWorkspace = rootWorkspaces.find(item => item.name === 'Livre' && item.kind === 'free')
  /** Projeto em que a conversa aparece: sessões sem projeto nomeado ficam no Livre. */
  const projectOf = (conversation: Conversation) => workspacesById.get(conversation.workspaceId)?.name ? conversation.workspaceId : freeWorkspace?.id
  const projectFamily = (workspace: Workspace) => [workspace, ...childWorkspaces(workspace.id)]
  const runningConversations = useMemo(() => new Set(snapshot.runs.filter(run => run.status === 'running' || run.status === 'queued').map(run => run.conversationId)), [snapshot.runs])
  const conversationsById = useMemo(() => new Map(snapshot.conversations.map(item => [item.id, item])), [snapshot.conversations])
  /** O que cada conversa espera de você: aprovações e perguntas pendentes e missões aguardando resposta. */
  const attentionLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const approval of snapshot.approvals) if (approval.status === 'pending' && !labels.has(approval.conversationId)) labels.set(approval.conversationId, approvalLabel(approval, agentsById.get(approval.agentId)?.name || 'Boo'))
    for (const mission of snapshot.missions || []) if (mission.status === 'waiting' && !labels.has(mission.conversationId)) labels.set(mission.conversationId, `Responder: ${mission.question || mission.title}`)
    return labels
  }, [snapshot.approvals, snapshot.missions, agentsById])
  const delegatedSubtree = (id: string): Conversation[] => delegatedConversations(id).flatMap(child => [child, ...delegatedSubtree(child.id)])

  // Conversa aberta por fora (central, busca, links, notificações): a seção do projeto dela abre.
  useEffect(() => {
    if (!selected) return
    const target = projectOf(selected)
    const parent = target ? workspacesById.get(target)?.parentWorkspaceId : undefined
    const keys = [target, parent].filter(Boolean).map(id => 'project:' + id)
    if (keys.some(key => closedSections.has(key))) setClosedSections(current => { const next = new Set(current); for (const key of keys) next.delete(key); return next })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à troca de conversa, não a cada snapshot
  }, [selected?.id])

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

  /** Boo que fala na conversa: o líder do grupo ou o único participante. */
  const leadAgent = (conversation: Conversation) => agentsById.get(conversation.leaderAgentId || conversation.agentIds[0] || '') || (conversation.agentIds.length ? undefined : snapshot.assistant)
  /** Conversas abertas pela faixa de Boos levam o nome do Boo; nesse caso o título vem do primeiro pedido. */
  const titleOf = (conversation: Conversation, agent?: Agent) => {
    const placeholder = conversation.name === 'Nova conversa' || (!!agent && conversation.name === agent.name)
    return placeholder && conversation.firstPrompt ? oneLine(conversation.firstPrompt) : conversationDisplayName(conversation.name)
  }

  const conversationMenuEntries = (conversation: Conversation): MenuEntry[] => [
    { id: 'edit-conversation', label: 'Renomear ou editar', icon: <Pencil /> },
    { id: 'favorite-conversation', label: isFavorite('conversation', conversation.id) ? 'Remover dos favoritos' : 'Favoritar sessão', icon: <Star /> },
    // Worktrees não têm mais cabeçalho próprio; arquivar fica na conversa que vive nele.
    ...(workspacesById.get(conversation.workspaceId)?.kind === 'worktree' ? [{ id: 'archive-worktree', label: 'Arquivar worktree', icon: <Archive /> }] : []),
    { id: 'delete-conversation', label: 'Excluir conversa', icon: <Trash2 />, danger: true },
  ]
  /** Linha de mensageiro: avatar do Boo com o estado no canto, título, Boo, hora e a prévia da última fala. */
  const conversationRow = (conversation: Conversation, context?: string) => {
    const family = [conversation, ...delegatedSubtree(conversation.id)]
    const attention = family.map(item => attentionLabels.get(item.id)).find(Boolean)
    const unread = family.reduce((total, item) => total + (unreadCounts[item.id] || 0), 0)
    const running = family.some(item => runningConversations.has(item.id))
    const agent = leadAgent(conversation)
    const title = titleOf(conversation, agent)
    const tag = conversation.kind === 'group' ? `Grupo · ${conversation.agentIds.length}` : agent && agent.name !== title ? agent.name : ''
    // Erro cru do provedor (em inglês, cortado) não ajuda na lista; o detalhe fica na conversa.
    const failed = !attention && !!conversation.previewFailed
    const preview = attention || (failed ? 'Erro na última execução' : oneLine(conversation.preview)) || 'Nenhuma mensagem ainda'
    const time = listTime(conversation.updatedAt || conversation.createdAt, now)
    const state = attention ? 'aguardando você' : running ? 'em execução' : unread ? `${unread} não lidas` : ''
    const label = [title, tag, state].filter(Boolean).join(' · ')
    const checked = checkedIds.has(conversation.id)
    const body = <>
      <span className="dsh-chat-avatar" aria-hidden="true">
        {agent ? <Avatar agent={colorOnly(agent)} size="list" state={running ? 'working' : 'idle'} /> : <span className="dsh-chat-avatar-empty" />}
        {selecting ? <span className="dsh-chat-badge dsh-check" data-checked={checked}>{checked && <Check />}</span>
          : attention ? <span className="dsh-chat-badge" data-tone="attention" />
          : running ? <span className="dsh-chat-badge" data-tone="running"><Spinner label="" /></span>
          : unread ? <span className="dsh-chat-badge" data-tone="unread">{unread > 9 ? '9+' : unread}</span> : null}
      </span>
      <span className="dsh-chat-body">
        <span className="dsh-chat-top">
          <span className="dsh-chat-title" title={conversation.name}>{title}</span>
          {isFavorite('conversation', conversation.id) && <Star className="dsh-star fill-warning text-warning" />}
          <span className="dsh-chat-time">{time}</span>
        </span>
        {/* O Boo (ou o grupo) abre a prévia, como o remetente num mensageiro; assim o título fica com a linha de cima inteira. */}
        <span className="dsh-chat-preview" title={preview}>
          {(context || tag) && <span className="dsh-chat-tag">{[context, tag].filter(Boolean).join(' · ')}: </span>}
          <span data-attention={!!attention || undefined} data-error={failed || undefined}>{preview}</span>
        </span>
      </span>
    </>
    if (selecting) return <div key={conversation.id} data-active={checked} className="dsh-chat">
      <Button variant="ghost" size={null} role="checkbox" aria-checked={checked} aria-label={label} onClick={() => toggleChecked(conversation.id)} className="dsh-chat-main">{body}</Button>
    </div>
    return <div key={conversation.id} data-active={conversation.id === selected?.id} className="dsh-chat group" onContextMenu={event => { event.preventDefault(); setOpenConversationMenuId(conversation.id) }}>
      <Button variant="ghost" size={null} onClick={() => onSelectConversation(conversation.id)} aria-label={label} aria-current={conversation.id === selected?.id ? 'page' : undefined} className="dsh-chat-main">{body}</Button>
      <Menu open={openConversationMenuId === conversation.id} onClose={() => setOpenConversationMenuId(null)} align="end" portal autoFocus
        anchor={<Button variant="ghost" size={null} className="dsh-row-action" aria-label={'Ações da conversa ' + conversation.name} aria-haspopup="menu" aria-expanded={openConversationMenuId === conversation.id}
          onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenConversationMenuId(current => current === conversation.id ? null : conversation.id) } }}
          onClick={() => setOpenConversationMenuId(current => current === conversation.id ? null : conversation.id)}><MoreHorizontal /></Button>}
        items={conversationMenuEntries(conversation)} onSelect={id => {
          setOpenConversationMenuId(null)
          if (id === 'edit-conversation') onOpenEditor({ kind: 'conversation', initial: conversation })
          else if (id === 'favorite-conversation') toggleFavorite(favoriteKey('conversation', conversation.id))
          else if (id === 'archive-worktree') { const worktree = workspacesById.get(conversation.workspaceId); if (worktree) void archiveWorkspace(worktree) }
          else if (id === 'delete-conversation') removeConversation(conversation)
        }} />
    </div>
  }

  const workspaceMenu = (workspace: Workspace) => {
    const selectedGroup = workspaceGroup[workspace.id] || null
    const groupItems: MenuItem[] = [
      { id: 'move:__none', label: 'Sem pasta', icon: selectedGroup === null ? <Check /> : <span className="size-4" /> },
      ...groups.map(group => ({ id: `move:${group}`, label: group, icon: selectedGroup === group ? <Check /> : <span className="size-4" /> })),
      { id: 'create-group', label: 'Nova pasta…', icon: <FolderPlus /> },
    ]
    // A API abre a pasta pela conversa; sem sessão no projeto não há como abrir.
    const folderConversation = conversationsOf(workspace.id).find(item => item.workspaceId === workspace.id)
    const items: MenuEntry[] = [
      { id: 'new-conversation', label: 'Nova sessão', icon: <Plus /> },
      ...(onSelectWorkspace ? [{ id: 'open-workspace', label: 'Abrir projeto', icon: <FolderOpen /> }] : []),
      ...(workspace.kind !== 'free' ? [{ id: 'open-folder', label: 'Abrir pasta', icon: <Folder />, disabled: !folderConversation }] : []),
      ...(conversationsOf(workspace.id).length ? [{ id: 'select-sessions', label: 'Selecionar sessões…', icon: <ListChecks /> }] : []),
      { id: 'favorite-workspace', label: isFavorite('workspace', workspace.id) ? 'Remover dos favoritos' : 'Favoritar projeto', icon: <Star /> },
      { id: 'edit-workspace', label: 'Editar projeto', icon: <Settings2 /> },
      ...(workspace.kind !== 'worktree' && workspace.kind !== 'free' ? [{ id: 'new-worktree', label: 'Novo worktree', icon: <GitBranch /> }] : []),
      ...(workspace.kind === 'worktree' ? [{ id: 'archive-worktree', label: 'Arquivar worktree', icon: <Archive /> }] : []),
      { id: 'move-workspace', label: 'Mover para pasta', icon: <FolderPlus />, submenu: groupItems },
      { id: 'delete-workspace', label: 'Excluir projeto', icon: <Trash2 />, danger: true },
    ]
    return <Menu open={openWorkspaceMenuId === workspace.id} onClose={() => setOpenWorkspaceMenuId(null)} align="end" portal autoFocus
      anchor={<Button variant="ghost" size={null} className="dsh-row-action" aria-label={`Ações de ${workspace.name}`} aria-haspopup="menu" aria-expanded={openWorkspaceMenuId === workspace.id}
        onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenWorkspaceMenuId(current => current === workspace.id ? null : workspace.id) } }}
        onClick={() => setOpenWorkspaceMenuId(current => current === workspace.id ? null : workspace.id)}><MoreHorizontal /></Button>}
      items={items} onSelect={id => {
        setOpenWorkspaceMenuId(null)
        if (id === 'new-conversation') void onStartConversation(workspace.id)
        else if (id === 'open-workspace') onSelectWorkspace?.(workspace.id)
        else if (id === 'open-folder') { if (folderConversation) void window.appAPI.openFolder(folderConversation.id).catch(error => onNotice(errorText(error))) }
        else if (id === 'select-sessions') { setSelecting(workspace.id); setCheckedIds(new Set()); setClosedSections(current => { const next = new Set(current); next.delete('project:' + workspace.id); return next }) }
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

  /** Barra de seleção em lote: "Todas" marca `allIds`; excluir age sobre as marcadas. */
  const bulkBar = (allIds: string[], checked: string[]) => {
    const allChecked = allIds.length > 0 && allIds.every(id => checkedIds.has(id))
    return <div role="toolbar" aria-label="Seleção de sessões" className="dsh-bulk-bar">
      <p className="dsh-bulk-label" aria-live="polite">{checked.length ? `${checked.length} selecionada${checked.length === 1 ? '' : 's'}` : 'Selecione sessões'}</p>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCheckedIds(allChecked ? new Set() : new Set(allIds))}>{allChecked ? 'Nenhuma' : 'Todas'}</Button>
      <Button variant="destructive" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={!checked.length} onClick={() => removeConversations(checked)}><Trash2 className="size-3.5" />Excluir</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={stopSelecting}>Cancelar</Button>
    </div>
  }

  /** Cabeçalho de seção de projeto: clicar recolhe; no hover, abrir o projeto, nova sessão e o menu. */
  const projectHeader = (workspace: Workspace, open: boolean) => {
    const family = projectFamily(workspace).flatMap(item => conversationsOf(item.id))
    const attention = family.some(item => attentionLabels.has(item.id))
    const unread = family.reduce((total, item) => total + (unreadCounts[item.id] || 0), 0)
    const running = family.some(item => runningConversations.has(item.id))
    const label = workspaceLabel(workspace)
    return <div className="dsh-section-row group" data-active={activeWorkspaceId === workspace.id} onContextMenu={event => { event.preventDefault(); setOpenWorkspaceMenuId(workspace.id) }}>
      <Button variant="ghost" size={null} className="dsh-section-main" aria-expanded={open} title={workspace.kind === 'free' ? 'Conversas sem projeto' : workspace.path} onClick={() => toggleSection('project:' + workspace.id)}>
        <ChevronRight aria-hidden="true" className="dsh-section-icon dsh-section-chevron" data-open={open} />
        {workspace.kind === 'worktree' && <GitBranch aria-hidden="true" className="dsh-section-icon" />}
        <span className="dsh-section-name">{label}</span>
        {isFavorite('workspace', workspace.id) && <Star className="dsh-star fill-warning text-warning" aria-label="Favorito" />}
        {workspace.kind === 'worktree' && !!workspace.changes && <span className="dsh-meta text-warning">{workspace.changes} alter.</span>}
        {/* Recolhida, a seção ainda avisa: âmbar pede você, anel gira enquanto roda, número conta não lidas. */}
        {!open && (attention ? <span aria-label="Projeto precisa de atenção" role="img" className="dsh-dot" /> : running ? <Spinner label="Sessão em execução" /> : null)}
        {unread > 0 && <span className="ds-count" data-tone="primary" aria-label={`${unread} não lidas`}>{unread > 99 ? '99+' : unread}</span>}
      </Button>
      {onSelectWorkspace && <Button variant="ghost" size={null} className="dsh-row-action" aria-label={`Abrir projeto ${label}`} title="Abrir o projeto" onClick={() => onSelectWorkspace(workspace.id)}>{open ? <FolderOpen /> : <Folder />}</Button>}
      <Button variant="ghost" size={null} className="dsh-row-action" aria-label={`Nova sessão em ${label}`} title="Nova sessão neste projeto" onClick={() => void onStartConversation(workspace.id)}><Plus /></Button>
      {workspaceMenu(workspace)}
    </div>
  }

  /** Corpo da seção: conversas do projeto e dos seus worktrees juntas, da mais recente para a mais antiga (branches como board/<uuid> não dizem nada a quem lê). */
  const projectBody = (workspace: Workspace) => {
    const all = projectFamily(workspace).flatMap(item => conversationsOf(item.id)).filter(isTopLevel).sort(recency)
    const showAll = expandedSessions.has(workspace.id) || selecting === workspace.id
    const shown = showAll ? all : all.slice(0, SESSION_LIMIT)
    if (selected && !shown.includes(selected) && all.includes(selected)) shown.push(selected)
    const hidden = all.length - shown.length
    const selectable = all.flatMap(item => [item.id, ...delegatedSubtree(item.id).map(child => child.id)])
    return <div className="dsh-chats">
      {selecting === workspace.id && bulkBar(selectable, selectable.filter(id => checkedIds.has(id)))}
      {shown.map(conversation => conversationRow(conversation))}
      {hidden > 0 && <Button type="button" variant="ghost" size={null} onClick={() => setExpandedSessions(current => new Set(current).add(workspace.id))} className="dsh-overflow">Ver mais {hidden} {hidden === 1 ? 'conversa' : 'conversas'}</Button>}
    </div>
  }

  const projectSection = (workspace: Workspace) => {
    const open = isOpen('project:' + workspace.id) || selecting === workspace.id
    return <section key={workspace.id} aria-label={workspaceLabel(workspace)} className="dsh-section">
      {projectHeader(workspace, open)}
      {open && projectBody(workspace)}
    </section>
  }

  // Projetos arrastáveis pelo cabeçalho; Alt+↑/↓ no cabeçalho também move.
  const rootProject = (workspace: Workspace) => {
    const open = isOpen('project:' + workspace.id) || selecting === workspace.id
    return <section key={workspace.id} aria-label={workspaceLabel(workspace)} className="dsh-section">
      <SortableSection id={workspace.id} data={{ type: 'project', group: workspaceGroup[workspace.id] ?? null }} onMove={delta => {
        const group = workspaceGroup[workspace.id] ?? null
        const ids = containerIds(group)
        const index = ids.indexOf(workspace.id) + delta
        if (index >= 0 && index < ids.length) moveProject(workspace, group, index)
      }} header={projectHeader(workspace, open)}>
        {open && projectBody(workspace)}
      </SortableSection>
    </section>
  }

  const groupSection = (name: string | null, items: Workspace[], editable = true) => {
    if (!name) return <SortableGroup ids={items.map(item => item.id)}>{items.map(rootProject)}</SortableGroup>
    return <ProjectGroupSection key={name} name={name} items={items} collapsed={collapsedGroups.has(name)} editable={editable} onToggle={() => toggleGroup(name)} onRename={() => openGroupDialog('rename', { name })} onRemove={() => removeGroup(name)} onMove={editable ? delta => moveGroup(name, groups.indexOf(name) + delta) : undefined} renderWorkspace={rootProject} />
  }

  const chiefAgent = useMemo(() => snapshot.agents.find(agent => agent.role === 'chief'), [snapshot.agents])
  const regularAgents = useMemo(() => snapshot.agents.filter(agent => agent.role !== 'chief' && agent.temporaryStatus !== 'retired'), [snapshot.agents])
  // Ordem alfabética até o usuário arrastar.
  const visibleAgents = useMemo(() => applyOrder([...regularAgents].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), layout.agentOrder, agent => agent.id), [regularAgents, layout.agentOrder])
  const orderedAgentIds = useMemo(() => applyOrder(snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired'), layout.agentOrder, agent => agent.id).map(agent => agent.id), [snapshot.agents, layout.agentOrder])
  const listDragEnd = (ids: string[], move: (id: string, index: number) => void) => ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) move(String(active.id), ids.indexOf(String(over.id)))
  }
  // Separa os projetos por pasta numa passada só e aplica a ordem manual.
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

  const favoriteProjects = rootWorkspaces.filter(item => isFavorite('workspace', item.id))
  const favoriteSessions = [...favorites].flatMap(key => {
    const [type, id] = key.split(':', 2)
    const conversation = type === 'conversation' ? conversationsById.get(id) : undefined
    return conversation && !conversation.archived ? [conversation] : []
  })
  // Projetos favoritos sobem para o topo; dentro das pastas não se repetem.
  const unpinned = (items: Workspace[]) => items.filter(item => !isFavorite('workspace', item.id))
  const stateLabel = (state: 'idle' | 'working' | 'waiting') => state === 'working' ? 'trabalhando' : state === 'waiting' ? 'aguardando você' : 'livre'

  const agentMenuEntries = (agent: Agent): MenuEntry[] => {
    const chiefExists = snapshot.agents.some(item => item.role === 'chief')
    return [
      { id: 'new-conversation', label: 'Nova conversa', icon: <MessageSquarePlus /> },
      { id: 'edit-agent', label: 'Editar perfil', icon: <Pencil /> },
      { id: 'favorite-agent', label: isFavorite('agent', agent.id) ? 'Remover dos favoritos' : 'Favoritar agente', icon: <Star /> },
      { id: 'chief-role', label: agent.role === 'chief' ? 'Remover papel de Chief' : chiefExists ? 'Já existe um Chief' : 'Promover a Chief', icon: <Crown />, disabled: agent.role !== 'chief' && chiefExists },
      { id: 'delete-agent', label: 'Excluir agente', icon: <Trash2 />, danger: true },
    ]
  }
  /** Boo da faixa: clicar abre a conversa com ele; o menu (botão direito ou tecla de menu) guarda as outras ações. */
  const booButton = (agent: Agent) => {
    const state = agentStates[agent.id] || 'idle'
    const chief = agent.role === 'chief'
    const name = `${agent.name}${chief ? ', Chief' : ''}${agent.temporary ? ', temporário' : ''}${isFavorite('agent', agent.id) ? ', favorito' : ''} · ${stateLabel(state)}`
    return <Menu open={openAgentMenuId === agent.id} onClose={() => setOpenAgentMenuId(null)} align="start" portal autoFocus
      anchor={<Button variant="ghost" size={null} className="dsh-boo" data-state={state} aria-label={name} title={chief ? `${agent.name} · Chief` : agent.description ? `${agent.name} · ${agent.description}` : agent.name}
        onClick={() => void onOpenAgent(agent)}
        onContextMenu={event => { event.preventDefault(); setOpenAgentMenuId(agent.id) }}>
        <Avatar agent={colorOnly(agent)} size="xs" state={state} />
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
  const booIds = visibleAgents.map(agent => agent.id)
  const moveBoo = (id: string, index: number) => {
    const next = moveTo(booIds, id, index)
    const agent = agentsById.get(id)
    if (!next || !agent) return
    save({ agentOrder: mergeSubset(orderedAgentIds, next) })
    setAnnouncement(`Boo ${agent.name} movido para a posição ${next.indexOf(id) + 1}`)
  }

  const term = oneLine(query).toLocaleLowerCase('pt-BR')
  const matches = useMemo(() => {
    if (!term) return []
    return snapshot.conversations.filter(conversation => {
      if (conversation.archived) return false
      const haystack = [conversation.name, conversation.preview, conversation.firstPrompt, workspacesById.get(conversation.workspaceId)?.name, ...conversation.agentIds.map(id => agentsById.get(id)?.name)].join(' ').toLocaleLowerCase('pt-BR')
      return haystack.includes(term)
    }).sort(recency)
  }, [term, snapshot.conversations, workspacesById, agentsById])

  const list = term
    ? <section aria-label="Resultados da busca" className="dsh-chats">
        {matches.map(conversation => conversationRow(conversation, workspacesById.get(projectOf(conversation) || '')?.name))}
        {!matches.length && <p className="dsh-empty">Nenhuma conversa encontrada.</p>}
      </section>
    : <>
        {!!favoriteSessions.length && <section aria-label="Favoritos" className="dsh-section">
          <div className="dsh-section-row">
            <Button variant="ghost" size={null} className="dsh-section-main" aria-expanded={isOpen('favorites')} onClick={() => toggleSection('favorites')}><span className="dsh-section-name">Favoritos</span></Button>
          </div>
          {isOpen('favorites') && <div className="dsh-chats">{favoriteSessions.map(conversation => conversationRow(conversation))}</div>}
        </section>}
        {favoriteProjects.map(projectSection)}
        <SortableArea onDragEnd={rootDragEnd}>
          <SortableGroup ids={groups.map(group => 'group:' + group)}>{projectContainers.groups.map(group => groupSection(group.name, unpinned(group.items)))}</SortableGroup>
          {groupSection(groups.length ? 'Outros' : null, unpinned(projectContainers.ungrouped), false)}
        </SortableArea>
        {!rootWorkspaces.length && <p className="dsh-empty">Crie um projeto pelo botão de pasta para organizar suas conversas.</p>}
        {!!legacyConversations.length && !freeWorkspace && <section aria-label="Sessões antigas" className="dsh-section">
          <div className="dsh-section-row">
            <Button variant="ghost" size={null} className="dsh-section-main" aria-expanded={isOpen('legacy')} onClick={() => toggleSection('legacy')}><span className="dsh-section-name">Sessões antigas</span><span className="dsh-meta">{legacyConversations.length}</span></Button>
          </div>
          {isOpen('legacy') && <div className="dsh-chats">{legacyConversations.filter(isTopLevel).sort(recency).map(item => conversationRow(item))}</div>}
        </section>}
      </>

  // A navegação faz parte do chrome da janela: mesma superfície da barra superior, sem bordas internas.
  return <aside className="boobot-sidebar flex h-full min-w-0 flex-col" aria-label="Barra lateral do Boobot">
    <header className="dsh-sidebar-head">
      <div className="dsh-search">
        <Search aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery('') } }} placeholder="Buscar" aria-label="Buscar conversas" />
        {query && <Button variant="ghost" size={null} className="dsh-icon-button" aria-label="Limpar busca" onClick={() => setQuery('')}><X /></Button>}
      </div>
      <Button variant="ghost" size={null} className="dsh-icon-button dsh-head-button" onClick={() => void onStartConversation()} aria-label="Nova sessão" aria-keyshortcuts="Control+N" title="Nova sessão (Ctrl+N)"><SquarePen /></Button>
      <Menu open={createMenuOpen} onClose={() => setCreateMenuOpen(false)} align="end" portal autoFocus
        anchor={<Button variant="ghost" size={null} className="dsh-icon-button dsh-head-button" aria-label="Novo projeto ou pasta" title="Novo projeto ou pasta" aria-haspopup="menu" aria-expanded={createMenuOpen}
          onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setCreateMenuOpen(value => !value) } }} onClick={() => setCreateMenuOpen(value => !value)}><FolderPlus /></Button>}
        items={[{ id: 'new-workspace', label: 'Novo projeto', icon: <FolderPlus /> }, { id: 'new-group', label: 'Nova pasta de projetos', icon: <Folder /> }]}
        onSelect={id => {
          setCreateMenuOpen(false)
          if (id === 'new-workspace') onOpenEditor({ kind: 'workspace' })
          else if (id === 'new-group') openGroupDialog('create')
        }} />
    </header>
    <section aria-label="Boos" className="dsh-boos">
      {chiefAgent && booButton(chiefAgent)}
      <SortableArea onDragEnd={listDragEnd(booIds, moveBoo)}><SortableGroup ids={booIds} grid>
        {visibleAgents.map(agent => <SortableRow key={agent.id} id={agent.id} data={{ type: 'agent' }} onMove={delta => moveBoo(agent.id, booIds.indexOf(agent.id) + delta)}>{booButton(agent)}</SortableRow>)}
      </SortableGroup></SortableArea>
      <Button variant="ghost" size={null} className="dsh-boo dsh-boo-add" aria-label="Novo Boo" title="Novo Boo" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus /></Button>
    </section>
    <div className="dsh-list">{list}</div>
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
