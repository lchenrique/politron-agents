import { useState } from 'react'
import { Archive, ChevronDown, ChevronRight, FolderOpen, FolderPlus, GitBranch, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Settings2, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { AgentPresence, Avatar } from '../app/Avatar'
import { PitsMark } from '../app/PitsMark'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'

export function Sidebar({ snapshot, selected, activeWorkspaceId, unreadCounts, agentStates, onSelectConversation, onSelectWorkspace, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onDeleteWorkspace, onDeleteConversation, onDeleteAgent, onNotice }: {
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
  onNotice: (value: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [agentsCollapsed, setAgentsCollapsed] = useState(false)
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false)
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
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

  const conversationButton = (conversation: Conversation) => <div key={conversation.id} className="group flex items-center gap-1 rounded-md hover:bg-accent/60">
    <button onClick={() => onSelectConversation(conversation.id)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${conversation.id === selected?.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}><span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{conversation.agentIds.length > 1 ? <Users className="size-3" /> : <MessageSquarePlus className="size-3" />}</span><span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={conversation.name}>{conversation.name}</span>{conversation.agentIds.length > 1 && <span className="text-[10px] text-muted-foreground">{conversation.agentIds.length}</span>}{needsAttention(conversation.id) && <span aria-label="Aguardando aprovação" className="size-2 shrink-0 rounded-full bg-amber-500" />}{!!unreadCounts[conversation.id] && <span aria-label={`${unreadCounts[conversation.id]} não lidas`} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{unreadCounts[conversation.id] > 9 ? '9+' : unreadCounts[conversation.id]}</span>}</button>
    <Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Excluir conversa ${conversation.name}`} title="Excluir conversa" onClick={() => removeConversation(conversation)}><Trash2 className="size-3.5" /></Button>
  </div>

  const workspaceNode = (workspace: Workspace, depth = 0): JSX.Element => {
    const isCollapsed = collapsed.has(workspace.id)
    const conversations = conversationsOf(workspace.id)
    const children = childWorkspaces(workspace.id)
    return <div key={workspace.id} className={depth ? 'ml-4 border-l border-border/40 pl-2' : ''}>
      <div className="group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent/40">
        <button className="flex size-5 shrink-0 items-center justify-center text-muted-foreground" aria-label={isCollapsed ? `Expandir ${workspace.name}` : `Recolher ${workspace.name}`} onClick={() => toggle(workspace.id)}>{isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button>
        <button onClick={() => onSelectWorkspace?.(workspace.id)} className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-medium ${activeWorkspaceId === workspace.id ? 'bg-accent text-foreground' : ''}`} title={workspace.kind === 'free' ? 'Workspace livre' : workspace.path}>
          {workspace.kind === 'worktree' ? <GitBranch className="size-3.5 shrink-0 text-muted-foreground" /> : workspace.defaultAgentIds.length > 1 ? <Users className="size-3.5 shrink-0 text-muted-foreground" /> : <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{workspace.kind === 'worktree' ? workspace.branch || workspace.name : workspace.name}</span>
          {workspaceNeedsAttention(workspace.id) && <span aria-label="Workspace precisa de atenção" className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
          {workspace.defaultAgentIds.length > 1 && <span className="text-[10px] text-muted-foreground">{workspace.defaultAgentIds.length} bots</span>}
          {workspace.kind === 'worktree' && !!workspace.changes && <span className="text-[10px] text-amber-500">{workspace.changes} alter.</span>}
        </button>
        <Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Nova conversa em ${workspace.name}`} title="Nova conversa neste workspace" onClick={() => void onStartConversation(workspace.id)}><Plus className="size-3.5" /></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações de ${workspace.name}`}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
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

  return <aside className="flex w-[288px] shrink-0 flex-col border-r border-border/60 bg-card/40">
    <div className="flex items-center px-4 pb-3 pt-4"><div className="flex items-center gap-2"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><PitsMark className="size-9" /></span><span className="text-sm font-semibold tracking-tight">Politron</span></div></div>
    <div className="px-3"><Button variant="outline" className="h-9 w-full justify-start gap-2 border-border/60 bg-background/70 text-sm" onClick={() => void onStartConversation()}><MessageSquarePlus className="size-4" /> Nova sessão livre</Button></div>
    <nav aria-label="Navegação" className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto px-2">

      {!snapshot.conversations.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Clique em Nova conversa para falar com o Assistente. Não é preciso criar agente nem grupo.</p>}
      <div className="mt-4 flex items-center justify-between px-2"><button type="button" aria-label={workspacesCollapsed ? 'Expandir workspaces' : 'Recolher workspaces'} onClick={() => setWorkspacesCollapsed(value => !value)} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground hover:text-foreground">{workspacesCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />} Workspaces <span className="font-normal opacity-70">{rootWorkspaces.length}</span></button><Button variant="ghost" size="icon" className="size-7" aria-label="Novo workspace" title="Novo workspace" onClick={() => onOpenEditor({ kind: 'workspace' })}><FolderPlus className="size-4" /></Button></div>
      <div hidden={workspacesCollapsed} className="space-y-0.5 pt-1">{rootWorkspaces.map(workspace => workspaceNode(workspace))}{!rootWorkspaces.length && <p className="px-3 py-1 text-[11px] text-muted-foreground">Crie um workspace para organizar sua equipe e suas sessões.</p>}{!!legacyConversations.length && !rootWorkspaces.some(item => item.name === 'Livre' && item.kind === 'free') && <div className="mt-2"><button type="button" className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => toggle('legacy')} aria-label={collapsed.has('legacy') ? 'Expandir sessões antigas' : 'Recolher sessões antigas'}>{collapsed.has('legacy') ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}<FolderOpen className="size-3.5" /> Sessões antigas <span className="ml-auto text-[10px]">{legacyConversations.length}</span></button>{!collapsed.has('legacy') && <div className="ml-5 border-l border-border/50 pl-1">{legacyConversations.map(conversationButton)}</div>}</div>}</div>
    </nav>
    <div className="border-t border-border/60 px-3 pb-3 pt-3"><div className="mb-2 flex items-center justify-between px-1"><button type="button" aria-label={agentsCollapsed ? 'Expandir agentes' : 'Recolher agentes'} onClick={() => setAgentsCollapsed(value => !value)} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground hover:text-foreground">{agentsCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />} Agentes <span className="font-normal opacity-70">{snapshot.agents.length}</span></button><Button variant="ghost" size="icon" className="size-7" aria-label="Criar agente" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus className="size-4" /></Button></div><div hidden={agentsCollapsed} className="max-h-64 space-y-1 overflow-auto">{snapshot.agents.map(agent => {
      return <div key={agent.id}>
        <div className="group flex items-center gap-1 rounded-lg hover:bg-accent/50">
          <button onClick={() => void onOpenAgent(agent)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Avatar agent={agent} state={agentStates[agent.id] || 'idle'} /><span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-xs font-semibold">{agent.name}</span><span className="truncate text-[10px] text-muted-foreground">{agent.description || `@${agent.alias}`}</span></span><AgentPresence state={agentStates[agent.id] || 'idle'} /></button>
          <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Editar agente ${agent.name}`} title={`Editar ${agent.name}`} onClick={() => onOpenEditor({ kind: 'agent', initial: agent })}><Pencil className="size-3.5" /></Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações de ${agent.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void onOpenAgent(agent, true)}><MessageSquarePlus className="mr-2 size-4" />Nova conversa</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent', initial: agent })}><Settings2 className="mr-2 size-4" />Editar perfil</DropdownMenuItem><DropdownMenuItem onSelect={() => removeAgent(agent)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir agente</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>
    })}{!snapshot.agents.length && <p className="px-2 py-2 text-xs text-muted-foreground">Crie seu primeiro agente.</p>}</div></div>
    <div className="border-t border-border/60 px-3 py-2"><button disabled={!selected?.workspaceId} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-default disabled:opacity-50"><FolderOpen className="size-3.5" /> Abrir pasta da conversa</button><button onClick={onOpenSettings} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><Settings2 className="size-3.5" /> Configurações</button></div>
  </aside>
}
