import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VoiceStatus } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'

/** O chat compartilha as vozes locais; motores antigos continuam opt-in. */
export function ChatSpeechSettings() {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    void window.appAPI.voiceStatus().then(value => { if (live) setStatus(value) })
      .catch(cause => { if (live) setError(errorText(cause)) })
    return () => { live = false }
  }, [])
  const select = async (provider: NonNullable<VoiceStatus['provider']>) => {
    setBusy(true); setError('')
    try { setStatus(await window.appAPI.voiceSetProvider(provider)) }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <section aria-label="Leitura das respostas" className="space-y-2 rounded-md border border-border/60 p-3 text-xs">
    <h4 className="font-medium">Botão Ouvir no chat</h4>
    <label className="block space-y-1 text-muted-foreground">Voz das respostas
      <Select value={status?.provider || 'realtime'} disabled={!status || busy}
        onValueChange={value => void select(value as NonNullable<VoiceStatus['provider']>)}>
        <SelectTrigger aria-label="Voz das respostas do chat" className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="realtime">Seguir as vozes locais abaixo · recomendado</SelectItem>
          <SelectItem value="pocket">PocketTTS · configuração anterior</SelectItem>
          <SelectItem value="pits">Supertonic/Kokoro · configuração anterior</SelectItem>
          <SelectItem value="local">Chatterbox · configuração anterior</SelectItem>
          <SelectItem value="openrouter">OpenRouter · chave e voz anteriores</SelectItem>
        </SelectContent>
      </Select>
    </label>
    <p className="text-[11px] text-muted-foreground">O alto-falante ao lado da resposta usa a voz do Boo; sem voz própria, usa a geral. No modo recomendado, Piper e PocketTTS funcionam localmente, inclusive quando a ligação usa Gemini.</p>
    {status?.provider && status.provider !== 'realtime' && <p className="text-[11px] text-muted-foreground">Usando o motor e as vozes salvos na configuração anterior. Selecione “Seguir as vozes locais abaixo” para usar as novas escolhas.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>
}
