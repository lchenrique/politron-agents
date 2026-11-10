import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoveHorizontal, Search, SlidersHorizontal, X } from 'lucide-react'
import type { SettingsSection } from '@/features/app/SettingsPage'

const SettingsPage = lazy(() => import('@/features/app/SettingsPage').then(module => ({ default: module.SettingsPage })))

/**
 * Overlay de Configurações: janela central de 1040px com as 12 seções em duas
 * colunas, buscável, alternável para tela cheia. O conteúdo é o mesmo da página
 * real de configurações, sem duplicar lógica.
 */
export function SettingsOverlay({ open, initialSection = 'geral', onClose }: {
  open: boolean
  initialSection?: SettingsSection
  onClose: () => void
}) {
  const [fullPage, setFullPage] = useState(false)
  const [filter, setFilter] = useState('')
  const [section, setSection] = useState<SettingsSection>(initialSection)

  useEffect(() => {
    if (!open) { setFilter(''); setFullPage(false); return }
    setSection(initialSection)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, initialSection, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurações"
      style={{ contain: 'layout style paint' }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
      className={
        fullPage
          ? 'fixed inset-0 z-[60] flex items-center justify-center bg-black/85 select-none'
          : 'fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs select-none sm:p-6'
      }
    >
      <div className={fullPage
        ? 'flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-pane)]'
        : 'flex h-[88vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-pane)] shadow-2xl'}>
        <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
              <SlidersHorizontal className="size-4" />
            </div>
            <div>
              <h2 className="text-[16px] leading-tight font-semibold text-[var(--text-primary)]">Configurações</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Preferências deste computador</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden w-56 sm:block">
              <Search className="absolute top-2 left-2.5 size-3.5 text-[var(--text-muted)]" />
              <input
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder="Filtrar seção..."
                aria-label="Filtrar seção"
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 pr-2.5 pl-8 text-[12px] text-[var(--text-primary)] transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setFullPage(current => !current)}
              title={fullPage ? 'Restaurar para Modal Centralizado' : 'Expandir página em tela cheia'}
              aria-label={fullPage ? 'Restaurar para Modal Centralizado' : 'Expandir em tela cheia'}
              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <MoveHorizontal className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar Configurações (Esc)"
              aria-label="Fechar configurações"
              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[12px] text-[var(--text-muted)]">Carregando configurações…</div>}>
          <SettingsPage open embedded initialSection={section} filter={filter} onSectionChange={setSection} />
        </Suspense>
      </div>
    </div>,
    document.body,
  )
}
