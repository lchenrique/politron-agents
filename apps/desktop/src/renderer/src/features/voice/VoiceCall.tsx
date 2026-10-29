import { useCallback, useEffect, useRef, useState } from 'react'
import { MicOff, PhoneOff, Play, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/dsh'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Agent, Message, VoiceStatus, PitVoicesInfo, PitVoiceId, PocketVoicesInfo } from '../../../../shared/v9'
import { PoliAvatar } from '../app/PoliAvatar'
import { errorText } from '../app/appShellShared'
import { VoiceRecorder } from './voice-recorder'
import { speakVoice, stopVoice } from './voice-player'

export function VoiceCall({ open, onClose, agents, messages, onSend }: {
  open: boolean
  onClose: () => void
  agents: Agent[]
  messages: Message[]
  onSend: (text: string) => Promise<void>
}) {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [pitVoices, setPitVoices] = useState<PitVoicesInfo | null>(null)
  const [pocketVoices, setPocketVoices] = useState<PocketVoicesInfo | null>(null)
  const [importingPocket, setImportingPocket] = useState(false)
  const [savingPreset, setSavingPreset] = useState(false)
  const [generatingVoice, setGeneratingVoice] = useState(false)
  const preview = useRef<{ player: HTMLAudioElement; url: string } | null>(null)
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing' | 'waiting' | 'speaking' | 'paused'>('idle')
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const [agentId, setAgentId] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcriptionMs, setTranscriptionMs] = useState<number | null>(null)
  const recorder = useRef<VoiceRecorder | null>(null)
  const active = useRef(false)
  const waitingFor = useRef(new Set<string>())
  const agent = agents.find(item => item.id === agentId) || agents[0]

  useEffect(() => {
    if (!open) return
    let live = true
    void window.appAPI.voiceStatus().then(async value => {
      if (!live) return
      setStatus(value)
      if (value.engine === 'pit-voices') {
        try { const voices = await window.appAPI.pitVoices(); if (live) setPitVoices(voices) }
        catch (cause) { if (live) setError(errorText(cause)) }
      }
      if (value.engine === 'pocket-tts') {
        try { const voices = await window.appAPI.pocketVoices(); if (live) setPocketVoices(voices) }
        catch (cause) { if (live) setError(errorText(cause)) }
      }
    }, err => { if (live) setError(errorText(err)) })
    return () => { live = false; active.current = false; recorder.current?.cancel(); recorder.current = null; stopVoice(); preview.current?.player.pause(); if (preview.current) URL.revokeObjectURL(preview.current.url); preview.current = null }
  }, [open])

  const listen = useCallback(async () => {
    if (!active.current) return
    const next = new VoiceRecorder()
    recorder.current = next
    setPhase('listening')
    setTranscriptionMs(null)
    setLevel(0)
    try {
      const wav = await next.record(true, setLevel)
      if (!active.current) return
      setPhase('transcribing')
      const transcriptionStartedAt = performance.now()
      const text = (await window.appAPI.voiceTranscribe(wav)).trim()
      setTranscriptionMs(Math.round(performance.now() - transcriptionStartedAt))
      if (!active.current) return
      if (!text) { setError('Não consegui entender a fala. Tente novamente.'); setPhase('paused'); return }
      setTranscript(text)
      waitingFor.current = new Set(messages.filter(item => item.role === 'assistant').map(item => item.id))
      setPhase('waiting')
      // Em grupos, o @alias direciona a chamada ao Boo selecionado.
      await onSend(agents.length > 1 && agent ? '@' + agent.alias + ' ' + text : text)
    } catch (cause) {
      if (active.current) { setError(errorText(cause)); active.current = false; setPhase('paused') }
    } finally { if (recorder.current === next) recorder.current = null }
  }, [agents, agent, messages, onSend])

  useEffect(() => {
    if (!open || !active.current || phase !== 'waiting') return
    const latest = [...messages].reverse().find(item => item.role === 'assistant' && !waitingFor.current.has(item.id)
      && ['completed', 'failed', 'interrupted'].includes(item.status))
    if (!latest) return
    waitingFor.current.add(latest.id)
    if (latest.status !== 'completed' || !latest.text.trim()) {
      active.current = false
      setPhase('paused')
      setError('A resposta foi interrompida ou falhou. Você pode retomar a chamada.')
      return
    }
    setPhase('speaking')
    void speakVoice(latest.text, undefined, { agentId: latest.agentId || agent?.id, concise: true }).then(() => {
      if (active.current) void listen()
    }).catch(cause => { if (active.current) { setError(errorText(cause)); active.current = false; setPhase('paused') } })
  }, [open, phase, messages, listen])

  const begin = () => {
    if (!status?.transcription) { setError('Instale o Whisper local para transcrever seu microfone.'); return }
    if (!status.speech) { setError(status.engine === 'openrouter' ? 'Informe sua chave OpenRouter abaixo antes de ligar.' : status.engine === 'pit-voices' ? 'Instale os motores locais Supertonic e Kokoro.' : status.engine === 'pocket-tts' ? 'Instale o PocketTTS local e autorize os pesos do modelo.' : 'Instale o Chatterbox local antes de ligar.'); return }
    setError('')
    waitingFor.current = new Set(messages.filter(item => item.role === 'assistant').map(item => item.id))
    active.current = true
    void listen()
  }
  const pause = () => {
    active.current = false
    recorder.current?.cancel()
    stopVoice()
    setPhase('paused')
  }
  const hangup = () => { pause(); onClose() }
  const download = async () => {
    setInstalling(true); setError('')
    try { setStatus(await window.appAPI.voiceInstall(status?.engine === 'chatterbox-pt-br' ? 'local' : 'transcription')) }
    catch (cause) { setError(errorText(cause)) }
    finally { setInstalling(false) }
  }
  const updateProvider = async (value: string) => {
    if (value !== 'realtime' && value !== 'openrouter' && value !== 'local' && value !== 'pits' && value !== 'pocket') return
    setError('')
    try {
      setStatus(await window.appAPI.voiceSetProvider(value))
      if (value === 'pits') setPitVoices(await window.appAPI.pitVoices())
      if (value === 'pocket') setPocketVoices(await window.appAPI.pocketVoices())
    }
    catch (cause) { setError(errorText(cause)) }
  }
  const saveKey = async () => {
    if (!apiKey.trim()) return
    setSavingKey(true); setError('')
    try { setStatus(await window.appAPI.voiceSaveOpenRouterKey(apiKey.trim())); setApiKey('') }
    catch (cause) { setError(errorText(cause)) }
    finally { setSavingKey(false) }
  }
  const changeVoice = async (specific: boolean) => {
    if (generatingVoice || !status?.voiceKeyConfigured) return
    setGeneratingVoice(true); setError('')
    try {
      const bytes = await window.appAPI.voiceNew(specific ? agent?.id : undefined)
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      preview.current?.player.pause()
      if (preview.current) URL.revokeObjectURL(preview.current.url)
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/mpeg' }))
      const player = new Audio(url)
      preview.current = { url, player }
      void player.play().catch(cause => setError(errorText(cause)))
      setStatus(await window.appAPI.voiceStatus())
    } catch (cause) { setError(errorText(cause)) }
    finally { setGeneratingVoice(false) }
  }
  const resetAgent = async () => {
    if (!agent) return
    setError('')
    try { await window.appAPI.voiceResetAgent(agent.id) }
    catch (cause) { setError(errorText(cause)) }
  }
  const selectPreset = async (value: string, specific: boolean) => {
    if (savingPreset) return
    setSavingPreset(true); setError('')
    try {
      const selection = await window.appAPI.setPitVoice(specific && value === 'inherit' ? null : value as PitVoiceId, specific ? agent?.id : undefined)
      setPitVoices(current => current ? { ...current, selection } : current)
    } catch (cause) { setError(errorText(cause)) }
    finally { setSavingPreset(false) }
  }
  const choosePocket = async (voiceId: string, specific: boolean) => {
    setError('')
    try {
      const selected = await window.appAPI.setPocketVoice(specific && voiceId === 'inherit' ? null : voiceId, specific ? agent?.id : undefined)
      setPocketVoices(selected)
    } catch (cause) { setError(errorText(cause)) }
  }
  const importPocket = async () => {
    setImportingPocket(true); setError('')
    try { const next = await window.appAPI.importPocketVoice(); if (next) setPocketVoices(next) }
    catch (cause) { setError(errorText(cause)) }
    finally { setImportingPocket(false) }
  }
  const optimizePocket = async () => {
    const chosen = (agent && pocketVoices?.selection.agentVoiceIds[agent.id]) || pocketVoices?.selection.defaultVoiceId
    if (!chosen || chosen === 'rafael') { setError('Importe uma voz própria antes de otimizar.'); return }
    setGeneratingVoice(true); setError('')
    try {
      setPocketVoices(await window.appAPI.optimizePocketVoice(chosen))
    } catch (cause) { setError(errorText(cause)) }
    finally { setGeneratingVoice(false) }
  }
  const previewPocket = async () => {
    setError('')
    setGeneratingVoice(true)
    try {
      const bytes = await window.appAPI.voiceSpeak('Olá, eu sou um Boo. Vamos criar algo juntos!', 1, agent?.id)
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      preview.current?.player.pause()
      if (preview.current) URL.revokeObjectURL(preview.current.url)
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/wav' }))
      const player = new Audio(url)
      preview.current = { url, player }
      await player.play()
    } catch (cause) { setError(errorText(cause)) }
    finally { setGeneratingVoice(false) }
  }
  const previewPreset = async (voiceId: PitVoiceId) => {
    setError('')
    try {
      const bytes = await window.appAPI.pitVoiceSample(voiceId)
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      preview.current?.player.pause()
      if (preview.current) URL.revokeObjectURL(preview.current.url)
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/wav' }))
      const player = new Audio(url)
      preview.current = { url, player }
      await player.play()
    } catch (cause) { setError(errorText(cause)) }
  }
  const labels = {
    idle: 'Pronto para conversar',
    listening: 'Ouvindo você…',
    transcribing: 'Transcrevendo com Whisper Small…',
    waiting: 'Aguardando a resposta do agente…',
    speaking: agent ? 'Gerando voz do ' + agent.name + '…' : 'Gerando voz…',
    paused: 'Chamada pausada',
  }
  return <Modal open={open} onClose={hangup} title="Chamada com o Boo" description="Microfone com Whisper local. Vozes dos Boos aprovadas, gratuitas e fixas por agente." closeLabel="Fechar chamada"
    className="max-h-full max-w-md" contentClassName="max-h-full overflow-y-auto">
      <div className="flex flex-col items-center gap-4 pb-2">
        {agents.length > 1 && <Select value={agent?.id || ''} onValueChange={setAgentId}>
          <SelectTrigger aria-label="Agente da chamada" className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>{agents.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>}
        <div className={'relative flex size-40 items-center justify-center rounded-full bg-primary/5 transition-shadow ' + (phase === 'speaking' ? 'ring-4 ring-primary/30' : phase === 'listening' ? 'ring-4 ring-emerald-500/25' : '')} style={phase === 'listening' ? { boxShadow: '0 0 ' + Math.min(55, 8 + level * 380) + 'px rgba(16,185,129,.23)' } : undefined}>
          {agent ? agent.avatar ? <img src={agent.avatar} alt={'Avatar de ' + agent.name} className="size-36 rounded-full object-cover" /> : <PoliAvatar agent={agent} size={142} /> : <Volume2 className="size-12 text-primary" />}
        </div>
        <div className="text-center"><p role="status" className="text-sm font-medium">{labels[phase]}</p><p className="mt-1 text-xs text-muted-foreground">{agent?.name || 'Assistente padrão'}</p></div>
        {status?.transcriptionEngine === 'whisper-small-fast' && <p className="text-[11px] text-muted-foreground">Reconhecimento: Whisper Small · português brasileiro · local</p>}
        {transcript && transcriptionMs !== null && <p className="text-[11px] text-muted-foreground">Transcrição concluída em {(transcriptionMs / 1000).toFixed(1)}s</p>}
        {transcript && <div className="w-full rounded-lg bg-muted/50 p-3 text-xs"><span className="text-muted-foreground">Você disse:</span><p className="mt-1 whitespace-pre-wrap">{transcript}</p></div>}
        {status && <div className="w-full space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Motor de voz</span>
            <Select value={status.provider || (status.engine === 'pit-voices' ? 'pits' : status.engine === 'pocket-tts' ? 'pocket' : status.engine === 'openrouter' ? 'openrouter' : 'local')} onValueChange={value => void updateProvider(value)}>
              <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Motor de voz"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Seguir vozes locais do app</SelectItem>
                <SelectItem value="pits">Vozes dos Boos · local</SelectItem>
                <SelectItem value="pocket">PocketTTS · vozes próprias locais</SelectItem>
                <SelectItem value="openrouter">OpenRouter · Fish Audio grátis</SelectItem>
                <SelectItem value="local">Chatterbox · local</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status.engine === 'pit-voices' && pitVoices && <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground">Somente as 9 vozes aprovadas. Cada Pit mantém sua voz entre conversas e reinícios.</p>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs">Voz geral</span>
              <Select value={pitVoices.selection.defaultVoiceId} onValueChange={value => void selectPreset(value, false)} disabled={savingPreset}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label="Voz geral dos Boos"><SelectValue /></SelectTrigger>
                <SelectContent>{pitVoices.choices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name} · {voice.engine}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" aria-label="Ouvir voz geral" onClick={() => void previewPreset(pitVoices.selection.defaultVoiceId)}>Ouvir</Button>
            </div>
            {agent && <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-xs" title={agent.name}>{agent.name}</span>
              <Select value={pitVoices.selection.agentVoiceIds[agent.id] ?? 'inherit'} onValueChange={value => void selectPreset(value, true)} disabled={savingPreset}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label={'Voz do Pit ' + agent.name}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="inherit">Usar voz geral</SelectItem>{pitVoices.choices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name} · {voice.engine}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" aria-label={'Ouvir voz de ' + agent.name} onClick={() => void previewPreset(pitVoices.selection.agentVoiceIds[agent.id] ?? pitVoices.selection.defaultVoiceId)}>Ouvir</Button>
            </div>}
            <p className="text-[11px] text-muted-foreground">Síntese no computador, sem OpenRouter. A primeira fala pode demorar enquanto carrega o modelo.</p>
          </div>}
          {status.engine === 'pocket-tts' && pocketVoices && <div className="space-y-2 border-t border-border/50 pt-3">
            <p className="text-xs font-medium">Vozes locais dos Boos (experimental)</p>
            <p className="text-[11px] text-muted-foreground">Sem servidor de voz. Importa WAV, MP3 ou identidade .safetensors de uma voz criada com autorização. O motor PocketTTS roda no computador.</p>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs">Voz geral</span>
              <Select value={pocketVoices.selection.defaultVoiceId} onValueChange={value => void choosePocket(value, false)}>
                <SelectTrigger aria-label="Voz geral PocketTTS" className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{pocketVoices.choices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {agent && <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-xs">{agent.name}</span>
              <Select value={pocketVoices.selection.agentVoiceIds[agent.id] || 'inherit'} onValueChange={value => void choosePocket(value, true)}>
                <SelectTrigger aria-label={'Voz PocketTTS de ' + agent.name} className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="inherit">Usar voz geral</SelectItem>{pocketVoices.choices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={importingPocket} onClick={() => void importPocket()}>{importingPocket ? 'Importando…' : 'Importar voz local'}</Button>
              <Button size="sm" variant="outline" disabled={generatingVoice || !pocketVoices.installed} onClick={() => void previewPocket()}>{generatingVoice ? 'Gerando…' : 'Testar voz'}</Button>
              <Button size="sm" variant="ghost" disabled={generatingVoice || !pocketVoices.installed || ((agent && pocketVoices.selection.agentVoiceIds[agent.id]) || pocketVoices.selection.defaultVoiceId) === 'rafael'}
                onClick={() => void optimizePocket()}>Preparar identidade</Button>
            </div>
            {!pocketVoices.installed && <p role="alert" className="text-xs text-destructive">Motor PocketTTS não instalado. Precisa do executável Windows local, sem serviço externo.</p>}
            <p className="text-[11px] text-muted-foreground">As quatro vozes prontas geram português localmente. Para clonar uma gravação WAV/MP3 e criar nova identidade, os pesos adicionais exigem autorização no Hugging Face. A inicialização do motor pode levar vários segundos.</p>
          </div>}
          {status.engine === 'openrouter' && (status.voiceKeyConfigured ?
            <p className="text-xs text-emerald-600">Chave OpenRouter configurada. Somente Fish Audio S2.1 Pro Free será utilizado.</p> :
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Cole sua chave do OpenRouter. Ela será salva criptografada neste computador, não no projeto.</p>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={apiKey} placeholder="sk-or-v1-…" onChange={event => setApiKey(event.target.value)} aria-label="Chave OpenRouter para voz" className="h-8 text-xs" />
                <Button size="sm" onClick={() => void saveKey()} disabled={savingKey || !apiKey.trim()}>Salvar</Button>
              </div>
              <a className="text-xs text-primary underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Criar chave OpenRouter</a>
            </div>)}
          {status.engine === 'openrouter' && status.voiceKeyConfigured && <div className="space-y-2 border-t border-border/50 pt-2">
            <p className="text-xs text-muted-foreground">{status.defaultVoiceReady ? 'Voz geral fixa em PT-BR. Os agentes usam essa voz, salvo quando você escolhe outra para um deles.' : 'Prepare uma voz geral brasileira fixa. Isso gera uma amostra de áudio, guardada só no seu computador.'}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={generatingVoice || !['idle', 'paused'].includes(phase)} onClick={() => void changeVoice(false)}>{generatingVoice ? 'Gerando voz…' : status.defaultVoiceReady ? 'Trocar voz geral' : 'Fixar voz geral PT-BR'}</Button>
              {agent && <Button size="sm" variant="outline" disabled={generatingVoice || !['idle', 'paused'].includes(phase)} onClick={() => void changeVoice(true)}>Nova voz para {agent.name}</Button>}
              {agent && <Button size="sm" variant="ghost" disabled={generatingVoice || !['idle', 'paused'].includes(phase)} onClick={() => void resetAgent()}>Usar voz geral</Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">Cada voz nova consome uma solicitação gratuita. Você ouvirá uma amostra; depois, a mesma referência será reutilizada.</p>
          </div>}
          {status.engine === 'chatterbox-pt-br' && <p className="text-xs text-muted-foreground">Chatterbox local em CPU; pode demorar bastante.</p>}
          {status.engine === 'pit-voices' && !status.pitSpeechInstalled && <p role="alert" className="text-xs text-destructive">Os motores locais Supertonic ou Kokoro ainda não estão disponíveis neste computador.</p>}
        </div>}
        {error && <p role="alert" className="w-full rounded-lg bg-destructive/10 p-2 text-center text-xs text-destructive">{error}</p>}
        {status && (!status.transcription || (status.engine === 'chatterbox-pt-br' && !status.localSpeechInstalled)) && <Button variant="secondary" className="w-full" disabled={installing} onClick={() => void download()}>{installing ? 'Instalando modelos locais…' : status.engine === 'openrouter' ? 'Instalar Whisper para o microfone' : 'Instalar Chatterbox PT-BR (mais de 3 GB)'}</Button>}
        <div className="flex justify-center gap-3">
          {phase === 'listening' && <Button size="lg" variant="secondary" onClick={() => recorder.current?.stop()}><MicOff className="mr-2 size-4" />Enviar fala</Button>}
          {['idle', 'paused'].includes(phase) && <Button size="lg" onClick={begin} disabled={installing}><Play className="mr-2 size-4" />{phase === 'paused' ? 'Retomar' : 'Ligar'}</Button>}
          {['waiting', 'speaking', 'transcribing'].includes(phase) && <Button variant="secondary" size="lg" onClick={pause}>Pausar</Button>}
          <Button variant="destructive" size="lg" onClick={hangup}><PhoneOff className="mr-2 size-4" />Desligar</Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Na chamada, a voz lê um trecho curto para responder mais rápido; a resposta completa permanece no chat. O Fish Audio gratuito depende de cota e conexão.</p>
      </div>
  </Modal>
}
