import type { Agent } from '../../../../shared/v9'
import { PitsMark } from './PitsMark'

export function Avatar({ agent, size = 'sm' }: { agent?: Agent; size?: 'sm' | 'md' }) {
  const classes = size === 'md' ? 'size-9 text-sm' : 'size-7 text-[10px]'
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 font-semibold ${classes}`} style={{ backgroundColor: agent?.color || 'hsl(var(--muted))', color: 'white' }}>
    {agent?.avatar ? <img className="size-full object-cover" src={agent.avatar} alt="" /> : agent?.name?.slice(0, 1).toLocaleUpperCase('pt-BR') || <PitsMark className="size-full p-1" />}
  </span>
}
