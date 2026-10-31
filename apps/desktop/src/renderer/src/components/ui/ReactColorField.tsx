import { Popover } from '@base-ui/react/popover'
import { memo, useState } from 'react'
import { ChromePicker, type ColorResult } from 'react-color'

/** A única experiência de seleção de cores usada pelo editor do Boobot. */
export const ReactColorField = memo(function ReactColorField({
  label, value, onChange, compact = false, inline = false,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  compact?: boolean
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const accept = (color: ColorResult) => {
    if (/^#[0-9a-f]{6}$/i.test(color.hex)) onChange(color.hex.toLowerCase())
  }
  if (inline) return <fieldset className="min-w-0" aria-label={label} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation() } }}>
    <legend className="mb-3 text-sm font-medium">{label}</legend>
    <ChromePicker color={value} onChange={accept} disableAlpha styles={{ default: { picker: { width: '100%', background: 'transparent', boxShadow: 'none', fontFamily: 'inherit' }, body: { padding: '14px 0 0' }, saturation: { borderRadius: '8px', paddingBottom: '43%' } } }} />
  </fieldset>
  return <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={
        <button type="button" aria-label={label} aria-haspopup="dialog"
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <span className={compact ? 'size-6 rounded-sm border border-black/10' : 'size-7 rounded-sm border border-black/10'}
            style={{ backgroundColor: value }} />
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{value}</span>
        </button>
      } />
      <Popover.Portal>
        <Popover.Positioner align="end" collisionPadding={16} side="top" sideOffset={8} className="isolate z-[1200]">
          <Popover.Popup aria-label={`Selecionar ${label}`}
            className="rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-2xl outline-none"
            initialFocus={(type) => type === 'keyboard'}>
            <ChromePicker color={value} onChange={accept} disableAlpha />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>
})
