import { FolderOpen, Globe, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Project } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'

export function ChatHeader({ selected, selectedAgents, selectedProject, onOpenComputerUse, onEditConversation }: {
  selected: Conversation
  selectedAgents: Agent[]
  selectedProject: Project | undefined
  onOpenComputerUse: () => void
  onEditConversation: () => void
}) {
  return <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-border/50 px-5">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex -space-x-2">{selectedAgents.slice(0, 4).map(agent => <span key={agent.id} className="rounded-full bg-background p-0.5"><Avatar agent={agent} /></span>)}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{selected.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{[selectedProject?.name, selected.agentIds.length ? selectedAgents.map(agent => `@${agent.alias}`).join(' · ') : 'Assistente padrão'].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="max-w-52 gap-2 text-xs text-muted-foreground" title={selected.directory || 'Pasta privada da conversa'} onClick={() => void window.appAPI.openFolder(selected.id)}><FolderOpen className="size-3.5 shrink-0" /><span className="truncate">{selected.directory?.split(/[\\/]/).filter(Boolean).at(-1) || 'Pasta privada'}</span></Button>
      <Button variant="ghost" size="icon" aria-label="Abrir navegador dos agentes" title="Computer Use" onClick={onOpenComputerUse}><Globe className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Editar participantes e pasta" onClick={onEditConversation}><Settings2 className="size-4" /></Button>
    </div>
  </header>
}
