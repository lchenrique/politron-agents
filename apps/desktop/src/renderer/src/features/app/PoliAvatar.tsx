import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Agent } from '../../../../shared/v9'
import { STARTLE_EVENT, usePoliDrowsy, usePoliGaze } from './usePoliGaze'
import { useAvatarActivity } from './useAvatarActivity'
import { BOO_BODY_PATHS } from './boo-appearance'
import './PoliAvatar.css'

export type PoliExpression = 'idle' | 'thinking' | 'coding' | 'done'
type Reaction = 'boop' | 'dizzy' | 'love' | 'surprised'
type Mood = PoliExpression | Reaction | 'happy' | 'sleep'

const REACTION_MS: Record<Reaction, number> = { boop: 900, dizzy: 2200, love: 2600, surprised: 900 }
const PRESS_WINDOW_MS = 1200
const PET_WINDOW_MS = 1200
const HEART = 'M0 3 C-2 -3 -10 -2 -10 5 C-10 11 0 16 0 18 C0 16 10 11 10 5 C10 -2 2 -3 0 3Z'
const SPECIAL_EYES: Mood[] = ['happy', 'love', 'boop', 'sleep', 'dizzy', 'surprised']

function mix(hex: string, target: number, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  return '#' + [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * (1 - amount) + target * amount).toString(16).padStart(2, '0')).join('')
}

