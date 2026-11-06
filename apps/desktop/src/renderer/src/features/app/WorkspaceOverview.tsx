import { FolderGit2, FolderOpen, MessageSquarePlus, Settings2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/layout/PageShell'
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
  // A navegação chama estes itens de Projetos; a página usa o mesmo vocabulário.
  const subtitle = workspace.kind === 'free' ? 'Projeto livre · conversas sem pasta' : `${workspace.kind === 'worktree' ? 'Worktree · ' : ''}${workspace.path}`
  return <PageShell title={workspace.name} subtitle={subtitle}
    leading={<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">{workspace.kind === 'worktree' ? <FolderGit2 className="size-4" /> : <FolderOpen className="size-4" />}</span>}
    actions={<Button variant="outline" size="sm" onClick={onEdit}><Settings2 className="size-4" /> Configurar</Button>}>
    <div className="space-y-8">
      <section className="ds-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ds-section-title">Equipe do projeto</h2>
          <Button variant="ghost" size="sm" onClick={onEdit}><Users className="size-4" /> Gerenciar equipe</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {team.length ? team.map(agent => <Button key={agent.id} variant="ghost" size={null} onClick={() => onOpenAgent(agent)} className="flex h-auto min-w-36 justify-start gap-2.5 whitespace-normal rounded-md border border-border bg-background px-3 py-2 text-left font-normal text-inherit transition-colors hover:border-border-strong hover:bg-accent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0"><Avatar agent={agent} size="sm" /><span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{agent.name}</span><span className="block truncate text-xs text-muted-foreground">@{agent.alias} · Conversar</span></span></Button>) : <p className="text-[13px] text-muted-foreground">Sem equipe fixa. Novas sessões começam com o Assistente padrão.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="ds-section-title flex items-center gap-2">Sessões <span className="ds-count">{sessions.length}</span></h2>{!!sessions.length && <Button onClick={onCreateSession}><MessageSquarePlus className="size-4" /> Nova sessão</Button>}</div>
        {sessions.length ? <div className="ds-list">{sessions.map(session => <Button key={session.id} variant="ghost" size={null} onClick={() => onOpenConversation(session.id)} className="flex h-auto min-h-12 w-full justify-start gap-3 whitespace-normal rounded-none px-4 py-3 text-left font-normal text-inherit transition-colors hover:bg-accent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:ring-0"><MessageSquarePlus className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{session.name}</span><span className="shrink-0 text-xs text-muted-foreground">{session.agentIds.length > 1 ? `${session.agentIds.length} agentes` : session.agentIds.length === 1 ? 'Individual' : 'Assistente'}</span></Button>)}</div> : <div className="ds-empty px-6 py-8 text-center"><p className="text-sm font-medium text-foreground">Nenhuma sessão criada</p><Button variant="outline" className="mt-3" onClick={onCreateSession}>Criar primeira sessão</Button></div>}
      </section>
    </div>
  </PageShell>
}
