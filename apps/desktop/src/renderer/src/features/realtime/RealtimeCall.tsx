import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, KeyRound, Phone, PhoneOff, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { PiperVoice, RealtimeEvent, RealtimeMode, RealtimePhase, RealtimeProvider, RealtimeSettings, RealtimeStatus } from '../../../../shared/realtime'
import { errorText } from '../app/appShellShared'
import { MicCapture, PcmPlayer } from './audio-io'
import { notifyVoiceSettings, useVoicePreferences } from './preferences'

const PHASE_LABEL: Record<RealtimePhase, string> = {
  idle: 'Desligado', connecting: 'Conectando…', listening: 'Ouvindo', hearing: 'Você está falando…',
  transcribing: 'Entendendo…', thinking: 'Pensando…', speaking: 'Falando', error: 'Erro',
}
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']
const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'

function KeyField({ provider, label, help, configured, onSaved }: { provider: RealtimeProvider; label: string; help: string; configured: boolean; onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const save = async () => {
    setBusy(true); setError(''); setFeedback('')
    try { await window.realtimeAPI.saveKey(provider, value); setValue(''); setFeedback('Chave salva. Será usada na próxima ligação.'); onSaved() } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }
  const remove = async () => { setBusy(true); setError(''); setFeedback(''); try { await window.realtimeAPI.clearKey(provider); setValue(''); setFeedback('Chave removida.'); onSaved() } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) } }
  return <FieldGroup><Field><FieldLabel htmlFor={'voice-key-' + provider}><KeyRound />{label}</FieldLabel><Input id={'voice-key-' + provider} type="password" autoComplete="off" value={value} onChange={event => { setValue(event.target.value); setFeedback('') }} placeholder={configured ? 'Chave configurada; cole outra para substituir' : 'Cole a chave aqui'} /><FieldDescription>{help}</FieldDescription></Field><div className="flex gap-2"><Button size="sm" onClick={() => void save()} disabled={busy || !value.trim()}>{configured ? 'Substituir chave' : 'Salvar chave'}</Button>{configured && <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>Remover chave</Button>}</div>{feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</FieldGroup>
}

