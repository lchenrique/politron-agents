import type { Agent } from '../../../../shared/v9'
import { PitsMark } from './PitsMark'
import { PoliAvatar } from './PoliAvatar'

export type AgentAvatarState = 'idle' | 'working' | 'waiting'

export function AgentPresence({ state }: { state: AgentAvatarState }) {
  const label = state === 'working' ? 'Trabalhando' : state === 'waiting' ? 'Aguardando aprovação' : 'Ocioso'
  return <span role="img" aria-label={label} className="agent-presence" data-state={state}>
    {state === 'working' ? <><i /><i /><i /></> : <i />}
  </span>
}

export function Avatar({ agent, size = 'sm', state = 'idle' }: { agent?: Agent; size?: 'sm' | 'md' | 'lg'; state?: AgentAvatarState }) {
  const pixels = size === 'lg' ? 64 : size === 'md' ? 36 : 28
  return <span className="inline-flex shrink-0 items-center justify-center" style={{ width: pixels, height: pixels }}>
    {agent?.avatar
      ? <span className="inline-flex size-full overflow-hidden rounded-full border border-border/60" style={{ backgroundColor: agent.color }}><img className="size-full object-cover" src={agent.avatar} alt={`Avatar de ${agent.name}`} /></span>
      : agent
        ? <PoliAvatar agent={agent} size={pixels} state={state} />
        : <span className="inline-flex size-full items-center justify-center overflow-hidden rounded-full border border-border/60"><PitsMark className="size-full p-1" /></span>}
  </span>
}
