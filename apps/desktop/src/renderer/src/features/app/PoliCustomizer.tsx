import { memo, useState } from 'react'
import { Moon, RotateCcw, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ReactColorField } from '@/components/ui/ReactColorField'
import type { Agent } from '../../../../shared/v9'
import { BOO_DETAILS, booDetailId } from '../../../../shared/boo-details'
import { PoliAvatar, type PoliExpression } from './PoliAvatar'
import { BooFigure } from './BooFigure'
import { DEFAULT_BOO_APPEARANCE } from './boo-appearance'
import './BooStudio.css'

const swatches = ['#ffffff', '#c0b4ed', '#9bc9e9', '#a8d5be', '#edc7a9', '#e8b8c9', '#4098eb']
const states: { value: PoliExpression; label: string }[] = [
  { value: 'idle', label: 'Disponível' }, { value: 'thinking', label: 'Pensando' },
  { value: 'coding', label: 'Editando' }, { value: 'done', label: 'Concluído' },
]

export const PoliCustomizer = memo(function PoliCustomizer({ agent, onChange, onReset }: { agent: Agent; onChange: (patch: Partial<Agent>) => void; onReset?: () => void }) {
  const [expression, setExpression] = useState<PoliExpression>('idle')
  const [background, setBackground] = useState<'light' | 'dark'>('dark')
  const selectedDetail = booDetailId(agent.pitsHeadAccessory)
  return <section className="boo-studio overflow-hidden rounded-xl border border-border/70" aria-label="Boo Studio — editor do mascote">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
      <div><h3 className="text-sm font-semibold">Boo Studio</h3><p className="mt-0.5 text-xs text-muted-foreground">Cor e pequenos detalhes, com prévia ao vivo.</p></div>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { onChange({ ...DEFAULT_BOO_APPEARANCE }); onReset?.() }}><RotateCcw className="size-3.5" />Restaurar aparência</Button>
    </header>
    <div className="boo-studio__layout">
      <div className="boo-studio__preview">
        <div className={`flex flex-1 flex-col p-4 ${background === 'dark' ? 'bg-[#18191d] text-[#f4f4f6]' : 'bg-[#e3dfd8] text-[#29282e]'}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs opacity-70">Prévia</span><div className="flex gap-1" role="group" aria-label="Fundo da prévia">
            <Button type="button" variant="ghost" size="icon" aria-label="Fundo claro" aria-pressed={background === 'light'} onClick={() => setBackground('light')} className="size-7 rounded-full text-inherit hover:bg-white/10"><Sun className="size-3.5" style={{ color: background === 'dark' ? '#f4f4f6' : '#29282e' }} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Fundo escuro" aria-pressed={background === 'dark'} onClick={() => setBackground('dark')} className="size-7 rounded-full text-inherit hover:bg-white/10"><Moon className="size-3.5" style={{ color: background === 'dark' ? '#f4f4f6' : '#29282e' }} /></Button>
          </div></div>
          <div className="flex min-h-60 flex-1 flex-col items-center justify-center py-5"><PoliAvatar agent={agent} size={200} expression={expression} /><strong className="mt-2 text-sm font-medium">{agent.name || 'Boo'}</strong><span className="mt-1 text-xs opacity-70">{states.find(item => item.value === expression)?.label}</span></div>
        </div>
        <div className="space-y-3 bg-card/30 p-4"><p className="text-xs text-muted-foreground">Experimentar uma expressão</p><div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Prévia de expressões">{states.map(item => <Button key={item.value} type="button" variant="ghost" size="sm" aria-pressed={expression === item.value} onClick={() => setExpression(item.value)} className={`h-8 text-xs ${expression === item.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}>{item.label}</Button>)}</div>
          <label className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs"><span>Ativar animações</span><Checkbox checked={agent.pitsAnimate !== false} onCheckedChange={value => onChange({ pitsAnimate: value === true })} /></label>
        </div>
      </div>
      <div className="min-w-0 space-y-5 p-4 md:p-5">
        <div><ReactColorField inline label="Cor do Boo" value={agent.color || '#ffffff'} onChange={color => onChange({ color })} />
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Cores sugeridas">{swatches.map(value => <button key={value} type="button" aria-label={`Escolher cor ${value}`} aria-pressed={(agent.color || '#ffffff').toLowerCase() === value} onClick={() => onChange({ color: value })} className={`size-7 rounded-full border border-black/10 outline-offset-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${(agent.color || '#ffffff').toLowerCase() === value ? 'outline outline-2 outline-foreground' : ''}`} style={{ backgroundColor: value }} />)}</div>
        </div>
        <div className="boo-studio__details-section border-t border-border/60 pt-4"><h4 className="text-sm font-medium">Pequenos detalhes</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">O Boo já vem completo. Um detalhe é opcional.</p>
          <div className="boo-studio__details mt-3" role="group" aria-label="Pequenos detalhes">{BOO_DETAILS.map(detail => <button key={detail.id} type="button" aria-label={detail.label} aria-pressed={selectedDetail === detail.id} onClick={() => onChange({ pitsHeadAccessory: detail.id, pitsFaceAccessory: 'none', pitsAccessory: 'none' })} className={`boo-studio__detail rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${selectedDetail === detail.id ? 'border-primary/70 bg-accent/70' : 'border-border/60 hover:bg-accent/40'}`}>
            <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-md bg-[#25262b]"><BooFigure mood="idle" size={54} label="" colors={{ body: agent.color || '#ffffff' }} headAccessory={detail.id} animate={false} /></span>
            <span className="min-w-0 text-xs leading-4">{detail.label}</span>
          </button>)}</div>
        </div>
        <p className="border-t border-border/60 pt-3 text-[11px] leading-5 text-muted-foreground">Salve o agente para aplicar as alterações. A prévia não muda a conversa.</p>
      </div>
    </div>
  </section>
})
