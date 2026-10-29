import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import type { ModelOptionChoice, ModelRuntimeOptions } from '../../../../shared/v9'
import type { ModelChoice } from '@/features/composer/model-options'

type Selection = Pick<ModelRuntimeOptions, 'serviceTier' | 'variant' | 'fastMode'>

export function ModelCapabilityControls({ model, selection, onChange }: {
  model: ModelChoice
  selection: Selection
  onChange: (selection: Selection) => void
}) {
  const tier = selection.serviceTier === null ? undefined
    : model.serviceTiers?.find(item => item.id === selection.serviceTier)
      || model.serviceTiers?.find(item => item.id === model.defaultServiceTier)
  const variant = model.variants?.find(item => item.id === selection.variant)
    || model.variants?.find(item => item.id === model.defaultVariant)
  const choose = (next: Selection) => onChange({ ...selection, ...next })

  return <>
    {model.serviceTiers && model.serviceTiers.length > 0 && <CapabilityGroup title="Velocidade de processamento" label="Velocidade de processamento">
      <button type="button" aria-pressed={selection.serviceTier === null || (!selection.serviceTier && !model.defaultServiceTier)}
        title="Não solicitar uma velocidade específica" onClick={() => choose({ serviceTier: null })} className={choiceClass(selection.serviceTier === null || (!selection.serviceTier && !model.defaultServiceTier))}>
        Automático
      </button>
      {model.serviceTiers.map(option => <Choice key={option.id} option={option} selected={tier?.id === option.id}
        onClick={() => choose({ serviceTier: option.id })} />)}
    </CapabilityGroup>}
    {model.variants && model.variants.length > 0 && <CapabilityGroup title="Variante do modelo" label="Variante do modelo">
      <button type="button" aria-pressed={!selection.variant} onClick={() => choose({ variant: undefined })} className={choiceClass(!selection.variant)}>
        Padrão do OpenCode
      </button>
      {model.variants.map(option => <Choice key={option.id} option={option} selected={variant?.id === option.id}
        onClick={() => choose({ variant: option.id })} />)}
    </CapabilityGroup>}
    {model.supportsFastMode && <div className="border-t border-border/70 px-3.5 py-3">
      <button type="button" role="switch" aria-checked={selection.fastMode === true} aria-label="Modo rápido"
        title="Respostas mais rápidas com custo por token maior. A disponibilidade depende do seu acesso Anthropic."
        onClick={() => choose({ fastMode: selection.fastMode !== true })}
        className="flex w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn('relative h-5 w-9 rounded-full transition-colors', selection.fastMode ? 'bg-primary' : 'bg-muted-foreground/30')}>
          <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', selection.fastMode ? 'translate-x-4' : 'translate-x-0.5')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Modo rápido</span>
          <span className="block text-[11px] text-muted-foreground">Opus compatível, com custo por token maior; o acesso depende da conta.</span>
        </span>
      </button>
    </div>}
  </>
}

function CapabilityGroup({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return <div className="border-t border-border/70 px-3.5 py-3">
    <p className="mb-2 text-xs font-semibold">{title}</p>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{children}</div>
  </div>
}

function Choice({ option, selected, onClick }: { option: ModelOptionChoice; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} title={option.description || option.name} onClick={onClick} className={choiceClass(selected)}>
    {option.name}
  </button>
}

function choiceClass(selected: boolean) {
  return cn('rounded-md border px-2 py-1 text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground')
}
