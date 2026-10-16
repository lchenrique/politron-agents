import { FolderGit2, FolderOpen, MessageSquarePlus, Settings2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Workspace } from '../../../../shared/v9'
import { Avatar } from './Avatar'

export function WorkspaceOverview({ workspace, conversations, workspaces, agents, onCreateSession, onOpenConversation, onEdit, onOpenAgent }: {
  workspace: Workspace
  conversations: Conversation[]
  workspaces: Workspace[]
  agents: Agent[]
  onCreateSession: () => void
  onOpenConversation: (id: string) => void
  onEdit: () => void
  onOpenAgent: (agent: Agent) => void
}) {
  const team = workspace.defaultAgentIds.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent)
  const sessions = conversations.filter(item => !item.archived && (item.workspaceId === workspace.id || (workspace.kind === 'free' && workspace.name === 'Livre' && !workspaces.find(other => other.id === item.workspaceId)?.name))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return <div className="min-h-0 flex-1 overflow-auto px-6 py-10 sm:px-10">
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{workspace.kind === 'worktree' ? <FolderGit2 className="size-7" /> : <FolderOpen className="size-7" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Workspace {workspace.kind === 'free' ? 'livre' : 'de projeto'}</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{workspace.name}</h1>
          {workspace.kind !== 'free' && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{workspace.path}</p>}
          {workspace.kind === 'free' && <p className="mt-2 text-sm text-muted-foreground">Converse sem associar uma pasta de projeto.</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="size-4" /> Configurar</Button>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Equipe deste workspace</h2><p className="mt-1 text-xs text-muted-foreground">Defina quem participa das próximas sessões. Cada agente também pode conversar individualmente.</p></div>
          <Button variant="ghost" size="sm" onClick={onEdit}><Users className="size-4" /> Gerenciar equipe</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {team.length ? team.map(agent => <button key={agent.id} onClick={() => onOpenAgent(agent)} className="flex min-w-36 items-center gap-2.5 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-left transition-colors hover:bg-accent"><Avatar agent={agent} size="sm" /><span className="min-w-0"><span className="block truncate text-xs font-semibold">{agent.name}</span><span className="block truncate text-[11px] text-muted-foreground">@{agent.alias} · Conversar</span></span></button>) : <p className="text-xs text-muted-foreground">Sem equipe fixa. Novas sessões começam com o Assistente padrão.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Sessões <span className="ml-1 text-xs font-normal text-muted-foreground">({sessions.length})</span></h2><p className="text-xs text-muted-foreground">Históricos independentes dentro do mesmo contexto de trabalho.</p></div><Button onClick={onCreateSession}><MessageSquarePlus className="size-4" /> Nova sessão</Button></div>
        {sessions.length ? <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">{sessions.map(session => <button key={session.id} onClick={() => onOpenConversation(session.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60"><MessageSquarePlus className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{session.name}</span><span className="shrink-0 text-xs text-muted-foreground">{session.agentIds.length > 1 ? `${session.agentIds.length} agentes` : session.agentIds.length === 1 ? 'Individual' : 'Assistente'}</span></button>)}</div> : <div className="rounded-xl border border-dashed border-border/80 px-6 py-12 text-center"><p className="text-sm font-medium">Nenhuma sessão criada</p><p className="mt-1 text-xs text-muted-foreground">Abrir um workspace não inicia sessões automaticamente.</p><Button variant="outline" className="mt-4" onClick={onCreateSession}>Criar primeira sessão</Button></div>}
      </section>
    </div>
  </div>
}
