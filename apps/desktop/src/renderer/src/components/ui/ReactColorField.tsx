import { memo, useEffect, useRef, useState } from 'react'
import { ChromePicker, type ColorResult } from 'react-color'

/** A única experiência de seleção de cores usada pelo editor do Boobot. */
export const ReactColorField = memo(function ReactColorField({
  label, value, onChange, compact = false,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !area.current?.contains(event.target)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key) }
  }, [open])
  const accept = (color: ColorResult) => {
    if (/^#[0-9a-f]{6}$/i.test(color.hex)) onChange(color.hex.toLowerCase())
  }
  return <div ref={area} className="relative flex min-w-0 items-center justify-between gap-2 text-xs">
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog"
      className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => setOpen(current => !current)}>
      <span className={compact ? 'size-6 rounded-sm border border-black/10' : 'size-7 rounded-sm border border-black/10'}
        style={{ backgroundColor: value }} />
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{value}</span>
    </button>
    {open && <div role="dialog" aria-label={`Selecionar ${label}`}
      className="absolute right-0 top-full z-[70] mt-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
      <ChromePicker color={value} onChange={accept} disableAlpha />
    </div>}
  </div>
})
