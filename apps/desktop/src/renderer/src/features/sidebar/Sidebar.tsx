import { Bot, Folder, FolderOpen, FolderPlus, MessageSquarePlus, MoreHorizontal, Plus, Settings2, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Agent, Conversation, Project, Snapshot } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'

export function Sidebar({ snapshot, selected, unreadCounts, agentStates, onSelectConversation, onStartConversation, onOpenAgent, onOpenEditor, onOpenSettings, onNotice }: {
  snapshot: Snapshot
  selected: Conversation | undefined
  unreadCounts: Record<string, number>
  agentStates: Record<string, 'idle' | 'working' | 'waiting'>
  onSelectConversation: (id: string) => void
  onStartConversation: (projectId: string | null) => void | Promise<void>
  onOpenAgent: (agent: Agent, newConversation?: boolean) => void | Promise<void>
  onOpenEditor: (editor: { kind: EditorKind; initial?: Agent | Conversation | Project; projectId?: string | null }) => void
  onOpenSettings: () => void
  onNotice: (value: string) => void
}) {
  const agentOf = (id: string | null) => snapshot.agents.find(agent => agent.id === id)
  const conversationsOf = (projectId: string | null) => snapshot.conversations.filter(item => !item.archived && item.projectId === projectId)
  const conversationButton = (conversation: Conversation) => <button key={conversation.id} onClick={() => onSelectConversation(conversation.id)} className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${conversation.id === selected?.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background/70">{conversation.agentIds.length ? <Users className="size-3.5" /> : <Sparkles className="size-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{conversation.name}</span><span className="block truncate text-[10px] opacity-70">{!conversation.agentIds.length ? 'Assistente' : conversation.kind === 'group' ? `${conversation.agentIds.length} agentes` : agentOf(conversation.agentIds[0])?.name}</span></span>{!!unreadCounts[conversation.id] && <span aria-label={`${unreadCounts[conversation.id]} não lidas`} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{unreadCounts[conversation.id] > 9 ? '9+' : unreadCounts[conversation.id]}</span>}</button>

  return <aside className="flex w-[270px] shrink-0 flex-col border-r border-border/60 bg-card/40">
    <div className="flex items-center px-4 pb-3 pt-4"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="size-4" /></span><span className="text-sm font-semibold tracking-tight">Politron</span></div></div>
    <div className="px-3"><Button variant="outline" className="h-9 w-full justify-start gap-2 border-border/60 bg-background/70 text-sm" onClick={() => void onStartConversation(null)}><MessageSquarePlus className="size-4" /> Nova conversa</Button></div>
    <div className="mt-5 flex items-center justify-between px-4"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Conversas</span><Button variant="ghost" size="icon" className="size-7" aria-label="Criar conversa" title="Escolher participantes" onClick={() => onOpenEditor({ kind: 'conversation', projectId: null })}><Plus className="size-4" /></Button></div>
    <nav aria-label="Conversas" className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto px-2">
      {conversationsOf(null).map(conversationButton)}
      {!snapshot.conversations.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Clique em Nova conversa para falar com o Assistente. Não é preciso criar agente nem grupo.</p>}
      <div className="mt-4 flex items-center justify-between px-2"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Projetos</span><Button variant="ghost" size="icon" className="size-7" aria-label="Novo projeto" title="Novo projeto" onClick={() => onOpenEditor({ kind: 'project' })}><FolderPlus className="size-4" /></Button></div>
      {snapshot.projects.filter(project => !project.archived).map(project => <div key={project.id} className="pt-1"><div className="group flex items-center gap-1.5 px-2 py-1 text-xs font-medium"><Folder className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={project.directory || project.name}>{project.name}</span><Button variant="ghost" size="icon" className="size-6" aria-label={`Nova conversa em ${project.name}`} title="Nova conversa neste projeto" onClick={() => onOpenEditor({ kind: 'conversation', projectId: project.id })}><Plus className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-6" aria-label={`Editar projeto ${project.name}`} onClick={() => onOpenEditor({ kind: 'project', initial: project })}><Settings2 className="size-3.5" /></Button></div>{conversationsOf(project.id).map(conversationButton)}{!conversationsOf(project.id).length && <p className="px-3 py-1 text-[10px] text-muted-foreground">Nenhuma conversa ainda.</p>}</div>)}
    </nav>
    <div className="border-t border-border/60 px-3 pb-3 pt-3"><div className="mb-2 flex items-center justify-between px-1"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Agentes</span><Button variant="ghost" size="icon" className="size-7" aria-label="Criar agente" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus className="size-4" /></Button></div><div className="max-h-40 space-y-0.5 overflow-auto">{snapshot.agents.map(agent => {
      const directConversations = snapshot.conversations.filter(item => !item.archived && item.kind === 'direct' && item.agentIds.length === 1 && item.agentIds[0] === agent.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return <div key={agent.id}>
        <div className="group flex items-center gap-1 rounded-lg hover:bg-accent/50">
          <button onClick={() => void onOpenAgent(agent)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Avatar agent={agent} /><span aria-label={agentStates[agent.id] === 'waiting' ? 'Aguardando' : agentStates[agent.id] === 'working' ? 'Trabalhando' : 'Ocioso'} className={`size-2 shrink-0 rounded-full ${agentStates[agent.id] === 'waiting' ? 'bg-amber-500' : agentStates[agent.id] === 'working' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} /><span className="min-w-0 flex-1 truncate text-xs font-medium">{agent.name}</span><span className="text-[10px] text-muted-foreground">@{agent.alias}</span></button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações de ${agent.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void onOpenAgent(agent, true)}><MessageSquarePlus className="mr-2 size-4" />Nova conversa</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenEditor({ kind: 'agent', initial: agent })}><Settings2 className="mr-2 size-4" />Editar perfil</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        {directConversations.slice(0, 3).map(conversation => <button key={conversation.id} onClick={() => onSelectConversation(conversation.id)} className={`ml-5 block w-[calc(100%-1.25rem)] truncate rounded-md px-2 py-1 text-left text-[11px] ${conversation.id === selected?.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`} title={conversation.name}>{conversation.name}</button>)}
      </div>
    })}{!snapshot.agents.length && <p className="px-2 py-2 text-xs text-muted-foreground">Crie seu primeiro agente.</p>}</div></div>
    <div className="border-t border-border/60 px-3 py-2"><button disabled={!selected?.directory} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-default disabled:opacity-50"><FolderOpen className="size-3.5" /> Abrir pasta da conversa</button><button onClick={onOpenSettings} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"><Settings2 className="size-3.5" /> Configurações</button></div>
  </aside>
}
