import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Agent } from '../../../../shared/v9'
import type { PiperVoice, RealtimeSettings, RealtimeStatus } from '../../../../shared/realtime'

const voices: { id: PiperVoice; name: string }[] = [
  { id: 'faber', name: 'Faber · masculina · padrão' }, { id: 'cadu', name: 'Cadu · masculina' },
  { id: 'jeff', name: 'Jeff · masculina' }, { id: 'edresson', name: 'Edresson · masculina · leve' },
  { id: 'miro', name: 'Miro · feminina · experimental · uso não comercial' },
  { id: 'dii', name: 'Dii · feminina · experimental · uso não comercial' },
]
const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'
// Radix Select não aceita item com valor vazio; o estado continua usando ''.
const ALL_BOOS = '__all__'

export function PiperTtsSettings({ status, save, install, installing }: {
  status: RealtimeStatus
  save: (patch: Partial<RealtimeSettings>) => Promise<void>
  install: (voice: PiperVoice) => Promise<void>
  installing: boolean
}) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState('')
  useEffect(() => {
    let live = true
    void window.appAPI.snapshot().then(value => { if (live) setAgents(value.agents) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  const settings = status.settings
  const selected = agentId ? settings.piperAgentVoices?.[agentId] || 'inherit' : settings.piperVoice
  const effective = selected === 'inherit' ? settings.piperVoice : selected
  const choose = async (voice: string) => {
    if (!agentId) { await save({ piperVoice: voice as PiperVoice }); return }
    const next = { ...settings.piperAgentVoices }
    if (voice === 'inherit') delete next[agentId]
    else next[agentId] = voice as PiperVoice
    await save({ piperAgentVoices: next })
  }
  return <section aria-label="Vozes Piper" className="space-y-2 rounded-lg border border-border/60 p-3 text-xs">
    <h4 className="font-medium">Piper · vozes locais</h4>
    <label className="block space-y-1 text-muted-foreground">Configurar voz para
      <Select value={agentId || ALL_BOOS} onValueChange={value => setAgentId(value === ALL_BOOS ? '' : value)}>
        <SelectTrigger aria-label="Selecionar Boo para voz Piper" className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BOOS}>Todos os Boos · voz geral</SelectItem>
          {agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    <label className="block space-y-1 text-muted-foreground">Voz selecionada
      <Select value={selected} onValueChange={value => void choose(value)}>
        <SelectTrigger aria-label="Selecionar voz Piper" className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>
          {agentId && <SelectItem value="inherit">Usar voz geral</SelectItem>}
          {voices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    {status.installedPiperVoices.includes(effective) ? <p className="text-[11px] text-emerald-600">Voz selecionada instalada. A síntese acontece localmente.</p>
      : <Button size="sm" variant="outline" disabled={installing} onClick={() => void install(effective)}>{installing ? 'Baixando voz…' : 'Baixar voz selecionada'}</Button>}
    <p className="text-[11px] text-muted-foreground">A voz do Boo tem preferência sobre a geral, no chat e nas ligações com Piper. Miro e Dii são experimentais e têm licença para uso não comercial.</p>
  </section>
}
