import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar, type PoliExpression } from './PoliAvatar'

type Tab = 'appearance' | 'animation' | 'states'
const swatches = ['#786bea', '#4098eb', '#32b6a0', '#f0a05b', '#ef79ac', '#393f56', '#e05e70']
const states: { value: PoliExpression; label: string }[] = [
  { value: 'idle', label: 'Disponível' },
  { value: 'thinking', label: 'Pensando' },
  { value: 'coding', label: 'Programando' },
  { value: 'done', label: 'Concluído' },
]
function Range({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void
}) {
  return <label className="block space-y-1.5 text-xs"><span className="flex items-center justify-between gap-3 text-muted-foreground"><span>{label}</span><output className="tabular-nums text-foreground">{value}{unit}</output></span><Slider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={values => onChange(values[0])} className="py-2" /></label>
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 text-xs"><span>{label}</span><Checkbox checked={checked} onCheckedChange={value => onChange(value === true)} /></label>
}
export function PoliCustomizer({ agent, onChange }: { agent: Agent; onChange: (patch: Partial<Agent>) => void }) {
  const [tab, setTab] = useState<Tab>('appearance')
  const [expression, setExpression] = useState<PoliExpression>('idle')
  const [background, setBackground] = useState<'light' | 'dark' | 'grid'>('light')
  return <div className="overflow-hidden rounded-xl border border-border/70" aria-label="Poli Studio — editor do mascote">
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
      <div><h3 className="text-sm font-semibold">Poli Studio</h3><p className="text-[11px] text-muted-foreground">Personalize o seu agente em tempo real</p></div>
      <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">SVG animado</span>
    </div>
    <div className="grid min-h-[300px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className={`flex min-h-56 flex-col items-center justify-between gap-2 p-3 ${background === 'dark' ? 'bg-slate-900 text-white' : background === 'grid' ? 'bg-[linear-gradient(45deg,#a1a1aa20_25%,transparent_25%),linear-gradient(-45deg,#a1a1aa20_25%,transparent_25%)] bg-[length:18px_18px] bg-muted/50' : 'bg-primary/[.04]'}`}>
        <div className="flex self-end gap-1">{(['light','dark','grid'] as const).map(option => <button key={option} type="button" aria-label={`Fundo ${option}`} aria-pressed={background === option} title={`Fundo ${option}`} onClick={() => setBackground(option)} className={`rounded-md border px-2 py-1 text-[10px] ${background === option ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>{option === 'light' ? '☀' : option === 'dark' ? '☾' : '▦'}</button>)}</div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <PoliAvatar agent={agent} size={168} expression={expression} />
          <strong className="text-xs">{agent.name || 'Poli'}</strong><span className="text-[11px] opacity-70">{states.find(item => item.value === expression)?.label}</span>
        </div>
        <span className="self-start text-[10px] opacity-60">Prévia do mascote, sem alterar a conversa</span>
      </div>
      <div className="border-t border-border/60 md:border-l md:border-t-0">
        <div role="tablist" aria-label="Personalização do Poli" className="flex border-b border-border/60">
          {([['appearance','Aparência'],['animation','Animação'],['states','Estados']] as const).map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={tab===value} onClick={() => setTab(value)} className={`flex-1 px-1.5 py-2 text-[11px] font-medium ${tab === value ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}>{label}</button>)}
        </div>
        <div role="tabpanel" className="max-h-[330px] space-y-3 overflow-y-auto p-3">
          {tab === 'appearance' && <>
            <p className="text-xs font-medium">Cor do corpo</p>
            <div className="flex flex-wrap gap-2">{swatches.map(value => <button key={value} type="button" aria-label={`Escolher cor ${value}`} aria-pressed={agent.color === value} onClick={() => onChange({color: value})} className={`size-7 rounded-full border-2 ${agent.color === value ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`} style={{backgroundColor:value}} />)}</div>
            <label className="flex items-center justify-between gap-3 text-xs">Cor personalizada<input type="color" aria-label="Cor do Poli" className="size-8 cursor-pointer" value={agent.color} onChange={event => onChange({color:event.target.value})} /></label>
            <div className="border-t border-border/60 pt-3"><p className="mb-2 text-xs font-medium">Olhos e formato</p><div className="space-y-3">
              <label className="flex items-center justify-between text-xs">Cor dos olhos<input type="color" aria-label="Cor dos olhos" value={agent.pitsEyeColor || '#ffffff'} onChange={event => onChange({pitsEyeColor:event.target.value})} /></label>
              <Range label="Tamanho dos olhos" value={agent.pitsEyeSize ?? 8} min={4} max={15} onChange={value => onChange({pitsEyeSize:value})} />
              <Range label="Distância dos olhos" value={(agent.pitsEyeSpacing ?? 26)*2} min={32} max={84} step={2} onChange={value => onChange({pitsEyeSpacing:value/2})} />
              <div className="grid grid-cols-3 gap-1">{([['round','Redondo'],['flat','Baixinho'],['long','Alongado']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={agent.pitsShape===value} className={`rounded-md border px-1 py-1.5 text-[10px] ${agent.pitsShape===value ? 'border-primary bg-primary/10' : 'border-border'}`} onClick={() => onChange({pitsShape:value})}>{label}</button>)}</div>
            </div></div>
            <div className="space-y-3 border-t border-border/60 pt-3"><Toggle label="Bochechas rosadas" checked={agent.pitsBlush!==false} onChange={value => onChange({pitsBlush:value})}/>{agent.pitsBlush!==false && <label className="flex items-center justify-between text-xs">Cor das bochechas<input type="color" aria-label="Cor das bochechas" value={agent.pitsCheekColor || '#f5a5d1'} onChange={event => onChange({pitsCheekColor:event.target.value})} /></label>}<Toggle label="Aura colorida" checked={agent.pitsAura!==false} onChange={value => onChange({pitsAura:value})}/></div>
          </>}
          {tab === 'animation' && <><Toggle label="Ativar animações" checked={agent.pitsAnimate!==false} onChange={value => onChange({pitsAnimate:value})}/><Range label="Velocidade da flutuação" min={1} max={6} step={.5} unit="s" value={agent.pitsSpeed ?? 3} onChange={value => onChange({pitsSpeed:value})}/><Range label="Amplitude do movimento" min={0} max={24} unit="px" value={agent.pitsAmplitude ?? 9} onChange={value => onChange({pitsAmplitude:value})}/><p className="text-[11px] text-muted-foreground">A animação reduz automaticamente quando o sistema prefere menos movimento.</p></>}
          {tab === 'states' && <><p className="text-xs font-medium">Testar expressões</p><div className="grid grid-cols-2 gap-2">{states.map(item => <button key={item.value} type="button" aria-pressed={expression===item.value} onClick={() => setExpression(item.value)} className={`rounded-md border px-2 py-2 text-xs ${expression===item.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40'}`}>{item.label}</button>)}</div><p className="text-[11px] text-muted-foreground">Durante o uso, o Politron troca a expressão automaticamente conforme o estado do agente.</p></>}
        </div>
      </div>
    </div>
  </div>
}
