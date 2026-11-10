import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/utils'

/**
 * Popover ancorado usado no top bar, no menu do painel e no menu do item do
 * sidebar. Reproduz o comportamento do HTML: fecha ao clicar fora, ao apertar
 * ESC e ao escolher uma ação; posiciona abaixo do gatilho alinhado à direita ou
 * à esquerda, sem sair da janela.
 */
export function Dropdown({ open, onClose, anchor, children, align = 'left', width = 256, className }: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
  align?: 'left' | 'right'
  width?: number
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, anchor])

  if (!open) return null
  return (
    <div
      ref={panel}
      role="menu"
      style={{ width }}
      className={cn(
        'absolute top-9 z-50 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1.5 text-[12px] shadow-2xl',
        align === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Gatilho de menu com estado visual de aberto, como no HTML. */
export function triggerClass(open: boolean, tone: 'quiet' | 'solid' = 'quiet') {
  return cn(
    'flex items-center gap-2 rounded-md px-2.5 py-1 text-[11.5px] transition',
    tone === 'solid'
      ? 'border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
    open && 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  )
}
