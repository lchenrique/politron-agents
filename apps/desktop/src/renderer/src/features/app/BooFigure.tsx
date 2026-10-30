import { memo, useId, type CSSProperties } from 'react'
import { BooFaceAccessory, BooHeadAccessory } from './BooAccessories'
import './BooFigure.css'

/** Os 11 estados desenhados do Boo; PoliAvatar decide qual mostrar. */
export type BooMood = 'idle' | 'coding' | 'thinking' | 'speaking' | 'done' | 'happy' | 'boop' | 'dizzy' | 'love' | 'surprised' | 'sleep'
export const BOO_MOODS: BooMood[] = ['idle', 'coding', 'thinking', 'speaking', 'done', 'happy', 'boop', 'dizzy', 'love', 'surprised', 'sleep']

export type BooColors = {
  body: string; outline: string; eye: string; blush: string; mouth: string; tongue: string
  accent: string; accent2: string; code: string; check: string; heart: string; spark: string
}
export const BOO_DEFAULT_COLORS: BooColors = {
  body: '#ffffff', outline: '#1a1a1f', eye: '#0d0d12', blush: '#f7a1b5', mouth: '#3a1a22', tongue: '#ff7a8a',
  accent: '#3aa7ff', accent2: '#7b5cff', code: '#39ff8a', check: '#34c759', heart: '#ff5d8f', spark: '#ffd23f',
}
const CSS_VAR: Record<keyof BooColors, string> = {
  body: '--boo-body', outline: '--boo-outline', eye: '--boo-eye', blush: '--boo-blush', mouth: '--boo-mouth', tongue: '--boo-tongue',
  accent: '--boo-accent', accent2: '--boo-accent-2', code: '--boo-code', check: '--boo-check', heart: '--boo-heart', spark: '--boo-spark',
}

/* Desenho em viewBox 20 0 200 200, centro x = 120. Cabeça e olhos coincidem com o Boo "Bolinha"
   dos acessórios importados (olhos em y 94, boca em y 128), então chapéus e óculos continuam encaixando. */
const BODY = 'M120 16 C166 16 192 46 192 90 C192 120 194 140 202 158 C207 170 197 182 186 176 C179 188 163 190 155 179 C147 191 131 192 124 181 C116 192 100 191 92 180 C83 190 66 188 59 177 C46 181 35 170 40 158 C47 140 48 120 48 90 C48 46 74 16 120 16 Z'
const HEM = 'M20 165 C56 155 84 172 120 164 C156 156 184 174 220 161 V200 H20 Z'
const MITTEN = 'M-4 -10 C8 -13 22 -13 30 -8 C38 -3 37 9 28 11 C16 13 4 11 -4 9 C-10 7 -10 -8 -4 -10 Z'
const LONG_MITTEN = 'M-4 -10 C14 -13 44 -13 54 -8 C62 -3 61 9 52 11 C34 13 4 11 -4 9 C-10 7 -10 -8 -4 -10 Z'
const HEART = 'M0 -3 C-2 -9 -11 -9 -11 -2 C-11 4 -4 8 0 12 C4 8 11 4 11 -2 C11 -9 2 -9 0 -3 Z'
const STAR = 'M0 -7 L2 -2.4 L6.7 -2.2 L3.1 1 L4.2 5.7 L0 3.1 L-4.2 5.7 L-3.1 1 L-6.7 -2.2 L-2 -2.4 Z'
const QUESTION = 'M-5 -4 C-5 -11 5 -11 5 -4 C5 0 0 1 0 5'
const SPARK = 'M-4 -6 L-13 -18 M-9 2 L-23 -1 M3 -10 L2 -24'
const GHOST_ICON = 'M-5 5 V-1 C-5 -8 5 -8 5 -1 V5 L2.5 3 L0 5 L-2.5 3 Z M-2 -1.5 V-1 M2 -1.5 V-1'
const EYES = [98, 142]

