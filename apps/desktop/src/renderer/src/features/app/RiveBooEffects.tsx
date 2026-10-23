import { memo } from 'react'
import type { PoliExpression } from './PoliAvatar'

const SPECIAL = new Set(['happy', 'love', 'boop', 'sleep', 'dizzy', 'surprised'])
const HEART = 'M0 3 C-2 -3 -10 -2 -10 5 C-10 11 0 16 0 18 C0 16 10 11 10 5 C10 -2 2 -3 0 3Z'
function spiral(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 29 }, (_, step) => {
    const angle = step / 28 * Math.PI * 4
    const r = radius * step / 28
    return `${step ? 'L' : 'M'}${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}
/** SVG details exactly match PoliAvatar while all movement and body rendering run in the Rive composite. */
export const RiveBooEffects = memo(function RiveBooEffects({
  mood, expression, speaking, eyeSize, eyeSpacing, mouthSize, eyeColor, playing,
}: {
  mood: string
  expression: PoliExpression
  speaking: boolean
  eyeSize: number
  eyeSpacing: number
  mouthSize: number
  eyeColor: string
  playing: boolean
}) {
  const eyeXs = [120 - eyeSpacing, 120 + eyeSpacing]
  const special = SPECIAL.has(mood)
  const customizedEyes = eyeSize !== 8 || eyeSpacing !== 26
  const mouthTransform = `translate(120 128) scale(${mouthSize}) translate(-120 -128)`
  const stroke = { fill: 'none', stroke: eyeColor, strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const mouth = { fill: 'none', stroke: '#fff', strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <>
    {(customizedEyes || special) && <g className="poli-avatar__look">
      {(mood === 'happy' || mood === 'love') && <g {...stroke}>{eyeXs.map(cx =>
        <path key={cx} d={`M${cx-eyeSize*1.3} 98 Q${cx} ${98-eyeSize*2.2} ${cx+eyeSize*1.3} 98`} />)}</g>}
      {mood === 'boop' && <g {...stroke}>{eyeXs.map((cx, side) => {
        const reach = eyeSize * 1.3, back = side ? reach : -reach
        return <path key={cx} d={`M${cx+back} ${94-reach} L${cx-back*.6} 94 L${cx+back} ${94+reach}`} />
      })}</g>}
      {mood === 'sleep' && <g {...stroke}>{eyeXs.map(cx =>
        <path key={cx} d={`M${cx-eyeSize*1.3} 96 Q${cx} ${96+eyeSize} ${cx+eyeSize*1.3} 96`} />)}</g>}
      {mood === 'dizzy' && eyeXs.map(cx => <g key={cx} className="poli-avatar__spin">
        <path d={spiral(cx, 94, eyeSize * 1.5)} {...stroke} strokeWidth={3.5} />
      </g>)}
      {mood === 'surprised' && <g fill={eyeColor}>{eyeXs.map(cx => <circle key={cx} cx={cx} cy="92" r={eyeSize*1.35} />)}</g>}
      {!special && <g className="poli-avatar__eyes" fill={eyeColor}>{eyeXs.map(cx =>
        <ellipse key={cx} cx={cx} cy="94" rx={eyeSize} ry={eyeSize*1.5} />)}</g>}
    </g>}
    <g transform={mouthTransform}>
      {speaking && mouthSize !== 1 && <ellipse className="poli-avatar__mouth-speaking" cx="120" cy="129" rx="6" ry="5" fill="#fff" />}
      {!speaking && mood === 'idle' && expression === 'idle' && mouthSize !== 1 && <path d="M108 124 Q120 135 132 124" {...mouth} />}
      {(mood === 'happy' || mood === 'love') && <path d="M104 122 Q120 146 136 122" {...mouth} />}
      {mood === 'boop' && <path d="M108 124 Q114 133 120 125 Q126 133 132 124" {...mouth} />}
      {mood === 'surprised' && <ellipse cx="120" cy="131" rx="7" ry="9" fill="#fff" />}
      {mood === 'dizzy' && <path d="M102 129 q4.5 -6 9 0 t9 0 t9 0 t9 0" {...mouth} strokeWidth={4} />}
      {mood === 'sleep' && <ellipse className="poli-avatar__snore" cx="120" cy="128" rx="4" ry="3" fill="#fff" />}
      {!speaking && expression === 'thinking' && <ellipse cx="120" cy="128" rx="5" ry="7" fill="#fff" />}
      {!speaking && expression === 'coding' && <path d="M113 128 H127" {...mouth} />}
      {!speaking && expression === 'done' && <path d="M106 124 Q120 147 134 124" {...mouth} />}
    </g>
    {expression === 'thinking' && <g className="poli-avatar__thought" fill={eyeColor}>
      <circle cx="187" cy="34" r="5" /><circle cx="200" cy="20" r="8" />
    </g>}
    {expression === 'coding' && <>
      <path d="M51 174 l-12 -10 12 -10 M65 154 l12 10 -12 10" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <g className={playing ? 'poli-avatar__type' : ''} aria-hidden="true">
        <rect x="146" y="173" width="36" height="5" rx="2.5" fill={eyeColor} opacity=".35" />
        {[150,161,172].map((x,i) => <rect key={x} className={`poli-avatar__finger poli-avatar__finger--${i+1}`}
          x={x} y="161" width="6" height="13" rx="3" fill={eyeColor} />)}
      </g>
    </>}
    {expression === 'done' && <>
      <circle cx="183" cy="42" r="21" fill="#31bd92" />
      <path d="M172 42 l8 8 14 -17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </>}
    {(mood === 'love' || mood === 'boop') && (mood === 'love'
      ? [[176,46,0],[204,74,.35],[58,36,.7]] : [[182,40,0]]).map(([x,y,delay]) =>
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(.9)`}>
          <path className="poli-avatar__heart" d={HEART} fill="#ff5d8f" style={{ animationDelay: `${delay}s` }}/>
        </g>)}
    {mood === 'sleep' && <g fill={eyeColor} fontWeight="700">
      <text className="poli-avatar__z" x="178" y="54" fontSize="24">z</text>
      <text className="poli-avatar__z" x="196" y="30" fontSize="18" style={{ animationDelay: '1.2s' }}>z</text>
    </g>}
  </>
})
