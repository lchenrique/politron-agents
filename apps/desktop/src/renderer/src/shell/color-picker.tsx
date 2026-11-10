import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChromePicker, type ColorResult } from 'react-color'
import { FOLDER_COLORS, safeHex } from './primitives'

/**
 * Seletor de cor do app, agora com o `react-color` (ChromePicker) no miolo:
 * área de saturação, matiz e campo hexadecimal vêm do componente consagrado.
 * A gravação acontece em `onChangeComplete`, ou seja, ao soltar o ponteiro —
 * nada de IPC a cada movimento — e a paleta rápida do design fica embaixo.
 */
export function ColorPicker({ anchor, label, color, onChange, onClose }: {
  anchor: HTMLElement | null
  label: string
  color: string
  onChange: (hex: string) => void
  onClose: () => void
}) {
  const [hex, setHex] = useState(safeHex(color))
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!anchor || !panel.current) return
    const rect = anchor.getBoundingClientRect()
    const height = panel.current.offsetHeight
    const width = panel.current.offsetWidth || 252
    setPosition({
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 12)),
      left: Math.max(8, Math.min(rect.left - width + rect.width, window.innerWidth - width - 8)),
    })
  }, [anchor])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panel.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const apply = (result: ColorResult) => {
    const next = safeHex(result.hex)
    setHex(next)
    onChange(next)
  }

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={`Cor de ${label}`}
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      className="fixed z-[80] w-[252px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-2xl select-none"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">Cor personalizada</span>
        <span className="truncate text-[10.5px] text-[var(--text-secondary)]">{label}</span>
      </div>

      {/* A borda e o raio vêm do design; o resto do miolo é o picker do react-color. */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] [&_.chrome-picker]:w-full [&_.chrome-picker]:rounded-none [&_.chrome-picker]:bg-transparent [&_.chrome-picker]:shadow-none">
        <ChromePicker disableAlpha color={hex} onChange={result => setHex(safeHex(result.hex))} onChangeComplete={apply} />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 font-mono text-[9.5px] tracking-wider text-[var(--text-muted)] uppercase">Paleta rápida</div>
        <div className="grid grid-cols-6 gap-1.5">
          {FOLDER_COLORS.map(preset => (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              onClick={() => { setHex(preset.hex); onChange(preset.hex) }}
              style={{ background: preset.hex }}
              className="size-7 rounded-md border border-white/15 transition hover:scale-110"
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
