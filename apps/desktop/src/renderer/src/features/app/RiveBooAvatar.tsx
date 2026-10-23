import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { RuntimeLoader } from '@rive-app/canvas'
import {
  Fit,
  Layout,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceColor,
  useViewModelInstanceNumber,
} from '@rive-app/react-canvas'
import { BooFaceAccessory, BooHeadAccessory } from './BooAccessories'
import { GAZE_EVENT } from './usePoliGaze'

/** WASM local. O Electron instalado não pode depender de CDN para animar mascotes. */
RuntimeLoader.setWasmUrl('./rive.wasm')
RuntimeLoader.setWasmFallbackUrl('./rive_fallback.wasm')

function tone(hex: string, white: boolean, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  return '#' + [16, 8, 0].map(shift => {
    const channel = (n >> shift) & 255
    return Math.round(channel * (1 - amount) + (white ? 255 : 0) * amount)
      .toString(16).padStart(2, '0')
  }).join('')
}
function rgb(hex: string): [number, number, number] {
  const color = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#786bea'
  const n = parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const RiveBooAvatar = memo(function RiveBooAvatar({
  shape, color, eyeColor, cheekColor, blushOpacity, headAccessory, faceAccessory,
  speaking, expression, playing, visible, onReady,
}: {
  shape: string
  color: string
  eyeColor: string
  cheekColor: string
  blushOpacity: number
  headAccessory: string
  faceAccessory: string
  speaking: boolean
  expression: 'idle' | 'thinking' | 'coding' | 'done'
  playing: boolean
  visible: boolean
  onReady: (ready: boolean) => void
}) {
  const layerRef = useRef<HTMLSpanElement>(null)
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const onChange = () => setReducedMotion(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const layout = useMemo(() => new Layout({ fit: Fit.Contain }), [])
  const { rive, RiveComponent } = useRive({
    src: './boo-rive.riv',
    artboard: shape,
    stateMachines: 'BooMotion',
    autoplay: true,
    layout,
    shouldDisableRiveListeners: true,
    onLoadError: () => onReady(false),
  })
  const viewModel = useViewModel(rive, { useDefault: true })
  const instance = useViewModelInstance(viewModel, { useNew: true, rive })
  const { setRgb: setLight } = useViewModelInstanceColor('light', instance)
  const { setRgb: setBase } = useViewModelInstanceColor('base', instance)
  const { setRgb: setDark } = useViewModelInstanceColor('dark', instance)
  const { setRgb: setEyes } = useViewModelInstanceColor('eyes', instance)
  const { setRgb: setCheek } = useViewModelInstanceColor('cheek', instance)
  const { setRgba: setAmbientCenter } = useViewModelInstanceColor('ambientCenter', instance)
  const { setRgba: setAmbientMid } = useViewModelInstanceColor('ambientMid', instance)
  const { setRgba: setAmbientEdge } = useViewModelInstanceColor('ambientEdge', instance)
  const { setValue: setSmileOpacity } = useViewModelInstanceNumber('smileOpacity', instance)
  const { setValue: setTalkOpacity } = useViewModelInstanceNumber('talkOpacity', instance)
  const { setValue: setBlushOpacity } = useViewModelInstanceNumber('blushOpacity', instance)
  const { setValue: setGazeX } = useViewModelInstanceNumber('gazeX', instance)
  const { setValue: setGazeY } = useViewModelInstanceNumber('gazeY', instance)

  useEffect(() => {
    if (!rive || !instance) return
    setLight(...rgb(tone(color, true, .46)))
    setBase(...rgb(color))
    setDark(...rgb(tone(color, false, .39)))
    setEyes(...rgb(eyeColor))
    setCheek(...rgb(cheekColor))
    setAmbientCenter(...rgb(color), 61)
    setAmbientMid(...rgb(color), 41)
    setAmbientEdge(...rgb(color), 0)
    setBlushOpacity(blushOpacity)
    setSmileOpacity(speaking || expression !== 'idle' ? 0 : 1)
    setTalkOpacity(speaking ? 1 : 0)
    onReady(true)
  }, [rive, instance, color, eyeColor, cheekColor, blushOpacity, speaking, expression,
    setLight, setBase, setDark, setEyes, setCheek, setAmbientCenter, setAmbientMid, setAmbientEdge, setBlushOpacity, setSmileOpacity, setTalkOpacity, onReady])

  // O hook global do ponteiro emite offsets; o Rive recebe os valores sem renderizar React a cada movimento.
  useEffect(() => {
    if (!instance) return
    const root = layerRef.current?.closest<HTMLElement>('.poli-avatar')
    if (!root) return
    const onGaze: EventListener = event => {
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail
      setGazeX(120 + x)
      setGazeY(94 + y)
    }
    root.addEventListener(GAZE_EVENT, onGaze)
    return () => root.removeEventListener(GAZE_EVENT, onGaze)
  }, [instance, setGazeX, setGazeY])

  useEffect(() => {
    if (!rive) return
    if (playing && !reducedMotion) rive.play()
    else rive.pause()
  }, [rive, playing, reducedMotion])

  return <span ref={layerRef} className="poli-avatar__rive-layer" aria-hidden={!visible}
    style={{ position: 'absolute', inset: 0, opacity: visible ? 1 : 0, pointerEvents: 'none' }}>
    {/* The shadow stays on the floor while the entire Boo (including hats) floats. */}
    <svg viewBox="28 0 185 200" className="poli-avatar__rive-shadow" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <ellipse cx="120" cy="190" rx="54" ry="9" fill={color} opacity=".15" />
    </svg>
    <span className="poli-avatar__rive-float" style={{ position: 'absolute', inset: 0 }}>
      <span className="poli-avatar__rive-lean" style={{ position: 'absolute', inset: 0 }}>
        <RiveComponent role="img" aria-label="Boo animado" style={{ width: '100%', height: '100%', display: 'block' }} />
        {(headAccessory !== 'none' || faceAccessory !== 'none' || expression !== 'idle') && (
          <svg viewBox="28 0 185 200" className="poli-avatar__rive-accessory" aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <BooHeadAccessory kind={headAccessory} />
            <BooFaceAccessory kind={faceAccessory} />
            {!speaking && expression === 'thinking' && <>
              <ellipse cx="120" cy="128" rx="5" ry="7" fill="#fff" />
              <g className="poli-avatar__thought">
                <circle cx="187" cy="34" r="5" fill={eyeColor} />
                <circle cx="200" cy="20" r="8" fill={eyeColor} />
              </g>
            </>}
            {!speaking && expression === 'coding' && <>
              <path d="M113 128 H127" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <path d="M51 174 l-12 -10 12 -10 M65 154 l12 10 -12 10" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <g className={playing ? 'poli-avatar__type' : ''} aria-hidden="true">
                <rect x="146" y="173" width="36" height="5" rx="2.5" fill={eyeColor} opacity=".35" />
                {[150, 161, 172].map((x, i) => <rect key={x} className={`poli-avatar__finger poli-avatar__finger--${i + 1}`} x={x} y="161" width="6" height="13" rx="3" fill={eyeColor} />)}
              </g>
            </>}
            {!speaking && expression === 'done' && <>
              <path d="M106 124 Q120 147 134 124" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <circle cx="183" cy="42" r="21" fill="#31bd92" />
              <path d="M172 42 l8 8 14 -17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </>}
          </svg>
        )}
      </span>
    </span>
  </span>
})
