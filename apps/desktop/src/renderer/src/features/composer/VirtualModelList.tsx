import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ModelChoice } from './model-options'

const ROW_HEIGHT = 56
const MAX_HEIGHT = 288

/** Busca no catálogo inteiro, mas mantém somente as linhas visíveis montadas. */
export function VirtualModelList({ models, providerName, value, search, onSearchChange, searchRef, onChoose }: {
  models: ModelChoice[]
  providerName: string
  value: string
  search: string
  onSearchChange: (search: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  onChoose: (value: string) => void
}) {
  const listId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('pt-BR'))
  const indexedModels = useMemo(() => models.map(model => ({
    model,
    searchable: (model.name + ' ' + (model.id || '')).toLocaleLowerCase('pt-BR'),
  })), [models])
  const filtered = useMemo(() => indexedModels
    .filter(item => !deferredSearch || item.searchable.includes(deferredSearch))
    .map(item => item.model), [indexedModels, deferredSearch])
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    initialRect: { width: 320, height: MAX_HEIGHT },
    getItemKey: index => filtered[index]?.id || filtered[index]?.name || index,
  })
  useEffect(() => {
    setActiveIndex(-1)
    virtualizer.scrollToOffset(0)
  }, [deferredSearch, virtualizer])

  const move = (direction: 'next' | 'previous' | 'first' | 'last') => {
    if (!filtered.length) return
    const available = filtered.flatMap((model, index) => model.enabled === false ? [] : [index])
    if (!available.length) return
    let next: number
    if (direction === 'first') next = available[0]
    else if (direction === 'last') next = available[available.length - 1]
    else if (direction === 'next') next = available.find(index => index > activeIndex) ?? available[0]
    else next = available.slice().reverse().find(index => index < activeIndex) ?? available[available.length - 1]
    setActiveIndex(next)
    virtualizer.scrollToIndex(next, { align: 'auto' })
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move('next') }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move('previous') }
    else if (event.key === 'Home') { event.preventDefault(); move('first') }
    else if (event.key === 'End') { event.preventDefault(); move('last') }
    else if (event.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]?.enabled !== false) {
      event.preventDefault()
      const model = filtered[activeIndex]
      onChoose(model.id || model.name)
    }
  }
  const active = activeIndex >= 0 && activeIndex < filtered.length ? `${listId}-option-${activeIndex}` : undefined
  const virtualRows = virtualizer.getVirtualItems()
  // O jsdom não mede o viewport; exibe um primeiro lote até a medição real ficar disponível.
  const visibleRows = virtualRows.length ? virtualRows : filtered.slice(0, 12).map((model, index) => ({ index, key: model.id || model.name, start: index * ROW_HEIGHT, size: ROW_HEIGHT }))

  return <div>
    <div className="flex items-center gap-2 border-b px-3">
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <Input ref={searchRef} role="combobox" aria-label="Buscar modelos" aria-expanded="true"
        aria-controls={listId} aria-activedescendant={active}
        type="search" autoComplete="off" spellCheck={false} value={search}
        onChange={event => onSearchChange(event.target.value)} onKeyDown={onKeyDown}
        placeholder="Buscar modelos…" className="h-10 w-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-sm shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0" />
      {deferredSearch && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{filtered.length}</span>}
    </div>
    {filtered.length === 0
      ? <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">{models.length ? 'Nenhum resultado encontrado.' : `Nenhum modelo disponível em ${providerName}.`}</p>
      : <div id={listId} role="listbox" aria-label={`Modelos de ${providerName}`} ref={scrollRef} className="overflow-y-auto overscroll-contain px-1.5"
          style={{ height: Math.min(filtered.length * ROW_HEIGHT, MAX_HEIGHT) }}>
          <div className="relative w-full" style={{ height: Math.max(virtualizer.getTotalSize(), filtered.length * ROW_HEIGHT) }}>
            {visibleRows.map(row => {
              const model = filtered[row.index]
              const id = model.id || model.name
              const selected = id === value
              const disabled = model.enabled === false
              return <Button key={row.key} id={`${listId}-option-${row.index}`} type="button" variant="ghost" size={null} role="option"
                aria-selected={selected} aria-disabled={disabled} disabled={disabled}
                title={model.description || model.id} onClick={() => onChoose(id)}
                onMouseEnter={() => setActiveIndex(row.index)}
                className={cn('absolute left-0 flex h-auto w-full justify-start gap-2 rounded-md px-2.5 py-0 text-left text-sm font-normal text-inherit outline-none',
                  'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
                  'disabled:pointer-events-none disabled:opacity-50',
                  activeIndex === row.index && 'bg-accent text-accent-foreground')}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
                <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">{model.name}</span>
                  {model.id && <span className="truncate text-xs text-muted-foreground">{model.id.replace(/^[^:]+:/, '')}</span>}
                </span>
              </Button>
            })}
          </div>
        </div>}
  </div>
}
