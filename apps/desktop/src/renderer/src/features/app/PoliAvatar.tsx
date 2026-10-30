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

/* Arte do logo (public/boobot-mascot.svg): corpo com bracinho, olhos ovais com brilho e sorriso.
   Encaixada no viewBox do avatar (28 0 185 200): escala .378 e deslocamento para centralizar. */
const LOGO_TRANSFORM = 'translate(32.5 23.5) scale(.378)'
const LOGO_BODY = 'M143.9,33.0 L124.1,48.8 L104.3,70.0 L91.1,88.4 L79.2,110.9 L67.3,149.2 L63.4,183.5 L63.4,208.6 L56.8,236.3 L39.6,264.0 L11.9,290.4 L1.3,310.2 L0.0,326.0 L2.6,335.3 L10.6,348.5 L23.8,359.0 L44.9,365.6 L60.7,365.6 L89.8,359.0 L117.5,360.4 L132.0,368.3 L161.0,392.0 L174.2,398.6 L190.1,402.6 L213.8,402.6 L225.7,400.0 L249.5,389.4 L273.2,374.9 L286.4,370.9 L308.9,372.2 L356.4,389.4 L381.5,389.4 L405.2,378.8 L414.5,369.6 L422.4,352.4 L422.4,331.3 L402.6,282.5 L402.6,262.7 L407.9,250.8 L444.8,213.8 L459.4,190.1 L464.6,170.3 L464.6,158.4 L458.0,141.2 L444.8,132.0 L430.3,130.7 L411.8,137.3 L394.7,150.5 L386.8,108.2 L378.8,87.1 L367.0,64.7 L356.4,50.2 L335.3,29.0 L302.3,9.2 L264.0,0.0 L220.4,1.3 L179.5,13.2Z'
const LOGO_EYES = 'M295.7,85.8 L286.4,93.7 L282.5,105.6 L282.5,118.8 L283.8,120.1 L283.8,125.4 L287.8,138.6 L295.7,153.1 L299.6,158.4 L307.6,165.0 L315.5,169.0 L328.7,169.0 L332.6,167.6 L340.6,161.0 L345.8,145.2 L344.5,126.7 L340.6,114.8 L330.0,97.7 L319.4,88.4 L310.2,84.5 L299.6,84.5Z M165.0,128.0 L155.8,132.0 L147.8,139.9 L145.2,145.2 L142.6,154.4 L142.6,174.2 L143.9,175.6 L143.9,180.8 L150.5,198.0 L161.0,211.2 L174.2,217.8 L187.4,217.8 L196.7,213.8 L205.9,203.3 L208.6,195.4 L208.6,190.1 L209.9,188.8 L208.6,169.0 L200.6,149.2 L190.1,136.0 L182.2,130.7 L174.2,128.0Z'
const LOGO_SHINES = 'M299.6,95.0 L302.3,95.0 L307.6,97.7 L311.5,103.0 L311.5,110.9 L310.2,113.5 L304.9,117.5 L299.6,117.5 L297.0,116.2 L293.0,112.2 L293.0,109.6 L291.7,108.2 L291.7,103.0 L293.0,100.3 L297.0,96.4Z M166.3,138.6 L170.3,138.6 L172.9,139.9 L179.5,146.5 L179.5,155.8 L178.2,158.4 L175.6,161.0 L170.3,163.7 L162.4,161.0 L159.7,158.4 L158.4,155.8 L158.4,153.1 L157.1,151.8 L158.4,145.2 L163.7,139.9Z'
const LOGO_SMILE = 'M277.2,166.3 L275.9,163.7 L273.2,162.4 L268.0,163.7 L265.3,167.6 L264.0,174.2 L258.7,179.5 L250.8,179.5 L241.6,171.6 L236.3,172.9 L233.6,178.2 L236.3,184.8 L241.6,190.1 L252.1,194.0 L262.7,192.7 L268.0,190.1 L274.6,183.5 L278.5,171.6 L277.2,170.3Z'
/** Centros dos olhos e da boca do logo já no viewBox do avatar; o rosto do logo é levemente inclinado. */
const LOGO_EYE_POINTS = [{ x: 99, y: 89 }, { x: 151, y: 71.5 }]
const LOGO_INK = '#080808'

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
  // Rosto do logo: tinta escura nos olhos e na boca, nas posições do logo.
  const eyes = LOGO_EYE_POINTS
  const moodEye = eyeSize * 1.3
  const stroke = { fill: 'none', stroke: LOGO_INK, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const mouth = { fill: 'none', stroke: LOGO_INK, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const blushOpacity = mood === 'love' ? Math.max(.85, agent.pitsBlushStrength ?? .45) : Math.max(0, Math.min(1, agent.pitsBlushStrength ?? .45))
  const shape = agent.pitsShape || 'ghost-wave'

  const headAccessory = agent.pitsHeadAccessory ?? (agent.pitsAccessory === 'glasses' ? 'none' : agent.pitsAccessory || 'none')
  const faceAccessory = agent.pitsFaceAccessory ?? (agent.pitsAccessory === 'glasses' ? 'glasses' : 'none')
  const bodyWidth = Math.max(.75, Math.min(1.25, agent.pitsBodyWidth ?? 1))
  const bodyHeight = Math.max(.75, Math.min(1.25, agent.pitsBodyHeight ?? 1))
  const mouthSize = Math.max(.65, Math.min(1.6, agent.pitsMouthSize ?? 1))
  // Expressões de boca (desenhadas em torno de 120,128) levadas ao ponto e à inclinação da boca do logo.
  const mouthTransform = 'translate(9 -37) rotate(-16 120 128) translate(120 128) scale(' + +(mouthSize * .8).toFixed(3) + ') translate(-120 -128)'
  // Mesmo pivô do corpo, aura e reflexos, no centro do viewBox (28 + 185 / 2 ≈ 120).
  const bodyTransform = `translate(120 100) scale(${bodyWidth} ${bodyHeight}) translate(-120 -100)`

  // Rive opt-in recebe todas as silhuetas e proporções; SVG permanece padrão.
  const riveEligible = riveOptIn && import.meta.env.MODE !== 'test' && size >= 80 && agent.pitsAnimate !== false
  const [riveReady, setRiveReady] = useState(false)
  const riveVisible = riveEligible && riveReady

  // Ondulação de líquido/pano no hover: a intensidade sobe e desce suave (rAF), nunca liga de uma vez.
  const [liquid, setLiquid] = useState(0)
  const liquidTarget = hovered && agent.pitsAnimate !== false && size >= 20 && !prefersReducedMotion() ? 18 : 0
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
        <g className="poli-avatar__float">
          <g className="poli-avatar__lean">
            <g className="poli-avatar__body-transform" transform={bodyTransform}>
              <g className="poli-avatar__shape">
                {/* Corpo do logo na cor do Boo; só o corpo ondula no hover, o rosto fica firme. */}
                <g transform={LOGO_TRANSFORM} filter={liquid > 0 ? `url(#${gradientId}-liquid)` : undefined}><path d={LOGO_BODY} fill={color} /></g>
            {(showBlush || mood === 'love') && eyes.map(({ x, y }) =>
              <ellipse key={x} cx={x - 4} cy={y + 24} rx="11" ry="5.5" transform={`rotate(-16 ${x - 4} ${y + 24})`} fill={cheek} opacity={blushOpacity} />)}
            <g className="poli-avatar__look">
              {(mood === 'happy' || mood === 'love') && <g {...stroke}>
                {eyes.map(({ x: cx, y: cy }) => <path key={cx} d={`M${cx - moodEye} ${cy + 4} Q${cx} ${cy + 4 - moodEye * 1.7} ${cx + moodEye} ${cy + 4}`} />)}
              </g>}
              {mood === 'boop' && <g {...stroke}>
                {eyes.map(({ x: cx, y: cy }, side) => {
                  const reach = moodEye
                  const back = side ? reach : -reach
                  return <path key={cx} d={`M${cx + back} ${cy - reach} L${cx - back * .6} ${cy} L${cx + back} ${cy + reach}`} />
                })}
              </g>}
              {mood === 'sleep' && <g {...stroke}>
                {eyes.map(({ x: cx, y: cy }) => <path key={cx} d={`M${cx - moodEye} ${cy + 2} Q${cx} ${cy + 2 + moodEye * .8} ${cx + moodEye} ${cy + 2}`} />)}
              </g>}
              {mood === 'dizzy' && eyes.map(({ x: cx, y: cy }) => <g key={cx} className="poli-avatar__spin"><path d={spiral(cx, cy, moodEye * 1.2)} {...stroke} strokeWidth={3.5} /></g>)}
              {mood === 'surprised' && <g fill={LOGO_INK}>
                {eyes.map(({ x: cx, y: cy }) => <circle key={cx} cx={cx} cy={cy - 2} r={moodEye * 1.15} />)}
              </g>}
              {!SPECIAL_EYES.includes(mood) && <g className="poli-avatar__eyes" transform={LOGO_TRANSFORM}>
                <path d={LOGO_EYES} fill={LOGO_INK} />
                <path d={LOGO_SHINES} fill="#fff" />
              </g>}
            </g>
            {state !== 'speaking' && mood === 'idle' && <path d={LOGO_SMILE} transform={LOGO_TRANSFORM} fill={LOGO_INK} />}
            <g className="poli-avatar__mouth-scale" transform={mouthTransform}>
            {state === 'speaking' && <ellipse className="poli-avatar__mouth-speaking" cx="120" cy="129" rx="6" ry="5" fill={LOGO_INK} />}
            {(mood === 'happy' || mood === 'love') && <path d="M104 122 Q120 146 136 122" {...mouth} />}
            {mood === 'boop' && <path d="M108 124 Q114 133 120 125 Q126 133 132 124" {...mouth} />}
            {mood === 'surprised' && <ellipse cx="120" cy="131" rx="7" ry="9" fill={LOGO_INK} />}
            {mood === 'dizzy' && <path d="M102 129 q4.5 -6 9 0 t9 0 t9 0 t9 0" {...mouth} strokeWidth={4} />}
            {mood === 'sleep' && <ellipse className="poli-avatar__snore" cx="120" cy="128" rx="4" ry="3" fill={LOGO_INK} />}
            </g>
            {face === 'thinking' && <>
              <ellipse cx="120" cy="128" rx="5" ry="7" fill={LOGO_INK} transform={mouthTransform} />
              <g className="poli-avatar__thought"><circle cx="187" cy="34" r="5" fill={eyeColor} /><circle cx="200" cy="20" r="8" fill={eyeColor} /></g>
            </>}
            {face === 'coding' && <>
              <path d="M113 128 H127" transform={mouthTransform} stroke={LOGO_INK} strokeWidth="5" strokeLinecap="round" />
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
              <path d="M106 124 Q120 147 134 124" transform={mouthTransform} fill="none" stroke={LOGO_INK} strokeWidth="5" strokeLinecap="round" />
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
