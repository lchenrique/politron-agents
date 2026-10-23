import { memo } from 'react'
import { ImportedBooPetAccessory, heads, faces } from './BooPetAccessories'

export type BooAccessoryProps = {
  kind: string
  shape?: string
  bodyWidth?: number
  bodyHeight?: number
  eyeSize?: number
  eyeSpacing?: number
  mouthSize?: number
}

const labels: Record<string, string> = {
  antenna: 'Antena',
  horns: 'Chifres',
  headphones: 'Fone de ouvido',
  cap: 'Boné',
  'cap-flat': 'Boné aba reta',
  'cap-back': 'Boné para trás',
  glasses: 'Óculos',
  'round-glasses': 'Óculos redondos',
  sunglasses: 'Óculos escuros',
  'heart-glasses': 'Óculos de coração',
  'star-glasses': 'Óculos de estrela',
}

/** Shared SVG artwork + body-shape anchoring, used unchanged over the Rive canvas. */
function asLooks({ kind, shape = 'ghost-wave', bodyWidth = 1, bodyHeight = 1, eyeSize = 8, eyeSpacing = 26, mouthSize = 1 }: BooAccessoryProps, layer: 'head' | 'face') {
  return {
    shape, width: bodyWidth, height: bodyHeight,
    eyeSize, eyeSpacing, mouthSize,
    head: layer === 'head' ? kind : 'none',
    face: layer === 'face' ? kind : 'none',
    colors: {},
  }
}

function Accessory({ kind, layer, ...geometry }: BooAccessoryProps & { layer: 'head' | 'face' }) {
  if (!kind || kind === 'none') return null
  const collection = layer === 'head' ? heads : faces
  const match = collection.find(([id]) => id === kind)
  if (!match) return null
  return <g data-boo-accessory={kind} data-boo-layer={layer} aria-label={`${labels[kind] || match[1]} do Boo`}>
    <ImportedBooPetAccessory looks={asLooks({ kind, ...geometry }, layer)} layer={layer} />
  </g>
}

export const BooHeadAccessory = memo(function BooHeadAccessory(props: BooAccessoryProps) {
  return <Accessory {...props} layer="head" />
})

export const BooFaceAccessory = memo(function BooFaceAccessory(props: BooAccessoryProps) {
  return <Accessory {...props} layer="face" />
})
