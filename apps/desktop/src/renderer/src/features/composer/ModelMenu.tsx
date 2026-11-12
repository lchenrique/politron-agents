import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Settings } from 'lucide-react'

export type ModelMenuOption = { id: string; name: string; provider?: string }

/**
 * Seletor de modelo no formato do mock (cabeçalho mono, item de 12 px, check esmeralda
 * no ativo e atalho de provedores), com busca e grupos por provedor.
 */
export function ModelMenu({ label, options, value, inheritLabel, disabled = false, onSelect, onOpenProviders }: {
  /** Rótulo do gatilho: o modelo resolvido que será usado. */
  label: string
  options: ModelMenuOption[]
  /** Modelo escolhido; vazio quando a conversa herda o modelo do Boo. */
  value: string
  /** Nome do modelo que o Boo destinatário usa; habilita a volta à herança. */
  inheritLabel?: string
  disabled?: boolean
  onSelect: (id: string) => void
  onOpenProviders: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapper = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  // Ao abrir, começa sem filtro e com o cursor na busca.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const timer = setTimeout(() => search.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && wrapper.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (id: string) => { setOpen(false); onSelect(id) }
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    const matched = term ? options.filter(option => option.name.toLowerCase().includes(term) || option.id.toLowerCase().includes(term)) : options
    const byProvider = new Map<string, ModelMenuOption[]>()
    for (const option of matched) {
      const key = option.provider || 'Modelos'
      const list = byProvider.get(key) || []
      list.push(option)
      byProvider.set(key, list)
    }
    return [...byProvider.entries()]
  }, [options, query])
  const inheriting = value === ''

  return <div ref={wrapper} className="relative flex shrink-0 items-center">
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Selecionar modelo"
      title="Trocar modelo de IA"
      onClick={() => setOpen(current => !current)}
      className="flex h-7 max-w-[168px] items-center gap-1 rounded-full px-2 text-[11px] text-[var(--composer-model-text,var(--text-muted))] transition hover:bg-[var(--composer-hover-surface,var(--bg-hover))] hover:text-[var(--text-primary)] disabled:opacity-60"
    >
      <span className="truncate">{label}</span>
      <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-[var(--text-muted)]" />
    </button>
    {open ? <div
      role="menu"
      aria-label="Modelo Ativo"
      className="absolute right-0 bottom-full z-50 mb-2 flex w-60 flex-col border border-[var(--composer-menu-border,var(--border-default))] bg-[var(--composer-menu-surface,var(--bg-elevated))] py-1.5 text-[12px] shadow-2xl"
      // O tema remapeia a escala de raio do Tailwind (rounded-[12px] sai 4px); o mock usa 12px.
      style={{ maxHeight: 360, borderRadius: 12 }}
    >
      <div className="px-3 py-1 font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">Modelo Ativo</div>
      <div className="px-2 pb-1.5">
        <div className="flex items-center gap-1.5 border border-[var(--border-default)] bg-[var(--bg-pane)] px-2" style={{ borderRadius: 8, height: 28 }}>
          <Search aria-hidden="true" className="size-3 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={search}
            aria-label="Buscar modelo"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar modelo…"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3a3a transparent' }}>
        {groups.length === 0 ? <p className="px-3 py-2 text-[11px] text-[var(--text-muted)]">Nenhum modelo encontrado.</p> : groups.map(([provider, models]) => <div key={provider}>
          <div className="px-3 pt-1.5 pb-1 font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">{provider}</div>
          {models.map(option => {
            const active = option.id === value
            return <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-[var(--composer-menu-hover,var(--bg-hover))] ${active ? 'font-medium text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}
            >
              <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{option.name}</span>{inheriting && option.name === inheritLabel ? <span className="shrink-0 text-[10px] text-[var(--text-muted)]">do Boo</span> : null}</span>
              {active ? <Check aria-hidden="true" className="size-3 shrink-0" /> : null}
            </button>
          })}
        </div>)}
      </div>
      <div className="my-1 border-t border-[var(--border-subtle)]" />
      {!inheriting && inheritLabel ? <button
        type="button"
        onClick={() => choose('')}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--composer-menu-hover,var(--bg-hover))] hover:text-[var(--text-primary)]"
      >
        <span className="truncate">{`Voltar a herdar do Boo · ${inheritLabel}`}</span>
      </button> : null}
      <button
        type="button"
        onClick={() => { setOpen(false); onOpenProviders() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--composer-menu-hover,var(--bg-hover))]"
      >
        <Settings aria-hidden="true" className="size-3 shrink-0 text-[var(--accent-primary)]" /> Configurar provedores...
      </button>
    </div> : null}
  </div>
}
