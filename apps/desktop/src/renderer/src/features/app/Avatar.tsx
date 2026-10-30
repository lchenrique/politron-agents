import { memo } from 'react'
import type { Agent } from '../../../../shared/v9'
import { PitsMark } from './PitsMark'
import { PoliAvatar, type PoliExpression } from './PoliAvatar'

export type AgentAvatarState = 'idle' | 'working' | 'waiting' | 'speaking'

export function AgentPresence({ state }: { state: AgentAvatarState }) {
  const label = state === 'speaking' ? 'Falando' : state === 'working' ? 'Trabalhando' : state === 'waiting' ? 'Aguardando aprovação' : 'Ocioso'
  return <span role="img" aria-label={label} className="agent-presence" data-state={state}>
    <i />
  </span>
}

export const Avatar = memo(function Avatar({ agent, size = 'sm', state = 'idle', expression }: { agent?: Agent; size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg'; state?: AgentAvatarState; expression?: PoliExpression }) {
  const pixels = size === 'lg' ? 88 : size === 'md' ? 56 : size === 'sm' ? 42 : size === 'xs' ? 30 : 20
  return <span data-slot="avatar" data-size={size} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: pixels, height: pixels }}>
    {agent?.avatar
      ? <span className="inline-flex size-full overflow-hidden rounded-full border border-border/60" style={{ backgroundColor: agent.color }}><img className="size-full object-cover" src={agent.avatar} alt={`Avatar de ${agent.name}`} /></span>
      : agent
        ? <PoliAvatar agent={agent} size={pixels} state={state} expression={expression} motionPolicy={size === 'lg' ? 'hover' : 'never'} />
        : <span className="inline-flex size-full items-center justify-center overflow-hidden rounded-full border border-border/60"><PitsMark className="size-full p-1" /></span>}
  </span>
})
