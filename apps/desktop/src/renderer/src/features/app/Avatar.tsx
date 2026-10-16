import { useId, type CSSProperties } from 'react'
import type { Agent } from '../../../../shared/v9'
import { PitsMark } from './PitsMark'

export type AgentAvatarState = 'idle' | 'working' | 'waiting'

function PitsFace({ agent, size, state }: { agent: Agent; size: number; state: AgentAvatarState }) {
  const gradientId = `agent-avatar-${useId().replace(/:/g, '')}`
  const pitsShape = agent.pitsShape || 'round'
  return <span aria-hidden="true" className="agent-avatar relative inline-flex shrink-0" data-state={state} data-shape={pitsShape} style={{ width: size, height: size, '--agent-color': agent.color } as CSSProperties}>
    <svg viewBox="0 0 48 48" className="agent-avatar__fallback size-full">
      <defs><linearGradient id={gradientId} x1="7" y1="4" x2="39" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="color-mix(in srgb, var(--agent-color) 58%, white)" /><stop offset=".52" stopColor="var(--agent-color)" /><stop offset="1" stopColor="color-mix(in srgb, var(--agent-color) 70%, black)" /></linearGradient></defs>
      <g className="agent-avatar__features">
        <path className="agent-avatar__body" fill={`url(#${gradientId})`} d="M24 3.6c-5.8 0-9.2 2.8-11 7.2-5.3 1-8.1 5-7.8 10.1-2.5 5.1-.7 10.4 3.9 13.1.8 6.3 5.2 10.1 11.4 9.7 4.2 2.2 9.8 1.5 13-2.2 6-.1 9.7-4.6 9-10.1 3.1-4.9 1.4-10.3-3.3-13.1-.4-6-4.4-9.7-10.1-9.8C28 4.9 26.2 3.6 24 3.6Z" />
        <path className="agent-avatar__shine" d="M14 12c2-3 5.1-4.6 8.6-4.8" fill="none" stroke="white" strokeLinecap="round" strokeOpacity=".32" strokeWidth="1.8" />
        <g className="agent-avatar__eyes" fill="white"><ellipse cx="17.5" cy="21.5" rx="4" ry="4.8" /><ellipse cx="30.5" cy="21.5" rx="4" ry="4.8" /></g>
        <g className="agent-avatar__pupils" fill="#17211d"><circle cx="18.3" cy="22" r="1.45" /><circle cx="31.3" cy="22" r="1.45" /></g>
        <path className="agent-avatar__mouth" d={state === 'working' ? 'M20 31h8' : state === 'waiting' ? 'M21.5 31a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0' : 'M19 30.2c1.3 1.8 3 2.7 5 2.7s3.7-.9 5-2.7'} fill="none" stroke="white" strokeLinecap="round" strokeWidth="2" />
      </g>
    </svg>
  </span>
}

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
      ? <span className="inline-flex size-full overflow-hidden rounded-full border border-border/60" style={{ backgroundColor: agent.color }}><img className="size-full object-cover" src={agent.avatar} alt="" /></span>
      : agent
        ? <PitsFace agent={agent} size={pixels} state={state} />
        : <span className="inline-flex size-full items-center justify-center overflow-hidden rounded-full border border-border/60"><PitsMark className="size-full p-1" /></span>}
  </span>
}
