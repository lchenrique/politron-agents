import { memo } from 'react'
import type { Agent } from '../../../../shared/v9'
import { PitsMark } from './PitsMark'
import { PoliAvatar, type PoliExpression } from './PoliAvatar'
import { MiniBoo, normalizeVariant, safeHex } from '@/shell/primitives'

export type AgentAvatarState = 'idle' | 'working' | 'waiting' | 'speaking'

export function AgentPresence({ state }: { state: AgentAvatarState }) {
  const label = state === 'speaking' ? 'Falando' : state === 'working' ? 'Trabalhando' : state === 'waiting' ? 'Aguardando aprovação' : 'Ocioso'
  return <span role="img" aria-label={label} className="agent-presence" data-state={state}>
    <i />
  </span>
}

export const Avatar = memo(function Avatar({ agent, size = 'sm', state = 'idle', expression }: { agent?: Agent; size?: 'xxs' | 'xs' | 'list' | 'sm' | 'md' | 'lg'; state?: AgentAvatarState; expression?: PoliExpression }) {
  const pixels = size === 'lg' ? 88 : size === 'md' ? 56 : size === 'sm' ? 42 : size === 'list' ? 36 : size === 'xs' ? 30 : 20
  // `avatar` guarda tanto uma imagem enviada (data:/http:) quanto o estilo do mock
  // ('classic', 'crown', …). Só o primeiro caso vira <img>.
  const custom = agent?.avatar && /^(data:|https?:|file:)/i.test(agent.avatar) ? agent.avatar : ''
  return <span data-slot="avatar" data-size={size} className="inline-flex shrink-0 items-center justify-center overflow-hidden" style={{ width: pixels, height: pixels }}>
    {custom
      ? <span className="inline-flex size-full overflow-hidden rounded-md border border-border/60" style={{ backgroundColor: agent?.color }}><img className="size-full object-cover" src={custom} alt={`Avatar de ${agent?.name}`} /></span>
      : agent
        ? <MiniBoo color={safeHex(agent.color)} variant={normalizeVariant(agent.avatar)} size={pixels} label={`${agent.name} — ${expression || state}`} />
        : <span className="inline-flex size-full items-center justify-center overflow-hidden rounded-md border border-border/60"><PitsMark className="size-full p-1" /></span>}
  </span>
})
