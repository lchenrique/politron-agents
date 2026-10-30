import { lazy, Suspense, memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Agent } from '../../../../shared/v9'
import { STARTLE_EVENT, usePoliDrowsy, usePoliGaze } from './usePoliGaze'
import { useAvatarActivity } from './useAvatarActivity'
import { BOO_BODY_PATHS } from './boo-appearance'
import { BooFaceAccessory, BooHeadAccessory } from './BooAccessories'
import { useRivePreview } from './booRendererPreference'
const RiveBooAvatar = lazy(() => import('./RiveBooAvatar').then(m => ({ default: m.RiveBooAvatar })))
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

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
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
  const riveOptIn = useRivePreview()
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
  const shape = agent.pitsShape || 'ghost-wave'

  const headAccessory = agent.pitsHeadAccessory ?? (agent.pitsAccessory === 'glasses' ? 'none' : agent.pitsAccessory || 'none')
  const faceAccessory = agent.pitsFaceAccessory ?? (agent.pitsAccessory === 'glasses' ? 'glasses' : 'none')
  const bodyWidth = Math.max(.75, Math.min(1.25, agent.pitsBodyWidth ?? 1))
  const bodyHeight = Math.max(.75, Math.min(1.25, agent.pitsBodyHeight ?? 1))
  const mouthSize = Math.max(.65, Math.min(1.6, agent.pitsMouthSize ?? 1))
  const mouthTransform = 'translate(120 128) scale(' + mouthSize + ') translate(-120 -128)'
  // Mesmo pivô do corpo, aura e reflexos, no centro do viewBox (28 + 185 / 2 ≈ 120).
  const bodyTransform = `translate(120 100) scale(${bodyWidth} ${bodyHeight}) translate(-120 -100)`

  // Rive opt-in recebe todas as silhuetas e proporções; SVG permanece padrão.
  const riveEligible = riveOptIn && import.meta.env.MODE !== 'test' && size >= 80 && agent.pitsAnimate !== false
  const [riveReady, setRiveReady] = useState(false)
  const riveVisible = riveEligible && riveReady

  // Ondulação de líquido/pano no hover: a intensidade sobe e desce suave (rAF), nunca liga de uma vez.
  const [liquid, setLiquid] = useState(0)
  const liquidTarget = hovered && agent.pitsAnimate !== false && size >= 20 && !prefersReducedMotion() ? 14 : 0
  useEffect(() => {
    let frame = 0
    const step = () => setLiquid(current => {
      const next = Math.abs(liquidTarget - current) < .2 ? liquidTarget : current + (liquidTarget - current) * .18
      if (next !== liquidTarget) frame = requestAnimationFrame(step)
      return next
    })
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [liquidTarget])
  const style = {
    '--poli-speed': `${Math.max(1, Math.min(6, agent.pitsSpeed ?? 3))}s`,
    '--poli-amplitude': `-${(Math.max(0, Math.min(24, agent.pitsAmplitude ?? 9)) * size / 180).toFixed(2)}px`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <span ref={ref} className="poli-avatar relative inline-flex shrink-0 items-center justify-center" style={style} data-animate={animate} data-motion-active={animate} data-shape={shape} data-state={state} data-hover={hovered} data-mood={mood} data-rive-active={riveVisible}
      onPointerEnter={event => { pet.current = { x: event.clientX, direction: 0, flips: [] }; setHovered(true) }}
      onPointerLeave={() => setHovered(false)} onPointerDown={onPress} onPointerMove={onPet}>
      <svg viewBox="28 0 185 200" className="size-full overflow-visible" style={riveVisible ? { visibility: 'hidden' } : undefined} role="img" aria-label={`${agent.name || 'Boo'} — ${mood}`}>
        {/* Estilo chapado (2D), como o logo: cor sólida, sem gradiente, reflexo, brilho ou sombra.
            No hover, um ruído animado desloca as bordas, como pano ou líquido. */}
        {liquid > 0 && <defs>
          <filter id={`${gradientId}-liquid`} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency="0.009 0.022" numOctaves="2" seed="7" result="noise">
              <animate attributeName="baseFrequency" dur="2.6s" values="0.009 0.022;0.013 0.03;0.009 0.022" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={liquid} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>}
        <g className="poli-avatar__float" filter={liquid > 0 ? `url(#${gradientId}-liquid)` : undefined}>
          <g className="poli-avatar__lean">
            <g className="poli-avatar__body-transform" transform={bodyTransform}>
              <g className="poli-avatar__shape">
                <path d={BOO_BODY_PATHS[shape]} fill={color} />
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
            {(mood === 'love' || mood === 'boop') && (mood === 'love' ? [[176, 46, 0], [204, 74, .35], [58, 36, .7]] : [[182, 40, 0]]).map(([x, y, delay]) =>
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(.9)`}><path className="poli-avatar__heart" d={HEART} fill="#ff5d8f" style={{ animationDelay: `${delay}s` }} /></g>)}
            {mood === 'sleep' && <g fill={eyeColor} fontWeight="700">
              <text className="poli-avatar__z" x="178" y="54" fontSize="24">z</text>
              <text className="poli-avatar__z" x="196" y="30" fontSize="18" style={{ animationDelay: '1.2s' }}>z</text>
            </g>}
              </g>
            </g>
            {/* Accessory geometry is anchored to the unscaled head, as in Boo Pet. */}
            <BooHeadAccessory kind={headAccessory} shape={shape} bodyWidth={bodyWidth} bodyHeight={bodyHeight} eyeSize={eyeSize} eyeSpacing={eyeSpacing} mouthSize={mouthSize} colors={agent.pitsAccessoryColors} />
            <BooFaceAccessory kind={faceAccessory} shape={shape} bodyWidth={bodyWidth} bodyHeight={bodyHeight} eyeSize={eyeSize} eyeSpacing={eyeSpacing} mouthSize={mouthSize} colors={agent.pitsAccessoryColors} />
          </g>
        </g>
      </svg>
      {riveEligible && <Suspense fallback={null}>
        <RiveBooAvatar shape={shape} color={color} eyeColor={eyeColor}
          cheekColor={cheek} blushOpacity={blushOpacity}
          headAccessory={headAccessory} faceAccessory={faceAccessory} accessoryColors={agent.pitsAccessoryColors}
          bodyWidth={bodyWidth} bodyHeight={bodyHeight} eyeSize={eyeSize} eyeSpacing={eyeSpacing} mouthSize={mouthSize}
          speaking={state === 'speaking'} expression={face} mood={mood} showAura={showAura} showBlush={showBlush} visible={riveVisible}
          playing={animate && riveVisible} onReady={setRiveReady} />
      </Suspense>}
    </span>
  )
})
