import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Agent } from '../../../../shared/v9'
import { STARTLE_EVENT, usePoliDrowsy, usePoliGaze } from './usePoliGaze'
import { useAvatarActivity } from './useAvatarActivity'
import { BooFigure, type BooColors, type BooMood } from './BooFigure'
import { useRivePreview } from './booRendererPreference'
const RiveBooAvatar = lazy(() => import('./RiveBooAvatar').then(m => ({ default: m.RiveBooAvatar })))
import './PoliAvatar.css'

export type PoliExpression = 'idle' | 'thinking' | 'coding' | 'done'
type Reaction = 'boop' | 'dizzy' | 'love' | 'surprised'
type Mood = PoliExpression | Reaction | 'happy' | 'sleep'

const REACTION_MS: Record<Reaction, number> = { boop: 900, dizzy: 2200, love: 2600, surprised: 900 }
const PRESS_WINDOW_MS = 1200
const PET_WINDOW_MS = 1200
/** Olhos brancos eram o padrão dos corpos coloridos antigos; no Boo novo o padrão é escuro. */
const LEGACY_EYES = /^#fff(fff)?$/i
const LEGACY_CHEEK = '#f5a5d1'

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Cores do agente para as variáveis CSS do Boo (corpo, olhos, bochechas e destaque do headset). */
export function booColorsOf(agent: Agent): Partial<BooColors> {
  const accent = agent.pitsAccentColor
  return {
    body: agent.color || undefined,
    eye: agent.pitsEyeColor && !LEGACY_EYES.test(agent.pitsEyeColor) ? agent.pitsEyeColor : undefined,
    blush: agent.pitsCheekColor && agent.pitsCheekColor.toLowerCase() !== LEGACY_CHEEK ? agent.pitsCheekColor : undefined,
    accent,
    accent2: accent ? `color-mix(in srgb, ${accent} 55%, #7b5cff)` : undefined,
  }
}

/** Memoizado: um Pit renderizado 2-3x por tela (cabeçalho, prévia, chat) não deve recalcular a cada tecla digitada em um campo que não o afeta. */
export const PoliAvatar = memo(function PoliAvatar({ agent, size = 36, state = 'idle', expression, motionPolicy = 'auto' }: {
  agent: Agent
  size?: number
  state?: 'idle' | 'working' | 'waiting' | 'speaking'
  expression?: PoliExpression
  motionPolicy?: 'auto' | 'hover' | 'gaze' | 'never'
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const riveOptIn = useRivePreview()
  const color = agent.color || '#ffffff'
  const eyeColor = agent.pitsEyeColor || '#ffffff'
  const cheek = agent.pitsCheekColor || '#f7a1b5'
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
  const figureMood: BooMood = state === 'speaking' ? 'speaking' : mood
  const blushOpacity = mood === 'love' ? Math.max(.85, agent.pitsBlushStrength ?? .45) : Math.max(0, Math.min(1, agent.pitsBlushStrength ?? .45))
  // Campos legados (formato e proporções) seguem salvos e alimentam só o renderer Rive experimental.
  const shape = agent.pitsShape || 'ghost-wave'
  const headAccessory = agent.pitsHeadAccessory ?? (agent.pitsAccessory === 'glasses' ? 'none' : agent.pitsAccessory || 'none')
  const faceAccessory = agent.pitsFaceAccessory ?? (agent.pitsAccessory === 'glasses' ? 'glasses' : 'none')
  const bodyWidth = Math.max(.75, Math.min(1.25, agent.pitsBodyWidth ?? 1))
  const bodyHeight = Math.max(.75, Math.min(1.25, agent.pitsBodyHeight ?? 1))
  const mouthSize = Math.max(.65, Math.min(1.6, agent.pitsMouthSize ?? 1))
  const colors = useMemo(() => booColorsOf(agent), [agent])

  // Rive opt-in recebe todas as silhuetas e proporções; SVG permanece padrão.
  const riveEligible = riveOptIn && import.meta.env.MODE !== 'test' && size >= 80 && agent.pitsAnimate !== false
  const [riveReady, setRiveReady] = useState(false)
  const riveVisible = riveEligible && riveReady
  const style = {
    '--poli-speed': `${Math.max(1, Math.min(6, agent.pitsSpeed ?? 3))}s`,
    '--poli-amplitude': `-${(Math.max(0, Math.min(24, agent.pitsAmplitude ?? 9)) * size / 180).toFixed(2)}px`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <span ref={ref} className="poli-avatar relative inline-flex shrink-0 items-center justify-center" style={style} data-animate={animate} data-motion-active={animate} data-shape={shape} data-state={state} data-hover={hovered} data-mood={figureMood} data-rive-active={riveVisible} data-reduced-motion={prefersReducedMotion()}
      onPointerEnter={event => { pet.current = { x: event.clientX, direction: 0, flips: [] }; setHovered(true) }}
      onPointerLeave={() => setHovered(false)} onPointerDown={onPress} onPointerMove={onPet}>
      <BooFigure mood={figureMood} size={size} colors={colors} label={`${agent.name || 'Boo'} — ${figureMood}`} animate={animate && !riveVisible}
        headset={agent.pitsHeadset !== false} blush={showBlush} blushOpacity={blushOpacity}
        headAccessory={headAccessory} faceAccessory={faceAccessory} accessoryColors={agent.pitsAccessoryColors} hidden={riveVisible} />
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
