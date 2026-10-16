import { useId, type CSSProperties } from 'react'
import type { Agent } from '../../../../shared/v9'
import './PoliAvatar.css'

export type PoliExpression = 'idle' | 'thinking' | 'coding' | 'done'

function mix(hex: string, target: number, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  return '#' + [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * (1 - amount) + target * amount).toString(16).padStart(2, '0')).join('')
}

/** Rosto SVG criado a partir do Poli Studio fornecido pelo usuário. */
export function PoliAvatar({ agent, size = 36, state = 'idle', expression }: {
  agent: Agent
  size?: number
  state?: 'idle' | 'working' | 'waiting'
  expression?: PoliExpression
}) {
  const gradientId = 'poli-' + useId().replace(/:/g, '')
  const color = agent.color || '#786bea'
  const eyeColor = agent.pitsEyeColor || '#ffffff'
  const cheek = agent.pitsCheekColor || '#f5a5d1'
  const eyeSize = Math.max(4, Math.min(15, agent.pitsEyeSize ?? 8))
  const eyeSpacing = Math.max(16, Math.min(42, agent.pitsEyeSpacing ?? 26))
  const animate = agent.pitsAnimate !== false
  const showBlush = agent.pitsBlush !== false
  const showAura = agent.pitsAura !== false
  const face = expression || (state === 'working' ? 'coding' : state === 'waiting' ? 'thinking' : 'idle')
  const shape = agent.pitsShape || 'round'
  const style = {
    '--poli-speed': `${Math.max(1, Math.min(6, agent.pitsSpeed ?? 3))}s`,
    '--poli-amplitude': `-${(Math.max(0, Math.min(24, agent.pitsAmplitude ?? 9)) * size / 180).toFixed(2)}px`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <span className="poli-avatar inline-flex shrink-0 items-center justify-center" style={style} data-animate={animate} data-shape={shape} data-state={state}>
      <svg viewBox="0 0 240 210" className="size-full overflow-visible" role="img" aria-label={`${agent.name || 'Poli'} — ${face}`}>
        <defs>
          <radialGradient id={gradientId} cx="30%" cy="20%" r="85%">
            <stop offset="0" stopColor={mix(color, 255, .46)} />
            <stop offset=".52" stopColor={color} />
            <stop offset="1" stopColor={mix(color, 0, .39)} />
          </radialGradient>
        </defs>
        <ellipse cx="120" cy="190" rx="54" ry="9" fill={color} opacity=".15" />
        <g className="poli-avatar__float">
          {showAura && <circle className="poli-avatar__aura" cx="120" cy="98" r="83" fill={color} opacity=".12" />}
          <g className="poli-avatar__shape">
            <path d="M63 46 Q120 -8 177 46 Q205 71 201 111 Q197 169 120 174 Q43 169 39 111 Q35 71 63 46" fill={`url(#${gradientId})`} />
            <ellipse cx="91" cy="43" rx="37" ry="13" transform="rotate(-24 91 43)" fill="#fff" opacity=".22" />
            {showBlush && <>
              <ellipse cx="77" cy="118" rx="14" ry="7" fill={cheek} opacity=".45" />
              <ellipse cx="163" cy="118" rx="14" ry="7" fill={cheek} opacity=".45" />
            </>}
            <g className="poli-avatar__eyes" fill={eyeColor}>
              <ellipse cx={120 - eyeSpacing} cy="94" rx={eyeSize} ry={eyeSize * 1.5} />
              <ellipse cx={120 + eyeSpacing} cy="94" rx={eyeSize} ry={eyeSize * 1.5} />
            </g>
            {face === 'idle' && <path d="M108 124 Q120 135 132 124" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />}
            {face === 'thinking' && <>
              <ellipse cx="120" cy="128" rx="5" ry="7" fill="#fff" />
              <g className="poli-avatar__thought"><circle cx="187" cy="34" r="5" fill={eyeColor} /><circle cx="200" cy="20" r="8" fill={eyeColor} /></g>
            </>}
            {face === 'coding' && <>
              <path d="M113 128 H127" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <path d="M51 174 l-12 -10 12 -10 M65 154 l12 10 -12 10" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </>}
            {face === 'done' && <>
              <path d="M106 124 Q120 147 134 124" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <circle cx="183" cy="42" r="21" fill="#31bd92" />
              <path d="M172 42 l8 8 14 -17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </>}
            <circle cx="55" cy="63" r="3" fill="#fff" opacity=".55" />
          </g>
        </g>
      </svg>
    </span>
  )
}
