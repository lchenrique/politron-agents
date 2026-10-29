import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Menu, MenuSurface, useAnchoredPosition, useDismissOnOutsidePointer } from '@/components/dsh'
import { cn } from '@/lib/utils'
import type { ModelEffort } from '../../../../shared/v9'
import { EFFORT_LABELS, INHERIT_MODEL_NAME } from '../app/appShellShared'
import type { ModelChoice, ModelProviderChoice } from './model-options'
import { VirtualModelList } from './VirtualModelList'

export type { ModelChoice, ModelProviderChoice } from './model-options'
const providerKey = (model: ModelChoice) => model.providerId || model.provider || 'models'

/** Um popup com navegação entre CLIs e seus modelos, usando os componentes shadcn. */
export function ModelSelector({ models, providers, value, onValueChange, disabled = false, allowInherit = true, label = 'Selecionar modelo', variant = 'ghost' }: {
  models: ModelChoice[]
  providers?: ModelProviderChoice[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  allowInherit?: boolean
  label?: string
  variant?: 'ghost' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeItem, setActiveItem] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const position = useAnchoredPosition({ open, anchorRef: triggerRef, panelRef, side: 'top', align: 'start', gap: 4, margin: 12 })
  const selected = models.find(model => (model.id || model.name) === value || model.name === value)
  const providerList = useMemo(() => {
    const entries = new Map((providers || []).map(provider => [provider.id, provider]))
    for (const model of models) {
      const id = providerKey(model)
      if (!entries.has(id)) entries.set(id, { id, name: model.provider || 'Modelos' })
    }
    return [...entries.values()]
  }, [models, providers])
  const currentProvider = providerList.find(provider => provider.id === providerId)
  const currentModels = useMemo(() => providerId ? models.filter(model => providerKey(model) === providerId) : [], [models, providerId])
  const name = value === INHERIT_MODEL_NAME ? INHERIT_MODEL_NAME : selected?.name || 'Padrão do motor'
  const close = (restoreFocus = false) => {
    setOpen(false); setProviderId(null); setSearch(''); setActiveItem('')
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }
  const openSelector = () => { setProviderId(null); setSearch(''); setActiveItem(''); setOpen(true) }
  const navigate = (next: string | null) => {
    setActiveItem(next ? '' : `provider:${providerId}`)
    setProviderId(next); setSearch('')
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
  }
  const choose = (next: string) => { onValueChange(next); close(true) }
  useDismissOnOutsidePointer(rootRef, open, next => { if (!next) close() }, panelRef)
  useEffect(() => {
    if (!open) return
    const focusSearch = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(focusSearch)
  }, [open])
  useEffect(() => { setOpen(false); setProviderId(null); setSearch(''); setActiveItem('') }, [value, disabled])
  return <div ref={rootRef} className="relative inline-flex">
      <Button ref={triggerRef} type="button" variant={variant} size="sm" aria-label={label} title={selected?.provider ? `${name} · ${selected.provider}` : name} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onKeyDown={event => {
          if (!['ArrowDown', 'Enter', ' '].includes(event.key)) return
          event.preventDefault()
          if (open) close()
          else openSelector()
        }} onClick={() => open ? close() : openSelector()} className="max-w-72 gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {selected?.provider && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{selected.provider}</span>}
        <ChevronDown data-icon="inline-end" />
      </Button>
    {open && createPortal(<MenuSurface ref={panelRef} id={panelId} role="dialog" aria-label="Modelos disponíveis"
      className="fixed z-[1100] w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      style={{ position: 'fixed', zIndex: 1100, ...(position || { left: -9999, top: -9999, visibility: 'hidden' }) }}
      onKeyDownCapture={event => {
        if (event.key !== 'Escape') return
        event.preventDefault(); event.stopPropagation()
        if (providerId) navigate(null)
        else close(true)
      }}>
      {currentProvider && <div className="flex items-center gap-2 border-b p-1">
        <Button type="button" variant="ghost" size="icon" aria-label="Voltar aos provedores" onClick={() => navigate(null)}><ArrowLeft /></Button>
        <span className="flex-1 text-sm font-medium">{currentProvider.name}</span>
        <span className="px-2 text-xs text-muted-foreground">{currentModels.length} modelos</span>
      </div>}
      {!currentProvider ? <Command value={activeItem} onValueChange={setActiveItem} label="Provedores de modelos">
        <CommandInput ref={searchRef} value={search} onValueChange={setSearch} placeholder="Buscar CLI…" aria-label="Buscar CLI" />
        <CommandList className="max-h-72">
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

            <CommandGroup>
              <CommandItem value="inherit" keywords={[INHERIT_MODEL_NAME, 'Padrão do motor']} onSelect={() => choose(allowInherit ? INHERIT_MODEL_NAME : '')}>
                <Check className={cn('shrink-0', (allowInherit ? value === INHERIT_MODEL_NAME : !value) ? 'opacity-100' : 'opacity-0')} />
                {allowInherit ? INHERIT_MODEL_NAME : 'Padrão do motor'}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="CLIs">
              {providerList.map(provider => <CommandItem key={provider.id} value={`provider:${provider.id}`} keywords={[provider.name]} onSelect={() => navigate(provider.id)} title={provider.description}>
                <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                <span className="text-xs text-muted-foreground">{models.filter(model => providerKey(model) === provider.id).length}</span>
                <ChevronRight />
              </CommandItem>)}
            </CommandGroup>
        </CommandList>
      </Command> : <VirtualModelList models={currentModels} providerName={currentProvider.name}
        value={value} search={search} onSearchChange={setSearch}
        searchRef={searchRef} onChoose={choose} />}

    </MenuSurface>, document.body)}
  </div>
}

export function EffortSelector({ efforts, value, onValueChange, disabled = false }: {
  efforts: ModelEffort[]
  value: ModelEffort
  onValueChange: (value: ModelEffort) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  if (!efforts.length) return null
  return <Menu open={open} onClose={() => setOpen(false)} anchor={<Button type="button" variant="ghost" size="sm" aria-label="Nível de esforço" disabled={disabled}
    aria-haspopup="menu" aria-expanded={open} onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(value => !value) } }} onClick={() => setOpen(value => !value)}>
        {EFFORT_LABELS[value]}<ChevronDown data-icon="inline-end" />
      </Button>} items={efforts.map(effort => ({ id: effort, label: EFFORT_LABELS[effort] }))}
    selectedId={value} onSelect={effort => { if (efforts.includes(effort as ModelEffort)) onValueChange(effort as ModelEffort); setOpen(false) }}
    align="start" side="top" portal autoFocus />
}
