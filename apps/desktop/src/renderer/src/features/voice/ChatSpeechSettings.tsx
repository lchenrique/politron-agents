import { useEffect, useState } from 'react'
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
  return <section aria-label="Leitura das respostas" className="space-y-2 rounded-lg border border-border/60 p-3 text-xs">
    <h4 className="font-medium">Botão Ouvir no chat</h4>
    <label className="block space-y-1 text-muted-foreground">Voz das respostas
      <select aria-label="Voz das respostas do chat" className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        value={status?.provider || 'realtime'} disabled={!status || busy}
        onChange={event => void select(event.target.value as NonNullable<VoiceStatus['provider']>)}>
        <option value="realtime">Seguir as vozes locais abaixo · recomendado</option>
        <option value="pocket">PocketTTS · configuração anterior</option>
        <option value="pits">Supertonic/Kokoro · configuração anterior</option>
        <option value="local">Chatterbox · configuração anterior</option>
        <option value="openrouter">OpenRouter · chave e voz anteriores</option>
      </select>
    </label>
    <p className="text-[11px] text-muted-foreground">O alto-falante ao lado da resposta usa a voz do Boo; sem voz própria, usa a geral. No modo recomendado, Piper e PocketTTS funcionam localmente, inclusive quando a ligação usa Gemini.</p>
    {status?.provider && status.provider !== 'realtime' && <p className="text-[11px] text-muted-foreground">Usando o motor e as vozes salvos na configuração anterior. Selecione “Seguir as vozes locais abaixo” para usar as novas escolhas.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>
}
