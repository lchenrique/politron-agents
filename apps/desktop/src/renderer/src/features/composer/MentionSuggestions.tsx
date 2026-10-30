import { Button } from '@/components/ui/button'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar } from '../app/PoliAvatar'

export function MentionSuggestions({ id, agents, activeIndex, onSelect }: {
  id: string
  agents: Agent[]
  activeIndex: number
  onSelect: (agent: Agent) => void
}) {
  return <div id={id} role="listbox" aria-label="Mencionar agente" className="absolute bottom-[calc(100%+0.5rem)] left-2 right-2 z-50 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
    {agents.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum participante encontrado</p> : agents.map((agent, index) => <Button
      key={agent.id}
      id={`${id}-${agent.id}`}
      type="button"
      variant="ghost"
      size={null}
      role="option"
      aria-selected={index === activeIndex}
      className="flex h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-inherit hover:bg-accent hover:text-inherit aria-selected:bg-accent"
      onMouseDown={event => event.preventDefault()}
      onClick={() => onSelect(agent)}
    >
      <PoliAvatar agent={agent} size={28} />
      <span className="min-w-0 truncate font-medium">{agent.name}</span>
      <span className="ml-auto truncate text-xs text-muted-foreground">@{agent.alias}</span>
    </Button>)}
  </div>
}
