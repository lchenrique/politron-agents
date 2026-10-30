import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Grip, MessageSquareText, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Agent, type Snapshot } from '../../../../shared/v9'
import type { RealtimeMode, RealtimePhase } from '../../../../shared/realtime'
import { emptySnapshot, errorText } from '../app/appShellShared'
import { MascotStatusBubble } from '../app/MascotStatusBubble'
import { PoliAvatar } from '../app/PoliAvatar'
import { booActivity } from '../app/boo-activity'
import { useConversationHistory } from '../chat/useConversationHistory'
import { RealtimeCall } from '../realtime/RealtimeCall'

const phaseLabels: Partial<Record<RealtimePhase, string>> = {
  connecting: 'Conectando…', listening: 'Ouvindo', hearing: 'Estou ouvindo você',
  transcribing: 'Entendendo…', thinking: 'Pensando…', speaking: 'Falando', error: 'Falha na ligação',
}

export default function FloatingMascotPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [conversationId, setConversationId] = useState<string>()
  const [agentId, setAgentId] = useState('')
  const [phase, setPhase] = useState<RealtimePhase>('idle')
  const [refreshToken, setRefreshToken] = useState(0)
  const [mode, setMode] = useState<RealtimeMode>(() => localStorage.getItem('politron.realtime.mode') === 'free' ? 'free' : 'gemini')
  const [headphones, setHeadphones] = useState(() => localStorage.getItem('politron.realtime.headphones') === 'true')
  const [error, setError] = useState('')
  const [textInputOpen, setTextInputOpen] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [textPending, setTextPending] = useState(false)
  const [textReply, setTextReply] = useState('')
  const { messages: activityMessages, queueMessage } = useConversationHistory(conversationId, setError)

  useEffect(() => {
    document.documentElement.classList.add('floating-mascot-document')
    document.body.classList.add('floating-mascot-document')
    return () => { document.documentElement.classList.remove('floating-mascot-document'); document.body.classList.remove('floating-mascot-document') }
  }, [])
  useEffect(() => {
    const syncSettings = (event: StorageEvent) => {
      if (event.key === 'politron.realtime.mode') setMode(event.newValue === 'free' ? 'free' : 'gemini')
      if (event.key === 'politron.realtime.headphones') setHeadphones(event.newValue === 'true')
      if (event.key === 'politron.realtime.settings-version') setRefreshToken(value => value + 1)
    }
    window.addEventListener('storage', syncSettings)
    return () => window.removeEventListener('storage', syncSettings)
  }, [])
  useEffect(() => {
    let live = true
    let inFlight = false
    let refreshAgain = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const statuses = new Map<string, string>()
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return
      refreshTimer = setTimeout(() => { refreshTimer = null; void refresh() }, 100)
    }
    const refresh = async () => {
      if (inFlight) { refreshAgain = true; return }
      inFlight = true
      try {
        const data = await window.appAPI.snapshot()
        const visibleId = await window.appAPI.getVisibleConversation()
        if (!live) return
        setSnapshot(data)
        const current = data.conversations.find(item => item.id === visibleId && !item.archived) || data.conversations.find(item => !item.archived)
        setConversationId(current?.id)
        const selectedAgentId = current?.leaderAgentId || current?.agentIds[0] || data.assistant.id
        setAgentId(selectedAgentId)
      } catch (cause) { if (live) setError(errorText(cause)) }
      finally {
        inFlight = false
        if (live && refreshAgain) { refreshAgain = false; scheduleRefresh() }
      }
    }
    void refresh()
    const off = window.appAPI.onEvent(event => {
      if (event.type === 'message') queueMessage(event.message)
      if (event.type === 'changed') scheduleRefresh()
      else if (event.type === 'message' && event.message.runId && statuses.get(event.message.id) !== event.message.status) {
        if (statuses.size > 500) statuses.clear()
        statuses.set(event.message.id, event.message.status)
        scheduleRefresh()
      }
    })
    return () => { live = false; off(); if (refreshTimer !== null) clearTimeout(refreshTimer) }
  }, [queueMessage])
  useEffect(() => {
    const syncConversation = async () => {
      if (document.visibilityState === 'hidden') return
      const visibleId = await window.appAPI.getVisibleConversation().catch(() => null)
      if (!visibleId) return
      const current = snapshot.conversations.find(item => item.id === visibleId && !item.archived)
      if (!current) return
      setConversationId(visibleId)
      setAgentId(current.leaderAgentId || current.agentIds[0] || snapshot.assistant.id)
    }
    const timer = window.setInterval(() => { void syncConversation() }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot])

  const conversation = snapshot.conversations.find(item => item.id === conversationId)
  const choices = useMemo(() => {
    const ids = conversation?.agentIds || []
    return [snapshot.assistant, ...ids.map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is Agent => !!agent)]
      .filter((agent, index, all) => all.findIndex(item => item.id === agent.id) === index)
  }, [conversation, snapshot.assistant, snapshot.agents])
  const visible = choices.find(agent => agent.id === agentId) || snapshot.assistant
  const activity = booActivity(visible.id, conversationId, snapshot.runs, activityMessages)
  const avatarState = phase === 'speaking' ? 'speaking' : textPending && activity.state === 'idle' ? 'working' : activity.state
  const statusText = error ? error.slice(0, 180) : phase !== 'idle' ? phaseLabels[phase] || '' : activity.detail || (textPending ? 'Pensando…' : textReply)
  const submitText = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = textInput.trim()
    if (!value || textPending) return
    if (!conversationId) {
      setError('Abra uma conversa no Boobot antes de enviar uma mensagem ao mascote.')
      return
    }
    if (typeof window.appAPI.respondToAgent !== 'function') {
      setError('O envio de mensagens ainda não foi carregado. Reinicie o Boobot e tente novamente.')
      return
    }
    setTextPending(true)
    setTextReply('')
    setError('')
    try {
      const reply = await window.appAPI.respondToAgent(conversationId, value, visible.id)
      setTextReply(reply.slice(0, 240))
      setTextInput('')
      setTextInputOpen(false)
    } catch (cause) { setError(errorText(cause)) }
    finally { setTextPending(false) }
  }, [conversationId, textInput, textPending, visible?.id])

  return <main className="flex h-full w-full items-center justify-center overflow-hidden bg-transparent p-2">
    <div className="flex flex-col items-center gap-1">
      {statusText && <MascotStatusBubble text={statusText} className="mb-1 max-h-20 max-w-52 overflow-auto" />}
      {textInputOpen && phase === 'idle' && <form onSubmit={event => void submitText(event)} className="mb-1 flex w-52 items-center gap-1 rounded-full border border-border bg-popover p-1 shadow-lg">
        <Input autoFocus aria-label="Mensagem para o mascote" value={textInput} onChange={event => { setTextInput(event.target.value); setError('') }} placeholder="Escreva para o agente…" className="h-7 min-w-0 border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0" disabled={textPending} />
        <Button type="submit" size="icon" className="size-7 shrink-0 rounded-full" aria-label="Enviar mensagem" disabled={!textInput.trim() || textPending}><Send className="size-3.5" /></Button>
      </form>}
      <div className="relative">
        <div className="floating-mascot-no-drag">{visible?.avatar ? <img src={visible.avatar} alt={`Avatar de ${visible.name}`} data-speaking={avatarState === 'speaking'} className="mascot-custom-avatar size-40 rounded-full object-cover" /> : <PoliAvatar agent={visible} size={160} state={avatarState} expression={activity.expression || (phase !== 'idle' ? 'thinking' : undefined)} motionPolicy="auto" />}</div>
        <div className="floating-mascot-no-drag absolute bottom-3 right-3 flex items-center gap-1">
          <RealtimeCall compact conversationId={conversationId} agentId={visible?.id} agentName={visible?.name || 'Assistente'} mode={mode} headphones={headphones} refreshToken={refreshToken} onPhaseChange={setPhase} onErrorChange={setError} />
          {phase === 'idle' && <Button variant="secondary" size="icon" className="size-7 rounded-full shadow-md" aria-label="Escrever para o agente" title="Escrever" onClick={() => setTextInputOpen(value => !value)}><MessageSquareText className="size-3" /></Button>}
          <Button variant="secondary" size="icon" className="size-7 rounded-full shadow-md" aria-label="Fechar mascote flutuante" title="Fechar" onClick={() => void window.vibeAPI.windowControls.closeMascot()}><X className="size-3" /></Button>
        </div>
        <span role="img" aria-label="Arraste para mover o mascote" title="Arraste para mover" className="floating-mascot-drag absolute right-0 top-0 flex size-6 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full border border-border/80 bg-popover/90 text-muted-foreground shadow-sm"><Grip className="size-3.5" /></span>
      </div>
    </div>
  </main>
}
