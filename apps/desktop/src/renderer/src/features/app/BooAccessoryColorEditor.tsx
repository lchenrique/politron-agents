import { memo } from 'react'
import type { Agent } from '../../../../shared/v9'
import { colorsOf } from './BooPetAccessories'

type Props = {
  layer: 'head' | 'face'
  accessory: string
  colors: Agent['pitsAccessoryColors']
  onChange: (patch: Partial<Agent>) => void
}

/** As cores pertencem ao item, não à posição: trocar de chapéu não apaga a paleta anterior. */
export const BooAccessoryColorEditor = memo(function BooAccessoryColorEditor({
  layer, accessory, colors, onChange,
}: Props) {
  if (!accessory || accessory === 'none') return null
  const parts = colorsOf(layer, accessory)
  if (!parts.length) return null

  const overrides = colors?.[accessory]
  const setPart = (index: number, value: string) => {
    const next = parts.map(([, defaultColor], i) => overrides?.[i] || defaultColor)
    next[index] = value
    onChange({ pitsAccessoryColors: { ...colors, [accessory]: next } })
  }
  const restore = () => {
    const next = { ...colors }
    delete next[accessory]
    onChange({ pitsAccessoryColors: next })
  }

  return <div className="rounded-lg border border-border/70 bg-muted/25 p-2.5" role="group"
    aria-label={`Personalizar cores: ${layer === 'head' ? 'cabeça' : 'rosto'}`}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium">Cores do acessório</span>
      {overrides?.length ? <button type="button" onClick={restore}
        className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Restaurar cores de ${accessory}`}>Restaurar cores</button> : null}
    </div>
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {parts.map(([label, defaultColor], index) => <label key={index}
        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[11px]">
        <span>{label}</span>
        <input type="color" aria-label={`${accessory} — ${label}`}
          value={overrides?.[index] || defaultColor}
          onChange={event => setPart(index, event.currentTarget.value)}
          className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0.5" />
      </label>)}
    </div>
  </div>
})
