import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Pipette, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Menu flutuante ancorado a um elemento, renderizado no <body>.
 * O sidebar tem overflow próprio; o HTML resolve isso tirando o menu do fluxo
 * do sidebar, e aqui a mesma coisa acontece via portal + posição fixa.
 */
export function FloatingMenu({ anchor, onClose, children, width = 240, align = 'right' }: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'right' | 'left'
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const measure = useCallback(() => {
    if (!anchor || !panel.current) return
    const rect = anchor.getBoundingClientRect()
    const height = panel.current.offsetHeight
    const left = align === 'right' ? rect.right - width : rect.left
    const top = Math.min(rect.bottom + 6, window.innerHeight - height - 12)
    setPosition({ top: Math.max(8, top), left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) })
  }, [anchor, width, align])

  useEffect(() => { measure() }, [measure])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panel.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const onScroll = () => onClose()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose, anchor])

  return createPortal(
    <div
      ref={panel}
      role="menu"
      style={{ width, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      className="fixed z-[70] rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1.5 text-[12px] text-[var(--text-primary)] shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  )
}

/** Item de ação do menu flutuante. */
export function FloatingMenuItem({ icon, label, onClick, danger }: { icon?: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] transition hover:bg-[var(--bg-hover)]',
        danger ? 'text-rose-400' : 'text-[var(--text-primary)]',
      )}
    >
      {icon ? <span className={cn('shrink-0', danger ? 'text-rose-400' : 'text-[var(--text-secondary)]')}>{icon}</span> : null}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Cabeçalho de bloco dentro do menu flutuante. */
export function FloatingMenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">{children}</div>
}

/** Grade de amostras de cor + botão de personalização. */
export function ColorSwatches({ current, colors, onPick, onCustom }: {
  current: string
  colors: ReadonlyArray<{ id: string; hex: string; label: string }>
  onPick: (hex: string) => void
  onCustom?: (anchor: HTMLElement) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-2.5">
        {colors.map(color => (
          <button
            key={color.id}
            type="button"
            title={color.label}
            aria-label={color.label}
            onClick={() => onPick(color.hex)}
            style={{ background: color.hex }}
            className={cn(
              'size-5 rounded-md border transition hover:scale-110',
              current.toLowerCase() === color.hex.toLowerCase() ? 'border-white/80 ring-1 ring-white/40' : 'border-white/15',
            )}
          />
        ))}
      </div>
      {onCustom ? (
        <button
          type="button"
          onClick={event => onCustom(event.currentTarget)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-pane)] px-2 py-1 text-[10.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Pipette className="size-3 text-[var(--text-muted)]" />
          <span>Personalizar cor</span>
          <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">{current}</span>
        </button>
      ) : null}
    </>
  )
}

export const ITEM_MENU_ICONS = { Pencil, Trash2, Plus }
