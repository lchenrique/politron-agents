import { memo, type CSSProperties } from 'react'
import { BooFaceAccessory, BooHeadAccessory } from './BooAccessories'
import { BOO_REFERENCE_ART } from './boo-reference-art'
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

/** Variáveis CSS de cor do Boo, compartilhadas com outras cenas (ex.: BooWorking). */
export function booColorVars(colors?: Partial<BooColors>): Record<string, string> {
  const style: Record<string, string> = {}
  for (const key of Object.keys(CSS_VAR) as (keyof BooColors)[]) style[CSS_VAR[key]] = colors?.[key] || BOO_DEFAULT_COLORS[key]
  return style
}

/** As quatro poses vêm dos contornos da imagem aprovada, não de uma aproximação. */
function referencePose(mood: BooMood) {
  return mood === 'sleep' ? BOO_REFERENCE_ART.sleep
    : mood === 'happy' || mood === 'boop' || mood === 'done' ? BOO_REFERENCE_ART.happy
      : mood === 'coding' ? BOO_REFERENCE_ART.focus : BOO_REFERENCE_ART.idle
}
const HEART = 'M0 -3 C-2 -9 -11 -9 -11 -2 C-11 4 -4 8 0 12 C4 8 11 4 11 -2 C11 -9 2 -9 0 -3 Z'
const STAR = 'M0 -7 L2 -2.4 L6.7 -2.2 L3.1 1 L4.2 5.7 L0 3.1 L-4.2 5.7 L-3.1 1 L-6.7 -2.2 L-2 -2.4 Z'
const SPARK = 'M-4 -6 L-13 -18 M-9 2 L-23 -1 M3 -10 L2 -24'
const EYES = [88.2, 154.7]

type Hand = [x: number, y: number, angle: number]
const HANDS: Partial<Record<BooMood, Hand[]>> = {
  coding: [[77, 180, -12], [163, 180, 12]],
  speaking: [[208, 143, -24]],
  done: [[208, 61, -35]],
  happy: BOO_REFERENCE_ART.happy.hands.map(hand => [hand.x, hand.y, 0] as Hand),
  surprised: [[31, 139, -20], [208, 139, 20]],
}

