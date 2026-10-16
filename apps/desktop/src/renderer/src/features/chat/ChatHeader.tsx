import { useState } from 'react'
import { FolderOpen, Globe, Plus, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Model, Project } from '../../../../shared/v9'
import { Avatar, type AgentAvatarState } from '../app/Avatar'

export function ChatHeader({ selected, selectedAgents, agents, agentStates = {}, selectedProject, models, modelName, onModelChange, onParticipantsChange, onOpenComputerUse, onEditConversation }: {
  selected: Conversation
  selectedAgents: Agent[]
  agents: Agent[]
  agentStates?: Record<string, AgentAvatarState>
  selectedProject: Project | undefined
  models: Model[]
  modelName: string
  onModelChange: (name: string) => void
  onParticipantsChange: (agentIds: string[]) => void
  onOpenComputerUse: () => void
  onEditConversation: () => void
}) {
  const [addingParticipants, setAddingParticipants] = useState(false)
  const participants = selected.agentIds.map(id => agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent)

  return <header className="flex min-h-[58px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/50 px-5 py-2">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex -space-x-2">{selectedAgents.slice(0, 4).map(agent => <span key={agent.id} className="rounded-full bg-background p-0.5"><Avatar agent={agent} state={agentStates[agent.id]} /></span>)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{selected.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {selectedProject && <span className="text-[11px] text-muted-foreground">{selectedProject.name}</span>}
          {participants.length ? participants.map(agent => <span key={agent.id} className="inline-flex items-center gap-1 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"><span>@{agent.alias}</span><button type="button" aria-label={`Remover ${agent.name}`} title={`Remover ${agent.name} do próximo envio`} onClick={() => onParticipantsChange(selected.agentIds.filter(id => id !== agent.id))} className="rounded-full hover:text-foreground"><X className="size-3" /></button></span>) : <span className="text-[11px] text-muted-foreground">Assistente padrão</span>}
          {addingParticipants ? <select autoFocus aria-label="Adicionar participante" defaultValue="" className="h-6 rounded-md border border-input bg-background px-1.5 text-[10px]" onChange={event => { if (event.target.value) onParticipantsChange([...selected.agentIds, event.target.value]); setAddingParticipants(false) }}><option value="" disabled>Escolha um agente</option>{agents.filter(agent => !selected.agentIds.includes(agent.id)).map(agent => <option key={agent.id} value={agent.id}>{agent.name} · @{agent.alias}</option>)}</select> : <button type="button" aria-label="Adicionar participante" title="Adicionar agente aos próximos envios" onClick={() => setAddingParticipants(true)} disabled={!agents.some(agent => !selected.agentIds.includes(agent.id))} className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><Plus className="size-3" /></button>}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="chat-model-select">Modelo</label><select id="chat-model-select" aria-label="Modelo da conversa" value={modelName} onChange={event => onModelChange(event.target.value)} className="h-8 max-w-44 rounded-md border border-border/60 bg-background px-2 text-xs">{models.map(model => <option key={model.id} value={model.name}>{model.name}{model.isDefault ? ' · padrão' : ''}</option>)}</select>
      <Button variant="ghost" size="sm" className="max-w-40 gap-2 text-xs text-muted-foreground" title="Abrir workspace da conversa" onClick={() => void window.appAPI.openFolder(selected.id)}><FolderOpen className="size-3.5 shrink-0" /><span className="truncate">Workspace</span></Button>
      <Button variant="ghost" size="icon" aria-label="Abrir navegador dos agentes" title="Computer Use" onClick={onOpenComputerUse}><Globe className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Editar conversa e pasta" onClick={onEditConversation}><Settings2 className="size-4" /></Button>
    </div>
  </header>
}
