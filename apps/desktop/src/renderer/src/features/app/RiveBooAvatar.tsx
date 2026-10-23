import { memo, useEffect, useMemo, useState } from 'react'
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
  speaking, playing, visible, onReady,
}: {
  shape: string
  color: string
  eyeColor: string
  cheekColor: string
  blushOpacity: number
  headAccessory: string
  faceAccessory: string
  speaking: boolean
  playing: boolean
  visible: boolean
  onReady: (ready: boolean) => void
}) {
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
  const { setValue: setSmileOpacity } = useViewModelInstanceNumber('smileOpacity', instance)
  const { setValue: setTalkOpacity } = useViewModelInstanceNumber('talkOpacity', instance)
  const { setValue: setBlushOpacity } = useViewModelInstanceNumber('blushOpacity', instance)

  useEffect(() => {
    if (!rive || !instance) return
    setLight(...rgb(tone(color, true, .46)))
    setBase(...rgb(color))
    setDark(...rgb(tone(color, false, .39)))
    setEyes(...rgb(eyeColor))
    setCheek(...rgb(cheekColor))
    setBlushOpacity(blushOpacity)
    setSmileOpacity(speaking ? 0 : 1)
    setTalkOpacity(speaking ? 1 : 0)
    onReady(true)
  }, [rive, instance, color, eyeColor, cheekColor, blushOpacity, speaking,
    setLight, setBase, setDark, setEyes, setCheek, setBlushOpacity, setSmileOpacity, setTalkOpacity, onReady])

  useEffect(() => {
    if (!rive) return
    if (playing && !reducedMotion) rive.play()
    else rive.pause()
  }, [rive, playing, reducedMotion])

  return <span className="poli-avatar__rive-layer" aria-hidden={!visible}
    style={{ position: 'absolute', inset: 0, opacity: visible ? 1 : 0, pointerEvents: 'none' }}>
    <RiveComponent role="img" aria-label="Boo animado" style={{ width: '100%', height: '100%', display: 'block' }} />
    {(headAccessory !== 'none' || faceAccessory !== 'none') && (
      <svg viewBox="28 0 185 200" aria-hidden={!visible} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <BooHeadAccessory kind={headAccessory}/>
        <BooFaceAccessory kind={faceAccessory}/>
      </svg>
    )}
  </span>
})
