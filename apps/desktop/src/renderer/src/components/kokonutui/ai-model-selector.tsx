/**
 * Adaptado de Kokonut UI AI Model Selector v1.0.0 (2026-10-15), MIT.
 * https://kokonutui.com/docs/ai/ai-model-selector
 * O renderer usa o catálogo e as capacidades reais dos CLIs do Politron,
 * mantendo a trilha de esforço e a apresentação animada do componente.
 */
import { ArrowLeft, Check, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EFFORT_LABELS, INHERIT_MODEL_NAME } from '@/features/app/appShellShared'
import { VirtualModelList } from '@/features/composer/VirtualModelList'
import type { ModelChoice, ModelProviderChoice } from '@/features/composer/model-options'
import type { ModelEffort } from '../../../../shared/v9'

interface EffortLevel { id: string; label: string; hint?: string }
interface ModelOption { id: string; name: string; efforts: EffortLevel[]; defaultEffort?: string }
export interface ModelSelection { model: string; effort?: ModelEffort }
export interface AIModelSelectorProps {
  models: ModelChoice[]
  providers?: ModelProviderChoice[]
  value: ModelSelection
  onChange: (value: ModelSelection) => void
  disabled?: boolean
  className?: string
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const EFFORT_HINTS: Partial<Record<ModelEffort, string>> = {
  low: 'Respostas rápidas para tarefas simples.',
  medium: 'Equilíbrio entre velocidade e profundidade.',
  high: 'Mais análise para tarefas complexas.',
  xhigh: 'Análise aprofundada; pode consumir mais tempo.',
  max: 'Maior esforço disponível para este modelo.',
}

const effortIndex = (model: ModelOption, effort: string) =>
  Math.max(
    0,
    model.efforts.findIndex((level) => level.id === effort)
  );

/**
 * The effort to keep when switching models: the same level if the new model
 * has it, otherwise the one at the same relative height on its track.
 */
function carryEffort(from: ModelOption, to: ModelOption, effort: string) {
  if (to.efforts.some((level) => level.id === effort)) {
    return effort;
  }
  const share =
    from.efforts.length > 1
      ? effortIndex(from, effort) / (from.efforts.length - 1)
      : 0;
  const index = Math.round(share * (to.efforts.length - 1));
  return to.efforts[index]?.id ?? to.defaultEffort ?? to.efforts[0]?.id ?? "";
}

/** Rising bars that fill to the current effort, like a signal meter. */
function EffortGlyph({ count, level }: { count: number; level: number }) {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-200",
            i <= level
              ? "bg-zinc-700 dark:bg-zinc-200"
              : "bg-zinc-300 dark:bg-zinc-600"
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars, never reordered
          key={i}
          style={{ height: `${((i + 1) / count) * 100}%` }}
        />
      ))}
    </span>
  );
}

/**
 * A detent track: drag the thumb, click a stop or use the arrow keys. The
 * thumb snaps from stop to stop while dragging, so every position is valid.
 */
