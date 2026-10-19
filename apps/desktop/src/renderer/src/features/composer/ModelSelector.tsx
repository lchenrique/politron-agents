import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  const searchRef = useRef<HTMLInputElement>(null)
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
  const onOpenChange = (next: boolean) => {
    setOpen(next); setProviderId(null); setSearch(''); setActiveItem('')
  }
  const navigate = (next: string | null) => {
    setActiveItem(next ? '' : `provider:${providerId}`)
    setProviderId(next); setSearch('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }
  const choose = (next: string) => { onValueChange(next); onOpenChange(false) }
  useEffect(() => { setOpen(false); setProviderId(null); setSearch(''); setActiveItem('') }, [value, disabled])
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button type="button" variant={variant} size="sm" aria-label={label} title={selected?.provider ? `${name} · ${selected.provider}` : name} disabled={disabled} className="max-w-72 gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {selected?.provider && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{selected.provider}</span>}
        <ChevronDown data-icon="inline-end" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" aria-label="Modelos disponíveis" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus() }}
      onEscapeKeyDown={event => { if (providerId) { event.preventDefault(); navigate(null) } }}>
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

    </PopoverContent>
  </Popover>
}

export function EffortSelector({ efforts, value, onValueChange, disabled = false }: {
  efforts: ModelEffort[]
  value: ModelEffort
  onValueChange: (value: ModelEffort) => void
  disabled?: boolean
}) {
  if (!efforts.length) return null
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="sm" aria-label="Nível de esforço" disabled={disabled}>
        {EFFORT_LABELS[value]}<ChevronDown data-icon="inline-end" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top">
      <DropdownMenuRadioGroup value={value} onValueChange={next => { if (efforts.includes(next as ModelEffort)) onValueChange(next as ModelEffort) }}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Esforço</DropdownMenuLabel>
          {efforts.map(effort => <DropdownMenuRadioItem key={effort} value={effort}>{EFFORT_LABELS[effort]}</DropdownMenuRadioItem>)}
        </DropdownMenuGroup>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