/** Preferências da ligação ficam fora da tela telefônica do mascote. */
export function RealtimeSettingsPanel() {
  const { mode, setMode: onModeChange, headphones, setHeadphones: onHeadphonesChange } = useVoicePreferences()
  const [credentialRevision, setCredentialRevision] = useState(0)
  const open = true
  const [status, setStatus] = useState<RealtimeStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installingExtra, setInstallingExtra] = useState('')
  const refresh = useCallback(async () => { try { setStatus(await window.realtimeAPI.status()) } catch (cause) { setError(errorText(cause)) } }, [])
  const notifySaved = () => {
    notifyVoiceSettings()
  }
  useEffect(() => { if (open) void refresh() }, [open, refresh])
  const hasKey = mode === 'gemini' ? status?.geminiKey : status?.settings?.transcriptionModel === 'parakeet-v3' || status?.groqKey
  useEffect(() => {
    if (!open || !hasKey || mode !== 'gemini') { setModels([]); return }
    let live = true
    const load = window.realtimeAPI.geminiModels()
    load.then(list => { if (live) setModels(list) }).catch(cause => { if (live) setError(errorText(cause)) })
    return () => { live = false }
  }, [open, mode, hasKey, credentialRevision])
  const settings = status?.settings
  const saveSetting = async (patch: Parameters<typeof window.realtimeAPI.saveSettings>[0]) => {
    try { const next = await window.realtimeAPI.saveSettings(patch); setStatus(current => current && { ...current, settings: next }); notifySaved() } catch (cause) { setError(errorText(cause)) }
  }
  const install = async () => {
    setInstalling(true); setError('')
    try { setStatus(await window.realtimeAPI.installLocalModels()); notifySaved() } catch (cause) { setError(errorText(cause)) } finally { setInstalling(false) }
  }
  const installParakeet = async () => {
    setInstallingExtra('parakeet'); setError('')
    try { setStatus(await window.realtimeAPI.installParakeet()); notifySaved() } catch (cause) { setError(errorText(cause)) } finally { setInstallingExtra('') }
  }
  const installVoice = async (voice: PiperVoice) => {
    setInstallingExtra(voice); setError('')
    try { setStatus(await window.realtimeAPI.installPiperVoice(voice)); notifySaved() } catch (cause) { setError(errorText(cause)) } finally { setInstallingExtra('') }
  }
  const piperVoices: { id: PiperVoice; label: string; detail: string }[] = [
    { id: 'faber', label: 'Faber', detail: 'masculina · padrão' },
    { id: 'cadu', label: 'Cadu', detail: 'masculina · média' },
    { id: 'jeff', label: 'Jeff', detail: 'masculina · média' },
    { id: 'edresson', label: 'Edresson', detail: 'masculina · leve' },
    { id: 'miro', label: 'Miro', detail: 'feminina · experimental · uso não comercial' },
    { id: 'dii', label: 'Dii', detail: 'feminina · experimental · uso não comercial' },
  ]
  return <section aria-label="Preferências de voz" className="flex flex-col gap-4">
      <div><h3 className="flex items-center gap-2 text-base"><Settings2 className="size-4" />Configurar voz</h3>
        <p className="text-xs text-muted-foreground">Preferências gerais para o mascote do app e o flutuante. Alterações valem na próxima ligação.</p></div>
      <div role="radiogroup" aria-label="Motor de voz" className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 p-1">
        {([['gemini', 'Gemini Live', 'Voz Gemini · resposta do Boo'], ['free', 'Agente + voz local', 'ASR e Piper configuráveis']] as const).map(([value, label, hint]) =>
          <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => onModeChange(value)}
            className={`rounded-md px-2 py-1.5 text-left text-xs transition-colors ${mode === value ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}>
            {label}<span className="block text-[10px] font-normal text-muted-foreground">{hint}</span>
          </button>)}
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={headphones} onChange={event => onHeadphonesChange(event.target.checked)} /><span>Estou de fone. Permite interromper o agente enquanto ele fala.</span></label>
      {status && (mode === 'gemini'
        ? <KeyField provider="gemini" configured={!!status.geminiKey} label="Chave do Gemini Live" help="Chave do Google AI Studio. O uso depende dos limites da sua conta." onSaved={() => { setCredentialRevision(value => value + 1); void refresh(); notifySaved() }} />
        : <KeyField provider="groq" configured={!!status.groqKey} label="Chave do Groq para Whisper" help="Usada somente para transcrever sua fala pela internet. Com Parakeet local, essa chave não é necessária." onSaved={() => { void refresh(); notifySaved() }} />)}
      {status && mode === 'free' && <div className="space-y-3 rounded-lg border border-border/60 p-3 text-xs">
        <p>O agente selecionado no mascote gera a resposta usando o runtime e o modelo já configurados para ele (Codex ou Claude). Silero detecta a fala e Piper sintetiza a voz localmente. Whisper usa Groq para transcrever; Parakeet faz isso no computador.</p>
        <label className="block space-y-1 text-[11px] text-muted-foreground">Modelo de transcrição (ASR)
          <select className={selectClass} value={settings?.transcriptionModel || 'whisper-large-v3-turbo'} onChange={event => void saveSetting({ transcriptionModel: event.target.value as RealtimeSettings['transcriptionModel'] })}>
            <option value="whisper-large-v3-turbo">Whisper Large V3 Turbo · Groq na nuvem · rápido</option>
            <option value="whisper-large-v3">Whisper Large V3 · Groq na nuvem · mais preciso</option>
            <option value="parakeet-v3">Parakeet V3 · local · português · ~680 MB</option>
          </select>
        </label>
        {settings?.transcriptionModel === 'parakeet-v3' && !status.parakeetInstalled && <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">O Parakeet roda no computador e só é baixado quando você pedir.</span><Button size="sm" variant="outline" onClick={() => void installParakeet()} disabled={!!installingExtra}>{installingExtra === 'parakeet' ? 'Baixando Parakeet…' : 'Baixar Parakeet'}</Button></div>}
        {settings?.transcriptionModel === 'parakeet-v3' && status.parakeetInstalled && <p className="text-[11px] text-emerald-600">Parakeet instalado. A transcrição fica no computador.</p>}
        <div className="space-y-1.5 border-t border-border/50 pt-2">
          <label className="block space-y-1 text-[11px] text-muted-foreground">Voz de resposta (TTS) · Piper local
            <select className={selectClass} value={settings?.piperVoice || 'faber'} onChange={event => void saveSetting({ piperVoice: event.target.value as PiperVoice })}>
              {piperVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.label} · {voice.detail}</option>)}
            </select>
          </label>
          {settings?.piperVoice && !status.installedPiperVoices.includes(settings.piperVoice) && status.vadInstalled && <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Baixa só a voz escolhida (cerca de 64 MB).</span><Button size="sm" variant="outline" onClick={() => void installVoice(settings.piperVoice)} disabled={!!installingExtra}>{installingExtra === settings.piperVoice ? 'Baixando voz…' : 'Baixar voz'}</Button></div>}
          {status.installedPiperVoices.includes(settings?.piperVoice || 'faber') && <p className="text-[11px] text-emerald-600">Voz selecionada instalada. A síntese acontece localmente.</p>}
          {!status.vadInstalled && <Button size="sm" variant="outline" onClick={() => void install()} disabled={installing || !!installingExtra}><Download className="size-3.5" />{installing ? 'Baixando motor e voz…' : 'Baixar Silero e voz selecionada'}</Button>}
          <p className="text-[10px] text-muted-foreground">Miro e Dii são vozes comunitárias experimentais com licença para uso não comercial.</p>
        </div>
      </div>}
      {mode === 'gemini' && <p className="text-[11px] text-muted-foreground">O Gemini escuta e dá voz ao agente selecionado. As respostas, ferramentas e permissões são as do próprio Boo, com o modelo configurado no perfil dele.</p>}
      {settings && mode === 'gemini' && hasKey && <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[11px] text-muted-foreground">Modelo
          <select className={selectClass} value={settings.geminiModel} onChange={event => void saveSetting({ geminiModel: event.target.value })}>
            <option value="">Automático</option>
            {models.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">Voz
          <select className={selectClass} value={settings.geminiVoice} onChange={event => void saveSetting({ geminiVoice: event.target.value })}>{GEMINI_VOICES.map(voice => <option key={voice}>{voice}</option>)}</select>
        </label>
      </div>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}

/** Tela de telefonema do mascote: mantém o foco no agente e nos controles da ligação. */
export function RealtimeCall({ conversationId, agentId, agentName, mode, headphones, refreshToken = 0, onPhaseChange, onErrorChange, compact = false }: { conversationId?: string; agentId?: string; agentName: string; mode: RealtimeMode; headphones: boolean; refreshToken?: number; onPhaseChange?: (phase: RealtimePhase) => void; onErrorChange?: (error: string) => void; compact?: boolean }) {
  const [status, setStatus] = useState<RealtimeStatus | null>(null)
  const [phase, setPhase] = useState<RealtimePhase>('idle')
  const phaseRef = useRef<RealtimePhase>('idle')
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const mic = useRef<MicCapture | null>(null)
  const player = useRef<PcmPlayer | null>(null)
  const headphonesRef = useRef(headphones)
  headphonesRef.current = headphones
  const reportError = useCallback((message: string) => { setError(message); onErrorChange?.(message) }, [onErrorChange])
  const refresh = useCallback(async () => { try { setStatus(await window.realtimeAPI.status()) } catch (cause) { reportError(errorText(cause)) } }, [reportError])
  const updatePhase = useCallback((value: RealtimePhase) => { phaseRef.current = value; setPhase(value); onPhaseChange?.(value) }, [onPhaseChange])
  useEffect(() => { void refresh() }, [refresh, refreshToken])
  const hasKey = mode === 'gemini' ? status?.geminiKey : status?.settings?.transcriptionModel === 'parakeet-v3' || status?.groqKey
  // The renderer can briefly talk to an older main-process instance during hot reload.
  // Treat newly added status fields as optional so that a partial response never crashes the whole window.
  const installedPiperVoices = Array.isArray(status?.installedPiperVoices) ? status.installedPiperVoices : []
  const piperVoice = status?.settings?.piperVoice || 'faber'
  const transcriptionModel = status?.settings?.transcriptionModel || 'whisper-large-v3-turbo'
  const selectedModelsReady = !!status && !!status.localModels && installedPiperVoices.includes(piperVoice) && (transcriptionModel !== 'parakeet-v3' || !!status.parakeetInstalled)
  const ready = !!status && !!hasKey && (mode === 'gemini' || selectedModelsReady)
  const voiceName = status ? ({ faber: 'Faber', cadu: 'Cadu', jeff: 'Jeff', edresson: 'Edresson', miro: 'Miro', dii: 'Dii' } as const)[piperVoice] : ''
  const transcriptionName = status ? ({ 'whisper-large-v3-turbo': 'Whisper Turbo · Groq', 'whisper-large-v3': 'Whisper V3 · Groq', 'parakeet-v3': 'Parakeet V3 · local' } as const)[transcriptionModel] : ''
  const hangUp = useCallback(async () => {
    mic.current?.stop(); mic.current = null
    player.current?.close(); player.current = null
    setActive(false); setLevel(0); updatePhase('idle')
    await window.realtimeAPI.stop().catch(() => undefined)
  }, [updatePhase])
  useEffect(() => window.realtimeAPI.onEvent((event: RealtimeEvent) => {
    if (event.type === 'audio') { updatePhase('speaking'); player.current?.enqueue(event.data, event.sampleRate) }
    else if (event.type === 'interrupted') player.current?.flush()
    else if (event.type === 'phase') {
      // A cascata local anuncia o fim da geração antes de o trecho terminar de tocar.
      if (event.phase === 'listening' && phaseRef.current === 'speaking' && player.current?.isPlaying(0)) return
      updatePhase(event.phase)
    }
    else if (event.type === 'error') { updatePhase('error'); reportError(event.message) }
    else if (event.type === 'ended') { mic.current?.stop(); mic.current = null; setActive(false); setLevel(0); updatePhase('idle') }
  }), [reportError, updatePhase])
  useEffect(() => () => { void hangUp() }, [conversationId, hangUp])
  const call = async () => {
    if (!conversationId) { setError('Abra uma conversa para ligar para um agente.'); return }
    reportError('')
    updatePhase('connecting')
    let sessionReady = false
    try {
      // Abra os contextos de áudio no gesto do botão, antes de aguardar rede ou carregar modelos.
      const playback = player.current = new PcmPlayer(() => { if (phaseRef.current === 'speaking') updatePhase('listening') })
      const capture = mic.current = new MicCapture()
      await Promise.all([playback.resume(), capture.start((pcm, value) => {
        setLevel(value)
        if (!sessionReady) return
        if (!headphonesRef.current && player.current?.isPlaying()) return
        window.realtimeAPI.pushAudio(pcm)
      })])
      await window.realtimeAPI.start(mode, conversationId, agentId)
      sessionReady = true
      setActive(true)
    } catch (cause) { reportError(errorText(cause)); await hangUp() }
  }
  return <section aria-label="Ligação por voz" className={compact ? 'w-auto text-center' : 'w-full max-w-xs text-center'}>
    {!compact && <>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-2 rounded-full ${active ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'}`} />{active ? PHASE_LABEL[phase] : phase === 'connecting' ? PHASE_LABEL.connecting : `Ligar para ${agentName}`}</p>
      {active && <div className="mx-auto mt-3 flex w-36 items-center gap-2" role="img" aria-label={`Nível do microfone: ${Math.round(level * 100)}%`}><span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.min(100, level * 400)}%` }} /></span><span className="text-[10px] text-muted-foreground">Microfone</span></div>}
      {active && mode === 'free' && status && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Transcrição: {transcriptionName} · Resposta: agente selecionado · Voz: {voiceName} (Piper local)</p>}
    </>}
    <div className={compact ? 'flex items-center justify-center' : 'mt-3 flex items-center justify-center gap-5'}>
      {active
        ? <Button variant="destructive" size="icon" className={compact ? 'size-7 rounded-full shadow-md' : 'size-16 rounded-full shadow-md'} aria-label="Desligar ligação" title="Desligar" onClick={() => void hangUp()}><PhoneOff className={compact ? 'size-3' : 'size-6'} /></Button>
        : <Button size="icon" className={compact ? 'size-7 rounded-full bg-emerald-600 text-white shadow-md hover:bg-emerald-700' : 'size-16 rounded-full bg-emerald-600 text-white shadow-md hover:bg-emerald-700'} aria-label={`Ligar para ${agentName}`} title="Ligar" onClick={() => void call()} disabled={!conversationId || !ready || phase === 'connecting'}><Phone className={compact ? 'size-3' : 'size-6'} /></Button>}
    </div>
    {!compact && error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    {!compact && !active && !hasKey && <p className="mt-2 text-[11px] text-muted-foreground">Configure em Configurações → Voz em tempo real.</p>}
    {!compact && mode === 'free' && status && hasKey && !status.localModels && <p className="mt-2 text-[11px] text-muted-foreground">Baixe a voz local nas configurações para poder ligar.</p>}
  </section>
}