function EffortTrack({
  levels,
  value,
  onChange,
  labelId,
}: {
  levels: EffortLevel[];
  value: number;
  onChange: (index: number) => void;
  labelId: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const count = levels.length;

  const indexAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) {
      return value;
    }
    const share = (clientX - rect.left) / rect.width;
    return Math.min(count - 1, Math.max(0, Math.floor(share * count)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      Home: 0,
      End: count - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      onChange(Math.min(count - 1, Math.max(0, moves[event.key])));
    }
  };

  return (
    <div
      aria-labelledby={labelId}
      aria-valuemax={count - 1}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuetext={levels[value]?.label}
      className="h-9 cursor-pointer touch-none select-none rounded-lg bg-muted/75 p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => setDragging(false)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onChange(indexAt(event.clientX));
      }}
      onPointerMove={(event) => {
        if (dragging) {
          const next = indexAt(event.clientX);
          if (next !== value) {
            onChange(next);
          }
        }
      }}
      onPointerUp={() => setDragging(false)}
      role="slider"
      tabIndex={0}
    >
      <div className="relative flex h-full" ref={trackRef}>
        {/* The thumb glides between stops, and resizes when a model has more
          or fewer levels. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 rounded-md bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-black/5 transition-[left,width] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:bg-zinc-700 dark:ring-white/10",
            dragging && "duration-150"
          )}
          style={{
            left: `${(value / count) * 100}%`,
            width: `${100 / count}%`,
          }}
        />
        {levels.map((level, index) => (
          <span
            aria-hidden="true"
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-center whitespace-nowrap text-[11px] transition-colors duration-150",
              index === value
                ? "font-medium text-zinc-900 dark:text-white"
                : "text-zinc-500 dark:text-zinc-400"
            )}
            key={level.id}
          >
            {level.label}
          </span>
        ))}
      </div>
    </div>
  );
}


const providerKey = (model: ModelChoice) => model.providerId || model.provider || 'models'
const modelKey = (model: ModelChoice) => model.id || model.name
const toTrackModel = (model: ModelChoice): ModelOption => ({
  id: modelKey(model),
  name: model.name,
  efforts: (model.efforts || []).map(effort => ({
    id: effort,
    label: EFFORT_LABELS[effort],
    hint: EFFORT_HINTS[effort],
  })),
  defaultEffort: model.defaultEffort,
})

export default function AIModelSelector({ models, providers, value, onChange, disabled = false, className }: AIModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeItem, setActiveItem] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const effortLabelId = useId()

  const providerList = useMemo(() => {
    const entries = new Map((providers || []).map(provider => [provider.id, provider]))
    for (const model of models) {
      const id = providerKey(model)
      if (!entries.has(id)) entries.set(id, { id, name: model.provider || 'Modelos' })
    }
    return [...entries.values()]
  }, [models, providers])

  const selected = models.find(model => model.enabled !== false && (modelKey(model) === value.model || model.name === value.model))
  const trackModel = selected ? toTrackModel(selected) : undefined
  const currentEffort = trackModel?.efforts.find(level => level.id === value.effort) ||
    trackModel?.efforts.find(level => level.id === selected?.defaultEffort) ||
    trackModel?.efforts[0]
  const effortIndexValue = trackModel && currentEffort ? effortIndex(trackModel, currentEffort.id) : 0
  const currentProvider = providerList.find(provider => provider.id === providerId)
  const currentModels = useMemo(() =>
    providerId ? models.filter(model => providerKey(model) === providerId) : [], [models, providerId])

  const close = () => {
    setOpen(false)
    setProviderId(null)
    setSearch('')
    setActiveItem('')
  }
  const navigate = (next: string | null) => {
    setProviderId(next)
    setActiveItem('')
    setSearch('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }
  const chooseModel = (key: string) => {
    if (key === INHERIT_MODEL_NAME) {
      onChange({ model: key })
      close()
      return
    }
    const next = models.find(model => modelKey(model) === key && model.enabled !== false)
    if (!next) return
    const nextTrack = toTrackModel(next)
    let effort = next.defaultEffort
    if (trackModel && trackModel.efforts.length && nextTrack.efforts.length && currentEffort) {
      effort = carryEffort(trackModel, nextTrack, currentEffort.id) as ModelEffort
    } else if (nextTrack.efforts.length && (!effort || !nextTrack.efforts.some(level => level.id === effort))) {
      effort = nextTrack.efforts[0].id as ModelEffort
    }
    onChange({ model: key, effort: nextTrack.efforts.length ? effort : undefined })
    close()
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (disabled) close()
  }, [disabled])
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (providerId) { event.preventDefault(); navigate(null) }
      else { close(); triggerRef.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, providerId])

  return <MotionConfig reducedMotion="user">
    <div ref={rootRef} className={cn('relative min-w-0 max-w-full', className)}>
      <button ref={triggerRef} type="button" disabled={disabled}
        aria-label="Selecionar modelo" aria-expanded={open} aria-controls={panelId}
        title={selected ? selected.name + (selected.provider ? ' · ' + selected.provider : '') : INHERIT_MODEL_NAME}
        onClick={() => { if (open) close(); else { setOpen(true); requestAnimationFrame(() => searchRef.current?.focus()) } }}
        className={cn('flex h-8 max-w-[min(16rem,100%)] items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs text-foreground',
          'outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          open && 'bg-accent')}>
        <span className="min-w-0 truncate font-medium">{selected?.name || INHERIT_MODEL_NAME}</span>
        {trackModel && currentEffort && <span className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex">
          <EffortGlyph count={trackModel.efforts.length} level={effortIndexValue} />
          {currentEffort.label}
        </span>}
        <ChevronDown aria-hidden className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <motion.div id={panelId} role="dialog" aria-label="Modelos disponíveis"
          initial={{ opacity: 0, scale: 0.97, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
          className="absolute bottom-full left-0 z-50 mb-2 w-[430px] max-w-[calc(100vw-2rem)] origin-bottom-left overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-2xl">
          {!currentProvider && <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <SlidersHorizontal aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Modelo de IA</span>
            <span className="ml-auto text-[11px] text-muted-foreground">Escolha um provedor</span>
          </div>}
          {currentProvider && <div className="flex items-center gap-2 border-b border-border/60 px-1 py-1.5">
            <Button type="button" variant="ghost" size="icon" aria-label="Voltar aos provedores" onClick={() => navigate(null)}>
              <ArrowLeft />
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{currentProvider.name}</span>
            <span className="px-2 text-xs text-muted-foreground">{currentModels.length} modelos</span>
          </div>}
          {!currentProvider
            ? <Command value={activeItem} onValueChange={setActiveItem} label="Provedores de modelos">
              <CommandInput ref={searchRef} value={search} onValueChange={setSearch} placeholder="Buscar CLI…" aria-label="Buscar CLI" />
              <CommandList className="max-h-64 p-1">
                <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="inherit" keywords={[INHERIT_MODEL_NAME, 'Padrão do motor']} onSelect={() => chooseModel(INHERIT_MODEL_NAME)}>
                    <span className="flex-1">{INHERIT_MODEL_NAME}</span>
                    {!selected && <span aria-hidden="true">✓</span>}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Provedores disponíveis">
                  {providerList.map(provider => <CommandItem key={provider.id} value={'provider:' + provider.id} keywords={[provider.name]}
                    title={provider.description} className="min-h-9 gap-2" onSelect={() => navigate(provider.id)}>
                    <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                    <span className="text-[11px] text-muted-foreground">{models.filter(model => providerKey(model) === provider.id).length} modelos</span>
                    <ChevronRight aria-hidden className="size-4" />
                  </CommandItem>)}
                </CommandGroup>
              </CommandList>
            </Command>
            : <VirtualModelList models={currentModels} providerName={currentProvider.name}
                value={value.model} search={search} onSearchChange={setSearch} searchRef={searchRef} onChoose={chooseModel} />}
          {trackModel && trackModel.efforts.length > 0 && currentEffort && <div className="border-t border-border/70 bg-muted/20 px-3.5 pb-3 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p id={effortLabelId} className="text-xs font-semibold">Esforço de raciocínio</p>
              <p className="text-[11px] text-muted-foreground">Use as setas ← →</p>
            </div>
            <EffortTrack labelId={effortLabelId} levels={trackModel.efforts} value={effortIndexValue}
              onChange={index => {
                const level = trackModel.efforts[index]
                if (level) onChange({ model: value.model, effort: level.id as ModelEffort })
              }} />
            <div className="relative mt-2 min-h-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={currentEffort.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="text-xs text-muted-foreground">
                  {currentEffort.hint}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>}
        </motion.div>}
    </div>
  </MotionConfig>
}