function spiral(cx: number, cy: number, radius: number): string {
  const steps = 28
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = step / steps * Math.PI * 4
    const r = radius * step / steps
    return `${step ? 'L' : 'M'}${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

/** Rosto SVG criado a partir do Boo Studio fornecido pelo usuário. */
/** Memoizado: um Pit renderizado 2-3x por tela (cabeçalho, prévia, chat) não deve recalcular a cada tecla digitada em um campo que não o afeta. */
export const PoliAvatar = memo(function PoliAvatar({ agent, size = 36, state = 'idle', expression, motionPolicy = 'auto' }: {
  agent: Agent
  size?: number
  state?: 'idle' | 'working' | 'waiting' | 'speaking'
  expression?: PoliExpression
  motionPolicy?: 'auto' | 'hover' | 'gaze' | 'never'
}) {
  const gradientId = 'poli-' + useId().replace(/:/g, '')
  const ref = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const color = agent.color || '#786bea'
  const eyeColor = agent.pitsEyeColor || '#ffffff'
  const cheek = agent.pitsCheekColor || '#f5a5d1'
  const eyeSize = Math.max(4, Math.min(15, agent.pitsEyeSize ?? 8))
  const eyeSpacing = Math.max(16, Math.min(42, agent.pitsEyeSpacing ?? 26))
  const active = useAvatarActivity(ref, agent.pitsAnimate !== false && (motionPolicy !== 'never' || state === 'speaking'))
  const animate = active && (motionPolicy === 'auto' || ((motionPolicy === 'hover' || motionPolicy === 'gaze') && hovered) || state === 'speaking')
  const followPointer = active && (animate || motionPolicy === 'gaze')
  const showBlush = agent.pitsBlush !== false
  const showAura = agent.pitsAura !== false
  const face = expression || (state === 'working' ? 'coding' : state === 'waiting' ? 'thinking' : 'idle')
  const calm = !expression && face === 'idle'
  const playful = calm && animate
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const reactionRef = useRef<Reaction | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const presses = useRef<number[]>([])
  const pet = useRef({ x: 0, direction: 0, flips: [] as number[] })
  const drowsy = usePoliDrowsy(playful)
  usePoliGaze(ref, followPointer)

  const react = useCallback((kind: Reaction) => {
    clearTimeout(timer.current)
    reactionRef.current = kind
    setReaction(kind)
    timer.current = setTimeout(() => { reactionRef.current = null; setReaction(null) }, REACTION_MS[kind])
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const element = ref.current
    if (!element || !playful) return
    const onStartle = () => { if (!reactionRef.current) react('surprised') }
    element.addEventListener(STARTLE_EVENT, onStartle)
    return () => element.removeEventListener(STARTLE_EVENT, onStartle)
  }, [playful, react])

  /** Clique dá um "boop"; três cliques rápidos deixam o Boo tonto. */
  const onPress = () => {
    if (!playful) return
    const now = Date.now()
    presses.current = [...presses.current.filter(at => now - at < PRESS_WINDOW_MS), now]
    if (presses.current.length >= 3) { presses.current = []; react('dizzy') }
    else if (reactionRef.current !== 'dizzy') react('boop')
  }

  /** Passar o mouse de um lado para o outro em cima dele conta como carinho. */
  const onPet = (event: ReactPointerEvent) => {
    if (!playful || reactionRef.current === 'dizzy') return
    const petting = pet.current
    const dx = event.clientX - petting.x
    petting.x = event.clientX
    if (Math.abs(dx) < 2) return
    const direction = Math.sign(dx)
    if (petting.direction && direction !== petting.direction) {
      const now = Date.now()
      petting.flips = [...petting.flips.filter(at => now - at < PET_WINDOW_MS), now]
      if (petting.flips.length >= 4) { petting.flips = []; react('love') }
    }
    petting.direction = direction
  }

  const mood: Mood = state === 'speaking' ? 'idle' : !calm ? face : (playful && reaction) || (hovered ? 'happy' : playful && drowsy ? 'sleep' : 'idle')
  const eyeXs = [120 - eyeSpacing, 120 + eyeSpacing]
  const stroke = { fill: 'none', stroke: eyeColor, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const mouth = { fill: 'none', stroke: '#fff', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const blushOpacity = mood === 'love' ? Math.max(.85, agent.pitsBlushStrength ?? .45) : Math.max(0, Math.min(1, agent.pitsBlushStrength ?? .45))
  const shape = agent.pitsShape || 'round'

  const headAccessory = agent.pitsHeadAccessory ?? (agent.pitsAccessory === 'glasses' ? 'none' : agent.pitsAccessory || 'none')
  const faceAccessory = agent.pitsFaceAccessory ?? (agent.pitsAccessory === 'glasses' ? 'glasses' : 'none')
  const bodyWidth = Math.max(.75, Math.min(1.25, agent.pitsBodyWidth ?? 1))
  const bodyHeight = Math.max(.75, Math.min(1.25, agent.pitsBodyHeight ?? 1))
  const mouthSize = Math.max(.65, Math.min(1.6, agent.pitsMouthSize ?? 1))
  const mouthTransform = 'translate(120 128) scale(' + mouthSize + ') translate(-120 -128)'
  // Mesmo pivô do corpo, aura e reflexos, no centro do viewBox (28 + 185 / 2 ≈ 120).
  const bodyTransform = `translate(120 100) scale(${bodyWidth} ${bodyHeight}) translate(-120 -100)`

  const style = {
    '--poli-speed': `${Math.max(1, Math.min(6, agent.pitsSpeed ?? 3))}s`,
    '--poli-amplitude': `-${(Math.max(0, Math.min(24, agent.pitsAmplitude ?? 9)) * size / 180).toFixed(2)}px`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <span ref={ref} className="poli-avatar inline-flex shrink-0 items-center justify-center" style={style} data-animate={animate} data-motion-active={animate} data-shape={shape} data-state={state} data-hover={hovered} data-mood={mood}
      onPointerEnter={event => { pet.current = { x: event.clientX, direction: 0, flips: [] }; setHovered(true) }}
      onPointerLeave={() => setHovered(false)} onPointerDown={onPress} onPointerMove={onPet}>
      <svg viewBox="28 0 185 200" className="size-full overflow-visible" role="img" aria-label={`${agent.name || 'Boo'} — ${mood}`}>
        <defs>
          <radialGradient id={gradientId} cx="30%" cy="20%" r="85%">
            <stop offset="0" stopColor={mix(color, 255, .46)} />
            <stop offset=".52" stopColor={color} />
            <stop offset="1" stopColor={mix(color, 0, .39)} />
          </radialGradient>
          <radialGradient id={`${gradientId}-glow`}>
            <stop offset="0" stopColor={color} stopOpacity=".24" />
            <stop offset=".72" stopColor={color} stopOpacity=".16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="120" cy="190" rx={54 * bodyWidth} ry="9" fill={color} opacity=".15" />
        <g className="poli-avatar__float">
          <g className="poli-avatar__lean">
            <g className="poli-avatar__body-transform" transform={bodyTransform}>
              {showAura && <>
                <ellipse className="poli-avatar__glow" cx="120" cy="100" rx="100" ry="100" fill={`url(#${gradientId}-glow)`} />
                <circle className="poli-avatar__aura" cx="120" cy="98" r="83" fill={color} opacity=".12" />
              </>}
              <g className="poli-avatar__shape">
                <path d={BOO_BODY_PATHS[shape]} fill={`url(#${gradientId})`} />
            <ellipse cx="91" cy="43" rx="37" ry="13" transform="rotate(-24 91 43)" fill="#fff" opacity=".22" />
            {headAccessory === 'antenna' && <g aria-label="Antena do Boo" stroke={color} strokeWidth="8" strokeLinecap="round"><path d="M120 35 Q112 7 120 -1" fill="none" /><circle cx="120" cy="-1" r="10" fill="#f8d463" stroke="none" /></g>}
            {headAccessory === 'horns' && <g aria-label="Chifres do Boo" fill={color}><path d="M58 59 Q38 22 45 3 Q54 24 84 38 Z" /><path d="M182 59 Q202 22 195 3 Q186 24 156 38 Z" /></g>}
            {headAccessory === 'cap' && <g aria-label="Boné do Boo"><path d="M61 51 Q74 10 123 12 Q172 12 182 51 L175 58 Q120 44 65 58 Z" fill="#354d6a" /><path d="M105 52 Q157 42 203 58 Q169 75 114 65 Z" fill="#26384f" /></g>}
            {headAccessory === 'cap-flat' && <g aria-label="Boné reto do Boo"><path d="M65 49 Q78 12 120 14 Q163 12 178 49 L174 57 Q120 43 66 57 Z" fill="#344f79" /><path d="M111 51 L209 51 Q207 63 163 66 L112 62 Z" fill="#263650" /></g>}
            {headAccessory === 'cap-back' && <g aria-label="Boné para trás do Boo"><path d="M63 52 Q76 12 122 13 Q168 12 180 53 L171 62 Q119 44 66 61 Z" fill="#365270" /><path d="M68 52 L31 57 L31 65 Q64 74 94 57 Z" fill="#23364b" /><path d="M108 20 L132 20" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" /></g>}
            {headAccessory === 'beanie' && <g aria-label="Gorro do Boo"><path d="M56 66 Q52 10 120 6 Q189 10 184 66 Z" fill="#a45f9c" /><rect x="55" y="54" width="131" height="20" rx="10" fill="#784272" /><circle cx="120" cy="4" r="13" fill="#cf84b6" /></g>}
            {headAccessory === 'bucket' && <g aria-label="Chapéu bucket do Boo"><path d="M69 21 Q120 4 171 21 L182 59 Q120 72 58 59 Z" fill="#4d9c82" /><path d="M51 60 Q120 48 189 60 L199 73 Q120 88 41 73 Z" fill="#347962" /></g>}
            {headAccessory === 'top-hat' && <g aria-label="Cartola do Boo"><path d="M83 -36 H157 L164 46 H76 Z" fill="#353246" /><rect x="68" y="39" width="104" height="12" rx="6" fill="#584b78" /><rect x="52" y="48" width="136" height="10" rx="5" fill="#242333" /></g>}
            {headAccessory === 'witch-hat' && <g aria-label="Chapéu de bruxa do Boo"><path d="M121 -52 Q139 2 161 52 L65 52 Q100 8 121 -52 Z" fill="#60408b" /><path d="M58 48 H180 Q195 48 203 62 Q121 84 39 62 Z" fill="#392758" /><path d="M75 48 H172" stroke="#c496dc" strokeWidth="7" /></g>}
            {headAccessory === 'crown' && <g aria-label="Coroa do Boo"><path d="M64 52 L58 1 L87 24 L120 -12 L151 24 L181 1 L175 52 Z" fill="#eabf52" stroke="#d09a32" strokeWidth="4" /><circle cx="120" cy="35" r="8" fill="#e96a9d" /></g>}
            {headAccessory === 'headphones' && <g aria-label="Fone de ouvido do Boo"><path d="M48 108 V75 Q48 11 120 10 Q192 11 192 75 V108" fill="none" stroke="#263347" strokeWidth="13" strokeLinecap="round" /><rect x="36" y="81" width="24" height="49" rx="11" fill="#435a80" stroke="#263347" strokeWidth="5" /><rect x="180" y="81" width="24" height="49" rx="11" fill="#435a80" stroke="#263347" strokeWidth="5" /><rect x="44" y="91" width="9" height="28" rx="5" fill="#85d8ff" /><rect x="187" y="91" width="9" height="28" rx="5" fill="#85d8ff" /></g>}
            {(showBlush || mood === 'love') && <>
              <ellipse cx="77" cy="118" rx="14" ry="7" fill={cheek} opacity={blushOpacity} />
              <ellipse cx="163" cy="118" rx="14" ry="7" fill={cheek} opacity={blushOpacity} />
            </>}
            <g className="poli-avatar__look">
              {(mood === 'happy' || mood === 'love') && <g {...stroke}>
                {eyeXs.map(cx => <path key={cx} d={`M${cx - eyeSize * 1.3} 98 Q${cx} ${98 - eyeSize * 2.2} ${cx + eyeSize * 1.3} 98`} />)}
              </g>}
              {mood === 'boop' && <g {...stroke}>
                {eyeXs.map((cx, side) => {
                  const reach = eyeSize * 1.3
                  const back = side ? reach : -reach
                  return <path key={cx} d={`M${cx + back} ${94 - reach} L${cx - back * .6} 94 L${cx + back} ${94 + reach}`} />
                })}
              </g>}
              {mood === 'sleep' && <g {...stroke}>
                {eyeXs.map(cx => <path key={cx} d={`M${cx - eyeSize * 1.3} 96 Q${cx} ${96 + eyeSize} ${cx + eyeSize * 1.3} 96`} />)}
              </g>}
              {mood === 'dizzy' && eyeXs.map(cx => <g key={cx} className="poli-avatar__spin"><path d={spiral(cx, 94, eyeSize * 1.5)} {...stroke} strokeWidth={3.5} /></g>)}
              {mood === 'surprised' && <g fill={eyeColor}>
                {eyeXs.map(cx => <circle key={cx} cx={cx} cy="92" r={eyeSize * 1.35} />)}
              </g>}
              {!SPECIAL_EYES.includes(mood) && <g className="poli-avatar__eyes" fill={eyeColor}>
                {eyeXs.map(cx => <ellipse key={cx} cx={cx} cy="94" rx={eyeSize} ry={eyeSize * 1.5} />)}
              </g>}
            </g>
            {faceAccessory === 'glasses' && <g aria-label="Óculos do Boo" fill="none" stroke="#253347" strokeWidth="5" strokeLinecap="round"><rect x="76" y="79" width="35" height="34" rx="11" /><rect x="129" y="79" width="35" height="34" rx="11" /><path d="M111 91 Q120 85 129 91 M76 91 L58 87 M164 91 L182 87" /></g>}
            {faceAccessory === 'round-glasses' && <g aria-label="Óculos redondos do Boo" fill="none" stroke="#7c553a" strokeWidth="5"><circle cx="94" cy="95" r="19" /><circle cx="146" cy="95" r="19" /><path d="M113 92 Q120 88 127 92 M75 92 L59 88 M165 92 L181 88" /></g>}
            {faceAccessory === 'sunglasses' && <g aria-label="Óculos escuros do Boo"><rect x="75" y="80" width="38" height="30" rx="9" fill="#202b42" /><rect x="127" y="80" width="38" height="30" rx="9" fill="#202b42" /><path d="M113 89 Q120 85 127 89 M75 89 L58 85 M165 89 L182 85" fill="none" stroke="#202b42" strokeWidth="5" /><path d="M81 84 L95 84" stroke="#7ca7ce" strokeWidth="3" /></g>}
            <g className="poli-avatar__mouth-scale" transform={mouthTransform}>
            {state === 'speaking' && <ellipse className="poli-avatar__mouth-speaking" cx="120" cy="129" rx="6" ry="5" fill="#fff" />}
            {state !== 'speaking' && mood === 'idle' && <path d="M108 124 Q120 135 132 124" {...mouth} />}
            {(mood === 'happy' || mood === 'love') && <path d="M104 122 Q120 146 136 122" {...mouth} />}
            {mood === 'boop' && <path d="M108 124 Q114 133 120 125 Q126 133 132 124" {...mouth} />}
            {mood === 'surprised' && <ellipse cx="120" cy="131" rx="7" ry="9" fill="#fff" />}
            {mood === 'dizzy' && <path d="M102 129 q4.5 -6 9 0 t9 0 t9 0 t9 0" {...mouth} strokeWidth={4} />}
            {mood === 'sleep' && <ellipse className="poli-avatar__snore" cx="120" cy="128" rx="4" ry="3" fill="#fff" />}
            </g>
            {face === 'thinking' && <>
              <ellipse cx="120" cy="128" rx="5" ry="7" fill="#fff" transform={mouthTransform} />
              <g className="poli-avatar__thought"><circle cx="187" cy="34" r="5" fill={eyeColor} /><circle cx="200" cy="20" r="8" fill={eyeColor} /></g>
            </>}
            {face === 'coding' && <>
              <path d="M113 128 H127" transform={mouthTransform} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <path d="M51 174 l-12 -10 12 -10 M65 154 l12 10 -12 10" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {/* Mãozinha digitando: aparece sempre que o agente está em execução, incluindo ao editar arquivos. */}
              <g className={animate ? 'poli-avatar__type' : ''} aria-hidden="true">
                <rect x="146" y="173" width="36" height="5" rx="2.5" fill={eyeColor} opacity=".35" />
                <rect className="poli-avatar__finger poli-avatar__finger--1" x="150" y="161" width="6" height="13" rx="3" fill={eyeColor} />
                <rect className="poli-avatar__finger poli-avatar__finger--2" x="161" y="161" width="6" height="13" rx="3" fill={eyeColor} />
                <rect className="poli-avatar__finger poli-avatar__finger--3" x="172" y="161" width="6" height="13" rx="3" fill={eyeColor} />
              </g>
            </>}
            {face === 'done' && <>
              <path d="M106 124 Q120 147 134 124" transform={mouthTransform} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <circle cx="183" cy="42" r="21" fill="#31bd92" />
              <path d="M172 42 l8 8 14 -17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </>}
            <circle cx="55" cy="63" r="3" fill="#fff" opacity=".55" />
            {(mood === 'love' || mood === 'boop') && (mood === 'love' ? [[176, 46, 0], [204, 74, .35], [58, 36, .7]] : [[182, 40, 0]]).map(([x, y, delay]) =>
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(.9)`}><path className="poli-avatar__heart" d={HEART} fill="#ff5d8f" style={{ animationDelay: `${delay}s` }} /></g>)}
            {mood === 'sleep' && <g fill={eyeColor} fontWeight="700">
              <text className="poli-avatar__z" x="178" y="54" fontSize="24">z</text>
              <text className="poli-avatar__z" x="196" y="30" fontSize="18" style={{ animationDelay: '1.2s' }}>z</text>
            </g>}
              </g>
            </g>
          </g>
        </g>
      </svg>
    </span>
  )
})
