import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { Avatar } from './Avatar'
import type { Agent } from '../../../../shared/v9'

export function AgentAvatarGroup({ agents, maxVisible = 6, onRemove, onSelect, className = '' }: {
  agents: Agent[]; maxVisible?: number; onRemove?: (agent: Agent) => void; onSelect?: (agent: Agent) => void; className?: string
}) {
  if (!agents.length) return null
  const visible = agents.length > maxVisible ? agents.slice(0, Math.max(0, maxVisible - 1)) : agents.slice(0, maxVisible)
  const hidden = agents.length - visible.length
  return <AvatarGroup aria-label={`Equipe com ${agents.length} ${agents.length === 1 ? 'agente' : 'agentes'}`} className={className}>
    {visible.map(agent => onSelect || onRemove
      ? <button key={agent.id} type="button" data-slot="avatar" aria-label={onSelect ? `Ver detalhes de ${agent.name}` : `Remover ${agent.name}`} title={onSelect ? agent.name : `${agent.name} · @${agent.alias} · clique para remover`} onClick={() => (onSelect || onRemove)?.(agent)} className="rounded-full outline-none ring-2 ring-background transition-opacity hover:opacity-70 focus-visible:ring-primary">
          <Avatar agent={agent} size="xs" />
        </button>
      : <span key={agent.id} data-slot="avatar" title={`${agent.name} · @${agent.alias}`}><Avatar agent={agent} size="xs" /></span>)}
    {hidden > 0 && <AvatarGroupCount title={`${hidden} agentes não exibidos`}>+{hidden}</AvatarGroupCount>}
  </AvatarGroup>
}
