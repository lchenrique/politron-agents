import { Bot, Folder, FolderOpen, FolderPlus, MessageSquarePlus, Plus, Settings2, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Project, Snapshot } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import type { EditorKind } from '../editors/Editor'

export function Sidebar({ snapshot, selected, onSelectConversation, onStartConversation, onOpenEditor, onNotice }: {
  snapshot: Snapshot
  selected: Conversation | undefined
  onSelectConversation: (id: string) => void
  onStartConversation: (projectId: string | null) => void | Promise<void>
  onOpenEditor: (editor: { kind: EditorKind; initial?: Agent | Conversation | Project; projectId?: string | null }) => void
  onNotice: (value: string) => void
}) {
  const agentOf = (id: string | null) => snapshot.agents.find(agent => agent.id === id)
  const conversationsOf = (projectId: string | null) => snapshot.conversations.filter(item => !item.archived && item.projectId === projectId)
  const conversationButton = (conversation: Conversation) => <button key={conversation.id} onClick={() => onSelectConversation(conversation.id)} className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${conversation.id === selected?.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background/70">{conversation.agentIds.length ? <Users className="size-3.5" /> : <Sparkles className="size-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{conversation.name}</span><span className="block truncate text-[10px] opacity-70">{!conversation.agentIds.length ? 'Assistente' : conversation.kind === 'group' ? `${conversation.agentIds.length} agentes` : agentOf(conversation.agentIds[0])?.name}</span></span></button>

  return <aside className="flex w-[270px] shrink-0 flex-col border-r border-border/60 bg-card/40">
    <div className="flex items-center px-4 pb-3 pt-4"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="size-4" /></span><span className="text-sm font-semibold tracking-tight">Politron</span></div></div>
    <div className="px-3"><Button variant="outline" className="h-9 w-full justify-start gap-2 border-border/60 bg-background/70 text-sm" onClick={() => void onStartConversation(null)}><MessageSquarePlus className="size-4" /> Nova conversa</Button></div>
    <div className="mt-5 flex items-center justify-between px-4"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Conversas</span><Button variant="ghost" size="icon" className="size-7" aria-label="Nova conversa com equipe" title="Nova conversa com equipe" onClick={() => onOpenEditor({ kind: 'conversation', projectId: null })}><Users className="size-4" /></Button></div>
    <nav aria-label="Conversas" className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto px-2">
      {conversationsOf(null).map(conversationButton)}
      {!snapshot.conversations.length && <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">Clique em Nova conversa para falar com o Assistente. Não é preciso criar agente nem grupo.</p>}
      <div className="mt-4 flex items-center justify-between px-2"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Projetos</span><Button variant="ghost" size="icon" className="size-7" aria-label="Novo projeto" title="Novo projeto" onClick={() => onOpenEditor({ kind: 'project' })}><FolderPlus className="size-4" /></Button></div>
      {snapshot.projects.filter(project => !project.archived).map(project => <div key={project.id} className="pt-1"><div className="group flex items-center gap-1.5 px-2 py-1 text-xs font-medium"><Folder className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={project.directory || project.name}>{project.name}</span><Button variant="ghost" size="icon" className="size-6" aria-label={`Nova conversa em ${project.name}`} title="Nova conversa neste projeto" onClick={() => void onStartConversation(project.id)}><Plus className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-6" aria-label={`Editar projeto ${project.name}`} onClick={() => onOpenEditor({ kind: 'project', initial: project })}><Settings2 className="size-3.5" /></Button></div>{conversationsOf(project.id).map(conversationButton)}{!conversationsOf(project.id).length && <p className="px-3 py-1 text-[10px] text-muted-foreground">Nenhuma conversa ainda.</p>}</div>)}
    </nav>
    <div className="border-t border-border/60 px-3 pb-3 pt-3"><div className="mb-2 flex items-center justify-between px-1"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Seus agentes</span><Button variant="ghost" size="icon" className="size-7" aria-label="Criar agente" onClick={() => onOpenEditor({ kind: 'agent' })}><Plus className="size-4" /></Button></div><div className="max-h-40 space-y-0.5 overflow-auto">{snapshot.agents.map(agent => <button key={agent.id} onClick={() => onOpenEditor({ kind: 'agent', initial: agent })} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate text-xs font-medium">{agent.name}</span><span className="text-[10px] text-muted-foreground">@{agent.alias}</span></button>)}{!snapshot.agents.length && <p className="px-2 py-2 text-xs text-muted-foreground">Crie seu primeiro agente.</p>}</div></div>
    <button disabled={!selected?.directory} onClick={() => selected && void window.appAPI.openFolder(selected.id).catch(error => onNotice(errorText(error)))} className="flex items-center gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-default disabled:opacity-50"><FolderOpen className="size-3.5" /> Abrir pasta da conversa</button>
  </aside>
}