function spiral(cx: number, cy: number, radius: number): string {
  const steps = 26
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = step / steps * Math.PI * 4
    const r = radius * step / steps
    return `${step ? 'L' : 'M'}${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

function Hands({ mood }: { mood: BooMood }) {
  const hands = HANDS[mood]
  if (!hands) return null
  return <g aria-hidden="true">{hands.map(([x, y, angle], side) =>
    <g key={side} className={`boo__hand-position boo__hand-position--${side}`} style={{ transform: `translate(${x}px, ${y}px) rotate(${angle}deg)` }}>
      <path className="boo__hand" d={BOO_REFERENCE_ART.happy.hands[side % 2].path} />
    </g>)}</g>
}

function Mouth({ d, tongue, className }: { d: string; tongue?: string; className?: string }) {
  return <g className={className}>
    <path className="boo__mouth" d={d} />
    {tongue && <path className="boo__tongue" d={tongue} />}
    <path className="boo__mouth-edge" d={d} />
  </g>
}

function Eyes({ mood }: { mood: BooMood }) {
  if (mood === 'dizzy') return <g>{EYES.map(x => <g key={x} className="boo__spiral"><path className="boo__eye-line boo__spiral-line" d={spiral(x, 101, 13)} /></g>)}</g>
  if (mood === 'love') return <g>{EYES.map(x => <g key={x} transform={`translate(${x} 99) scale(1.3)`}><path className="boo__heart-eye" d={HEART} /></g>)}</g>
  if (mood === 'surprised') return <g className="boo__eyes">{EYES.map(x => <g key={x}>
    <ellipse className="boo__eye" cx={x} cy="101" rx="13" ry="20" />
    <circle className="boo__shine" cx={x + 3.6} cy="93" r="3.8" />
  </g>)}</g>
  const art = referencePose(mood)
  const closed = mood === 'happy' || mood === 'boop' || mood === 'done' || mood === 'sleep'
  return <g className={closed ? 'boo__eyes-closed' : 'boo__eyes'}>
    <g className={mood === 'thinking' ? 'boo__thought-gaze' : undefined}>
    {art.eyes.map((d, i) => <path key={i} className={closed ? 'boo__eye-line boo__reference-eye' : 'boo__eye'} d={d} />)}
    {art.glints.map((d, i) => <path key={i} className="boo__shine" d={d} />)}
    </g>
  </g>
}

const BROWS: Partial<Record<BooMood, string>> = {
  dizzy: 'M78.2 76 L97.2 70 M164.7 76 L145.7 70',
  surprised: 'M78.2 69 Q88.2 61 98.2 68 M144.7 68 Q154.7 61 164.7 69',
}

function MoodMouth({ mood }: { mood: BooMood }) {
  switch (mood) {
    case 'idle': case 'coding': case 'thinking': case 'happy': case 'boop': case 'done': case 'sleep':
      return <path className={`boo__reference-mouth${mood === 'sleep' ? ' boo__snore' : ''}`} d={mood === 'thinking' || mood === 'coding' ? BOO_REFERENCE_ART.idle.mouth : referencePose(mood).mouth} />
    case 'speaking': return <g transform="translate(1.4 -13)"><Mouth className="boo__talk" d="M110 127 C110 120 130 120 130 127 C130 136 125 140 120 140 C115 140 110 136 110 127 Z" tongue="M113 135 C116 131 124 131 127 135 C125 139 122 140 120 140 C118 140 115 139 113 135 Z" /></g>
    case 'dizzy': return <path className="boo__line" transform="translate(1.4 -13)" d="M106 130 q3.5 -5 7 0 t7 0 t7 0 t7 0" />
    case 'love': return <path className="boo__line" transform="translate(1.4 -9)" d="M110 126 q5 6 10 0 q5 6 10 0" />
    case 'surprised': return <g transform="translate(1.4 -13)"><Mouth d="M114 132 C114 124 126 124 126 132 C126 139 123 142 120 142 C117 142 114 139 114 132 Z" /></g>
    default:
      return <path className="boo__line" d="M113 122 Q120 128 127 122" />
  }
}

function FrontEffects({ mood }: { mood: BooMood }) {
  switch (mood) {
    case 'thinking': return <g transform="translate(192 26)" data-boo-prop="thought" aria-hidden="true">
      <circle className="boo__bubble" cx="-20" cy="24" r="3.6" />
      <circle className="boo__bubble" cx="-12" cy="15" r="5.4" />
      <rect className="boo__bubble" x="-10" y="-14" width="44" height="26" rx="13" />
      {[2, 12, 22].map((x, i) => <circle key={x} className="boo__thought-dot" cx={x} cy="-1" r="3.2" style={{ animationDelay: `${i * .18}s` }} />)}
    </g>
    case 'sleep': return <g transform="translate(184 46)" data-boo-prop="zzz" aria-hidden="true">
      {([[0, 0, .7], [12, -16, .95], [26, -34, 1.2]] as const).map(([x, y, s], i) => <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <g className="boo__z" style={{ animationDelay: `${i * .8}s` }}><path className="boo__under" d="M-5 -5 H5 L-5 5 H5" /><path className="boo__z-line" d="M-5 -5 H5 L-5 5 H5" /></g>
      </g>)}
    </g>
    case 'speaking': return <g className="boo__talk-lines" transform="translate(212 62)" aria-hidden="true"><path d="M0 0 Q6 8 0 16" /><path d="M9 -6 Q18 8 9 22" /></g>
    case 'done': return <g transform="translate(206 40)" data-boo-prop="check" aria-hidden="true"><g className="boo__pop-once">
      <path className="boo__check-under" d="M-15 0 L-4 11 L16 -14" /><path className="boo__check" d="M-15 0 L-4 11 L16 -14" />
    </g></g>
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
  /** Deformação ambiente independente dos gestos de hover. */
  liquid?: boolean
  blush?: boolean
  blushOpacity?: number
  headAccessory?: string
  faceAccessory?: string
  accessoryColors?: Record<string, string[]>
  hidden?: boolean
}

export const BooFigure = memo(function BooFigure({ mood, size, colors, label, animate = false, liquid = animate, blush = true, blushOpacity = .9, headAccessory = 'none', faceAccessory = 'none', accessoryColors, hidden }: BooFigureProps) {
  // Abaixo de 40 px (barra lateral) somem efeitos e detalhes finos.
  const detail = size >= 40
  const art = referencePose(mood)
  const tier = size < 40 ? 's' : size < 96 ? 'm' : 'l'
  const style = { width: size, height: size, ...(hidden ? { visibility: 'hidden' } : {}), ...booColorVars(colors) } as Record<string, string | number>
  const showBlush = blush && mood === 'love'
  style['--boo-liquid-rest'] = `path('${art.body}')`
  style['--boo-liquid-a'] = `path('${art.liquidA}')`
  style['--boo-liquid-b'] = `path('${art.liquidB}')`
  // Acessórios importados medem o Boo "Bolinha"; a cabeça nova é um pouco mais estreita.
  const accessory = { shape: 'round', bodyWidth: .92, bodyHeight: 1, eyeSize: 8, eyeSpacing: 33.25 / .92, mouthSize: 1, colors: accessoryColors }
  return <svg viewBox="20 0 200 200" className="boo" data-mood={mood} data-size={tier} data-animate={animate} data-liquid={liquid} style={style as CSSProperties} role="img" aria-label={label}>
    <g className="boo__float"><g className="poli-avatar__lean"><g className="boo__bounce"><g className="boo__pose">
      <path className="boo__body" d={art.body} />
      {detail && mood === 'coding' && <g className="boo__typing" aria-hidden="true">
        {[108, 120, 132].map((x, i) => <circle key={x} cx={x} cy="182" r="2.5" style={{ animationDelay: `${i * .16}s` }} />)}
      </g>}
      <g className="boo__face">
        {showBlush && EYES.map((x, side) => <g key={x} opacity={(mood === 'love' ? 1 : blushOpacity) * .5}>
          <ellipse className="boo__blush" cx={side ? x + 18 : x - 18} cy="116" rx="9" ry="4.5" />
        </g>)}
        <g className="poli-avatar__look"><Eyes mood={mood} /></g>
        {BROWS[mood] && <path className={`boo__brow boo__fine${mood === 'coding' || mood === 'thinking' ? ' boo__reference-brow' : ''}`} d={BROWS[mood]} />}
        <MoodMouth mood={mood} />
        <g transform="translate(1.4 7)"><BooFaceAccessory kind={faceAccessory} {...accessory} /></g>
      </g>
      <Hands mood={mood} />
      <BooHeadAccessory kind={headAccessory} {...accessory} />
    </g></g></g></g>
    {detail && <FrontEffects mood={mood} />}
  </svg>
})
