import { useEffect, useMemo, useState } from 'react'
import { Brain, Database, Loader2, RefreshCw, Search, Settings2 } from 'lucide-react'
import type { Memory, MemoryScope } from '../../../../shared/memory'
import { MEMORY_KIND_LABEL, MEMORY_SCOPE_LABEL } from '../../../../shared/memory'
import { cn } from '@/lib/utils'

/**
 * Aba "Memória & MCP": o que o Boobot aprendeu sobre este computador e quais
 * servidores de ferramentas estão conectados. As memórias vêm da memoryAPI.
 */

const SCOPES: ReadonlyArray<{ id: MemoryScope | 'all'; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'global', label: 'Global' },
  { id: 'workspace', label: 'Projeto' },
  { id: 'agent', label: 'Boo' },
]

export function MemoryTab({ onOpenSettings }: { onOpenSettings?: (section?: string) => void }) {
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<MemoryScope | 'all'>('all')

  const load = () => {
    const api = window.memoryAPI
    if (!api) { setError('A memória local não está disponível nesta janela.'); return }
    setError('')
    api.list(scope === 'all' ? { limit: 200 } : { scope, limit: 200 })
      .then(setMemories)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  useEffect(load, [scope])

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return (memories || []).filter(memory => !text || memory.text.toLowerCase().includes(text))
  }, [memories, query])

  const groups = useMemo(() => {
    const map = new Map<string, Memory[]>()
    for (const memory of visible) {
      const key = memory.kind ? MEMORY_KIND_LABEL[memory.kind] : 'Sem categoria'
      const list = map.get(key) || []
      list.push(memory)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [visible])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-[38px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <Brain className="size-3.5 text-[var(--accent-primary)]" />
          <span className="font-medium text-[var(--text-primary)]">Bright Memory</span>
          <span className="font-mono text-[10.5px] text-[var(--text-muted)]">{memories ? `${memories.length} notas` : 'carregando…'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={load} title="Recarregar memórias" className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]">
            <RefreshCw className="size-3.5" />
          </button>
          <button type="button" onClick={() => onOpenSettings?.('memoria')} title="Abrir configurações de memória" className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]">
            <Settings2 className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute top-1.5 left-2 size-3.5 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar nas memórias..."
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 pr-2 pl-7 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {SCOPES.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScope(item.id)}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition',
                scope === item.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-300">{error}</p> : null}
        {!error && !memories ? (
          <div className="flex items-center gap-2 p-3 text-[12px] text-[var(--text-muted)]"><Loader2 className="size-3.5 animate-spin" /> Lendo a memória local…</div>
        ) : null}
        {memories && visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Database className="size-8 text-[var(--border-strong)]" />
            <p className="text-[12.5px] text-[var(--text-secondary)]">Nenhuma memória {query ? 'para esta busca' : 'guardada ainda'}.</p>
            <p className="max-w-sm text-[11.5px] text-[var(--text-muted)]">Peça no chat para guardar uma decisão, ou salve pela CLI do Bright Memory.</p>
          </div>
        ) : null}
        <div className="space-y-4">
          {groups.map(([label, items]) => (
            <section key={label} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="font-mono text-[10.5px] tracking-wider text-[var(--text-muted)] uppercase">{label}</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{items.length}</span>
              </div>
              {items.map(memory => (
                <article key={memory.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
                  <p className="text-[12.5px] leading-relaxed text-[var(--text-primary)]">{memory.text}</p>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-[var(--text-muted)]">
                    <span className="rounded border border-[var(--border-default)] px-1 py-0.5">{MEMORY_SCOPE_LABEL[memory.scope]}</span>
                    <span>{memory.inclusion}</span>
                    {memory.origin === 'agente' ? <span className="text-[var(--text-secondary)]">pelo Boo</span> : null}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