/** Braço = [x, y, ângulo, longo, na frente do corpo]; o ombro fica na origem do desenho do braço. */
type Arm = [x: number, y: number, angle: number, long?: boolean, front?: boolean]
const ARMS: Record<BooMood, [left: Arm, right: Arm]> = {
  idle: [[54, 126, 165], [186, 122, -38]],
  happy: [[56, 118, -120], [184, 118, -60]],
  boop: [[54, 120, -152], [186, 120, -28]],
  surprised: [[54, 118, -132], [186, 118, -48]],
  speaking: [[54, 128, 160], [186, 124, -12]],
  thinking: [[50, 146, -12, true, true], [188, 128, 40]],
  coding: [[52, 140, 50, false, true], [188, 140, 130, false, true]],
  done: [[50, 148, -10, true, true], [190, 140, 190, true, true]],
  love: [[50, 140, -38, false, true], [190, 140, -142, false, true]],
  dizzy: [[52, 128, 158], [188, 128, 22]],
  sleep: [[60, 140, 85], [180, 140, 95]],
}

function spiral(cx: number, cy: number, radius: number): string {
  const steps = 26
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = step / steps * Math.PI * 4
    const r = radius * step / steps
    return `${step ? 'L' : 'M'}${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const angle = i / 16 * Math.PI * 2 + .3
  const radius = 84 + (i % 3) * 12
  const x = 120 + Math.cos(angle) * radius
  const y = 100 + Math.sin(angle) * radius * .85
  return { x, y, rot: (i * 47) % 180, tone: i % 6 }
})

function Arms({ arms, layer }: { arms: [Arm, Arm]; layer: 'back' | 'front' }) {
  return <>{arms.map(([x, y, angle, long, front], side) =>
    <g key={side} className={`boo__arm boo__arm--${side ? 'r' : 'l'}`} data-front={!!front} style={{ transform: `translate(${x}px, ${y}px) rotate(${angle}deg)` }}>
      <g className="boo__arm-move"><path className={layer === 'back' ? 'boo__limb' : 'boo__limb-cover'} d={long ? LONG_MITTEN : MITTEN} /></g>
    </g>)}</>
}

function Mouth({ d, tongue, className }: { d: string; tongue?: string; className?: string }) {
  return <g className={className}>
    <path className="boo__mouth" d={d} />
    {tongue && <path className="boo__tongue" d={tongue} />}
    <path className="boo__mouth-edge" d={d} />
  </g>
}

function Headset({ detail }: { detail: boolean }) {
  return <g className="boo__headset" data-boo-accessory="headset" aria-label="Headset do Boo">
    <path className="boo__band" d="M47 98 C42 48 76 12 120 12 C164 12 198 48 193 98" />
    <path className="boo__visor" d="M59 53 Q120 20 181 53 L178 73 Q120 45 62 73 Z" />
    <path className="boo__visor-tint" d="M128 31 Q160 34 176 51 L174.5 61 Q156 46 130 41 Z" />
    <path className="boo__visor-rim boo__glow" d="M65.5 55.5 Q120 27 174.5 55.5 L172.5 67 Q120 42 67.5 67 Z" />
    {detail && <g className="boo__glow"><path className="boo__prompt" d="M101 41 L108.5 45.5 L101 50" /><path className="boo__prompt boo__cursor" d="M113 52.5 H123" /></g>}
    {[49, 191].map(x => <g key={x} transform={`translate(${x} 101)`}>
      <circle className="boo__cup" r="19" />
      <circle className="boo__cup-ring boo__glow" r="12.5" />
      {detail && <path className="boo__cup-icon boo__glow" d={GHOST_ICON} />}
    </g>)}
  </g>
}

function Eyes({ mood }: { mood: BooMood }) {
  if (mood === 'happy' || mood === 'boop' || mood === 'done') return <g className="boo__eyes-closed">{EYES.map(x => <path key={x} className="boo__eye-line" d={`M${x - 10} 98 Q${x} 83 ${x + 10} 98`} />)}</g>
  if (mood === 'sleep') return <g className="boo__eyes-closed">{EYES.map(x => <path key={x} className="boo__eye-line" d={`M${x - 10} 95 Q${x} 103 ${x + 10} 95`} />)}</g>
  if (mood === 'dizzy') return <g>{EYES.map(x => <g key={x} className="boo__spiral"><path className="boo__eye-line boo__spiral-line" d={spiral(x, 94, 13)} /></g>)}</g>
  if (mood === 'love') return <g>{EYES.map(x => <g key={x} transform={`translate(${x} 92) scale(1.3)`}><path className="boo__heart-eye" d={HEART} /><circle className="boo__shine" cx="-5" cy="-3" r="2.2" /></g>)}</g>
  const wide = mood === 'surprised'
  return <g className="boo__eyes">{EYES.map(x => <g key={x}>
    <ellipse className="boo__eye" cx={x} cy={wide ? 92 : 94} rx={wide ? 13 : 11.5} ry={wide ? 17 : 15.5} />
    <circle className="boo__shine boo__fine" cx={x - 3.5} cy={wide ? 85 : 87.5} r={wide ? 5 : 4.6} />
  </g>)}</g>
}

const BROWS: Partial<Record<BooMood, string>> = {
  coding: 'M86 73 L108 80 M154 73 L132 80',
  thinking: 'M87 72 Q97 63 108 69 M132 77 L153 73',
  dizzy: 'M88 76 L107 70 M152 76 L133 70',
  surprised: 'M88 69 Q98 61 108 68 M132 68 Q142 61 152 69',
}

function MoodMouth({ mood }: { mood: BooMood }) {
  switch (mood) {
    case 'happy': case 'boop':
      return <Mouth d="M102 117 C110 120 130 120 138 117 C137 136 129 145 120 145 C111 145 103 136 102 117 Z" tongue="M108 136 C112 129 128 129 132 136 C128 142 124 145 120 145 C116 145 112 142 108 136 Z" />
    case 'coding': return <path className="boo__line" d="M112 125 Q120 131 128 125" />
    case 'thinking': return <path className="boo__line" d="M113 130 Q120 125 127 130" />
    case 'speaking': return <Mouth className="boo__talk" d="M110 127 C110 120 130 120 130 127 C130 136 125 140 120 140 C115 140 110 136 110 127 Z" tongue="M113 135 C116 131 124 131 127 135 C125 139 122 140 120 140 C118 140 115 139 113 135 Z" />
    case 'done': return <path className="boo__line" d="M108 122 Q120 134 132 122" />
    case 'dizzy': return <path className="boo__line" d="M106 130 q3.5 -5 7 0 t7 0 t7 0 t7 0" />
    case 'love': return <path className="boo__line" d="M110 126 q5 6 10 0 q5 6 10 0" />
    case 'surprised': return <Mouth d="M114 132 C114 124 126 124 126 132 C126 139 123 142 120 142 C117 142 114 139 114 132 Z" />
    case 'sleep': return <Mouth className="boo__snore" d="M115 130 C115 125 125 125 125 130 C125 135 123 137 120 137 C117 137 115 135 115 130 Z" />
    default:
      return <Mouth d="M107 119 C112 122 128 122 133 119 C133 133 127 140 120 140 C113 140 107 133 107 119 Z" tongue="M111 133 C114 128 126 128 129 133 C126 138 123 140 120 140 C117 140 114 138 111 133 Z" />
  }
}

/** Efeitos de cada estado; só montados quando o estado pede e o avatar é grande o bastante. */
function BackEffects({ mood, clipId }: { mood: BooMood; clipId: string }) {
  if (mood !== 'coding') return null
  return <g className="boo__rain" aria-hidden="true" data-boo-prop="code" clipPath={`url(#${clipId})`}>
    <defs><clipPath id={clipId}><rect x="22" y="2" width="196" height="156" rx="12" /></clipPath></defs>
    {[28, 44, 60, 180, 196, 212].map((x, column) =>
      <g key={x} className="boo__rain-col" style={{ animationDelay: `${-column * .37}s`, animationDuration: `${1.3 + (column % 3) * .35}s` }}>
        {Array.from({ length: 9 }, (_, row) => <rect key={row} x={x - (row % 2 ? 1.25 : 2.5)} y={-48 + row * 24 + (row % 2) * 7 + (column % 2) * 5} width={row % 2 ? 2.5 : 5} height={row % 2 ? 9 : 7} rx="1.5" opacity={(row + column) % 3 ? .9 : .5} />)}
      </g>)}
  </g>
}

function FrontEffects({ mood }: { mood: BooMood }) {
  switch (mood) {
    case 'thinking': return <g data-boo-prop="idea" aria-hidden="true">
      {([[52, 46, -14, 1], [72, 22, 8, .75], [196, 80, 12, .85]] as const).map(([x, y, r, s], i) =>
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}><g className="boo__pop" style={{ animationDelay: `${-i * .7}s` }}>
          <path className="boo__under" d={QUESTION} /><path className="boo__q" d={QUESTION} /><circle className="boo__q-dot" cy="11" r="2.6" />
        </g></g>)}
      <g transform="translate(190 34)"><g className="boo__pop" data-boo-prop="bulb" style={{ animationDelay: '-1.4s' }}>
        <path className="boo__rays" d="M0 -22 V-16 M15 -15 L11 -11 M-15 -15 L-11 -11 M21 -1 H16 M-21 -1 H-16" />
        <path className="boo__bulb" d="M-7 6 C-14 1 -12 -12 0 -12 C12 -12 14 1 7 6 V9 H-7 Z" />
        <rect className="boo__bulb-base" x="-6" y="9" width="12" height="6" rx="2" />
      </g></g>
    </g>
    case 'speaking': return <g className="boo__talk-lines" transform="translate(212 62)" aria-hidden="true"><path d="M0 0 Q6 8 0 16" /><path d="M9 -6 Q18 8 9 22" /></g>
    case 'done': return <g transform="translate(206 40)" data-boo-prop="check" aria-hidden="true"><g className="boo__pop-once">
      <path className="boo__check-under" d="M-15 0 L-4 11 L16 -14" /><path className="boo__check" d="M-15 0 L-4 11 L16 -14" />
    </g></g>
    case 'happy': case 'boop': return <g data-boo-prop="confetti" aria-hidden="true">
      {CONFETTI.map(({ x, y, rot, tone }, i) => <rect key={i} className={`boo__confetto boo__tone-${tone}`} x={x - 3.2} y={y - 1.9} width="6.4" height="3.8" rx="1"
        style={{ '--dx': `${(120 - x).toFixed(1)}px`, '--dy': `${(100 - y).toFixed(1)}px`, '--rot': `${rot}deg`, animationDelay: `${-(i % 4) * .04}s` } as CSSProperties} />)}
      {mood === 'boop' && <g transform="translate(167 118)" data-boo-prop="finger"><g className="boo__poke">
        <path className="boo__finger" d="M37 -21 C47 -27 63 -23 65 -9 C67 3 57 9 47 7 C41 6 37 1 38 -5 Z" />
        <path className="boo__finger" d="M0 0 C-2 -5 3 -8 7 -7 L39 -14 C45 -15 47 -6 41 -4 L9 5 C5 6 1 4 0 0 Z" />
      </g></g>}
    </g>
    case 'dizzy': return <g transform="translate(120 10)" data-boo-prop="stars" aria-hidden="true">
      <ellipse className="boo__halo-ring" rx="46" ry="10" />
      {[0, 1, 2, 3].map(i => {
        const angle = i * Math.PI / 2 + .6
        return <g key={i} className="boo__orbit-x" style={{ '--sx': `${(Math.cos(angle) * 46).toFixed(1)}px`, animationDelay: `${-i * .4}s` } as CSSProperties}>
          <g className="boo__orbit-y" style={{ '--sy': `${(Math.sin(angle) * 10).toFixed(1)}px`, animationDelay: `${-i * .4 - .4}s` } as CSSProperties}><path className="boo__star" d={STAR} /></g>
        </g>
      })}
    </g>
    case 'love': return <g data-boo-prop="hearts" aria-hidden="true">
      {([[60, 48, .9], [84, 22, .6], [166, 24, .75], [194, 52, 1]] as const).map(([x, y, s], i) =>
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}><path className="boo__heart" d={HEART} style={{ animationDelay: `${-i * .55}s` }} /></g>)}
    </g>
    case 'surprised': return <g data-boo-prop="sparks" aria-hidden="true">
      {([[60, 42, 1], [180, 42, -1]] as const).map(([x, y, flip]) => <g key={x} transform={`translate(${x} ${y}) scale(${flip} 1)`}><g className="boo__flash">
        <path className="boo__under" d={SPARK} /><path className="boo__spark" d={SPARK} />
      </g></g>)}
    </g>
    case 'sleep': return <g data-boo-prop="zzz" aria-hidden="true">
      {([['z', 150, 74, 15], ['Z', 166, 58, 20], ['Z', 186, 40, 26]] as const).map(([letter, x, y, fontSize], i) =>
        <text key={i} className="boo__z" x={x} y={y} fontSize={fontSize} style={{ animationDelay: `${-i * .8}s` }}>{letter}</text>)}
    </g>
    default: return null
  }
}

