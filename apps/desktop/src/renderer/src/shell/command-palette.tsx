import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft, Search, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Command palette (Ctrl K): executa ação, abre aba, chama um Boo ou troca de
 * conversa. É o mesmo modal do HTML, alimentado pelas ações reais do app.
 */

export interface PaletteAction {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setQuery(''); setActive(0); return }
    const timer = window.setTimeout(() => input.current?.focus(), 20)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const list = text
      ? actions.filter(action => `${action.group} ${action.label} ${action.hint || ''}`.toLowerCase().includes(text))
      : actions
    return list.slice(0, 60)
  }, [actions, query])

  useEffect(() => { setActive(0) }, [query])

  if (!open) return null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Buscar ou comando" className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 p-4 pt-20 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-3.5 py-2.5">
          <Terminal className="size-4 text-[var(--accent-primary)]" />
          <input
            ref={input}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => Math.min(filtered.length - 1, current + 1)) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(0, current - 1)) }
              else if (event.key === 'Enter') {
                event.preventDefault()
                const action = filtered[active]
                if (action) { onClose(); action.run() }
              }
            }}
            placeholder="Executar ação, dividir painel, chamar Boo ou abrir arquivo..."
            className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="rounded bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">ESC</kbd>
        </div>
        <div className="max-h-72 space-y-0.5 overflow-y-auto p-1.5 text-[12px]">
          {filtered.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-6 text-[12px] text-[var(--text-muted)]"><Search className="size-3.5" /> Nada encontrado para “{query}”.</p>
          ) : null}
          {filtered.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => { onClose(); action.run() }}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition',
                index === active ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded border border-[var(--border-default)] px-1 py-0.5 font-mono text-[9.5px] tracking-wide text-[var(--text-muted)] uppercase">{action.group}</span>
                <span className="truncate">{action.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                {action.hint}
                {index === active ? <CornerDownLeft className="size-3" /> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
