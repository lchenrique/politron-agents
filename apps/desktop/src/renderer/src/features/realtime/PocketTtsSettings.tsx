import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PocketVoicesInfo } from '../../../../shared/v9'
import type { Agent } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'

const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'
// Radix Select não aceita item com valor vazio; o estado continua usando ''.
const ALL_BOOS = '__all__'

export function PocketTtsSettings({ installed }: { installed: boolean }) {
  const [info, setInfo] = useState<PocketVoicesInfo | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.appAPI.pocketVoices().then(value => { if (live) setInfo(value) })
      .catch(cause => { if (live) setError(errorText(cause)) })
    void window.appAPI.snapshot().then(value => { if (live) setAgents(value.agents) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])
  const selected = info && (agentId ? info.selection.agentVoiceIds[agentId] || 'inherit' : info.selection.defaultVoiceId)
  const chooseVoice = async (voiceId: string) => {
    setBusy(true); setError('')
    try {
      const result = await window.appAPI.setPocketVoice(voiceId === 'inherit' ? null : voiceId, agentId || undefined)
      setInfo(result)
      setPreview(null)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const importVoice = async () => {
    setBusy(true); setError('')
    try {
      const result = await window.appAPI.importPocketVoice()
      if (result) setInfo(result)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const prepareVoice = async () => {
    if (!selected || selected === 'inherit' || ['rafael', 'vera', 'marius', 'cosette'].includes(selected)) return
    setBusy(true); setError('')
    try { setInfo(await window.appAPI.optimizePocketVoice(selected)) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  const previewVoice = async () => {
    setBusy(true); setError('')
    try {
      const bytes = await window.realtimeAPI.previewPocketVoice(agentId || undefined)
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }))
      setPreview(url)
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <section aria-label="Vozes PocketTTS" className="space-y-3 rounded-lg border border-border/60 p-3 text-xs">
    <div>
      <h4 className="font-medium">PocketTTS · vozes locais dos Boos</h4>
      <p className="mt-1 text-[11px] text-muted-foreground">Funciona no seu computador, sem servidor de voz. Escolha uma voz por Boo ou mantenha a voz geral.</p>
    </div>
    <label className="block space-y-1 text-[11px] text-muted-foreground">Configurar voz para
      <Select value={agentId || ALL_BOOS}
        onValueChange={value => { setAgentId(value === ALL_BOOS ? '' : value); setPreview(null) }}>
        <SelectTrigger aria-label="Selecionar Boo para voz" className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BOOS}>Todos os Boos · voz geral</SelectItem>
          {agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    <label className="block space-y-1 text-[11px] text-muted-foreground">Voz selecionada
      <Select value={selected || ''}
        onValueChange={value => void chooseVoice(value)} disabled={!info || busy}>
        <SelectTrigger aria-label="Selecionar voz PocketTTS" className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent>
          {agentId && <SelectItem value="inherit">Usar voz geral</SelectItem>}
          {(info?.choices || []).map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void importVoice()}>Importar voz</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !installed || !selected || selected === 'inherit' || ['rafael', 'vera', 'marius', 'cosette'].includes(selected)}
        onClick={() => void prepareVoice()}>Preparar identidade</Button>
      <Button type="button" size="sm" disabled={busy || !installed} onClick={() => void previewVoice()}>
        {busy ? 'Processando…' : 'Gerar prévia'}
      </Button>
    </div>
    {preview && <audio controls aria-label="Prévia PocketTTS" src={preview} className="w-full" />}
    {!installed && <p role="alert" className="text-xs text-amber-600">PocketTTS ainda não foi encontrado neste perfil do Boobot. O instalador beta não traz o motor embutido.</p>}
    <p className="text-[11px] leading-5 text-muted-foreground">As quatro vozes predefinidas funcionam com os pesos locais. Clonar WAV ou MP3 precisa dos pesos de clonagem autorizados no Hugging Face. A primeira frase pode levar alguns segundos.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}