export type BooFigureProps = {
  mood: BooMood
  size: number
  colors?: Partial<BooColors>
  label: string
  /** Liga as animações em laço; sem ela o Boo fica parado e os efeitos aparecem estáticos. */
  animate?: boolean
  headset?: boolean
  blush?: boolean
  blushOpacity?: number
  headAccessory?: string
  faceAccessory?: string
  accessoryColors?: Record<string, string[]>
  hidden?: boolean
}

export const BooFigure = memo(function BooFigure({ mood, size, colors, label, animate = false, headset = true, blush = true, blushOpacity = .9, headAccessory = 'none', faceAccessory = 'none', accessoryColors, hidden }: BooFigureProps) {
  const id = 'boo-' + useId().replace(/:/g, '')
  // Abaixo de 40 px (barra lateral) somem efeitos e detalhes finos; o contorno fica mais grosso.
  const detail = size >= 40
  const tier = size < 40 ? 's' : size < 96 ? 'm' : 'l'
  const arms = ARMS[mood]
  const style = { width: size, height: size, ...(hidden ? { visibility: 'hidden' } : {}) } as Record<string, string | number>
  for (const key of Object.keys(CSS_VAR) as (keyof BooColors)[]) style[CSS_VAR[key]] = colors?.[key] || BOO_DEFAULT_COLORS[key]
  const showBlush = blush || mood === 'love'
  // Acessórios importados medem o Boo "Bolinha"; a cabeça nova é um pouco mais estreita.
  const accessory = { shape: 'round', bodyWidth: .92, bodyHeight: 1, eyeSize: 8, eyeSpacing: 22 / .92, mouthSize: 1, colors: accessoryColors }
  return <svg viewBox="20 0 200 200" className="boo" data-mood={mood} data-size={tier} data-animate={animate} style={style as CSSProperties} role="img" aria-label={label}>
    {detail && <BackEffects mood={mood} clipId={`${id}-rain`} />}
    <g className="boo__float"><g className="poli-avatar__lean"><g className="boo__bounce"><g className="boo__pose">
      <Arms arms={arms} layer="back" />
      <defs><clipPath id={`${id}-body`}><path d={BODY} /></clipPath></defs>
      <path className="boo__body" d={BODY} />
      <path className="boo__hem" d={HEM} clipPath={`url(#${id}-body)`} />
      <path className="boo__body-edge" d={BODY} />
      {detail && mood === 'coding' && <g className="boo__keyboard" data-boo-prop="keyboard">
        <path className="boo__kb-plate" d="M72 166 H168 L182 190 H58 Z" />
        <path className="boo__kb-keys" d="M67 174 H173 M62.5 182 H177.5 M94 166 L88 190 M113 166 L111 190 M127 166 L129 190 M146 166 L152 190" />
      </g>}
      <Arms arms={arms} layer="front" />
      <g className="boo__face">
        {showBlush && EYES.map((x, side) => <g key={x} opacity={mood === 'love' ? 1 : blushOpacity}>
          <ellipse className="boo__blush" cx={side ? x + 18 : x - 18} cy="120" rx={mood === 'love' ? 13 : 11} ry={mood === 'love' ? 7.5 : 6.5} />
          <ellipse className="boo__blush-shine boo__fine" cx={side ? x + 15 : x - 21} cy="118" rx="3.4" ry="1.6" transform={`rotate(-20 ${side ? x + 15 : x - 21} 118)`} />
        </g>)}
        <g className="poli-avatar__look"><Eyes mood={mood} /></g>
        {BROWS[mood] && <path className="boo__brow boo__fine" d={BROWS[mood]} />}
        <MoodMouth mood={mood} />
        <BooFaceAccessory kind={faceAccessory} {...accessory} />
      </g>
      {headset && headAccessory !== 'headphones' && <Headset detail={detail} />}
      <BooHeadAccessory kind={headAccessory} {...accessory} />
    </g></g></g></g>
    {detail && <FrontEffects mood={mood} />}
  </svg>
})
