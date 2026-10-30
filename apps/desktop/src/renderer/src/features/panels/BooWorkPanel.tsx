import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronRight, FileCode2, MessageSquare, Send, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToolCallTree } from '@/components/dsh'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Agent, Message, Run } from '../../../../shared/v9'
import type { RealtimePhase } from '../../../../shared/realtime'
import { PoliAvatar } from '../app/PoliAvatar'
import { booActivity } from '../app/boo-activity'
import { MascotStatusBubble } from '../app/MascotStatusBubble'
import { errorText } from '../app/appShellShared'
import { activityToolCall } from '../chat/tool-call'
import { useVoicePreferences } from '../realtime/preferences'

const RealtimeCall = lazy(() => import('../realtime/RealtimeCall').then(module => ({ default: module.RealtimeCall })))
const CALL_LABEL: Partial<Record<RealtimePhase, string>> = { connecting: 'Conectando…', listening: 'Ouvindo', hearing: 'Estou ouvindo você', transcribing: 'Entendendo…', thinking: 'Pensando…', speaking: 'Falando', error: 'Falha na ligação' }

export interface BooWorkPanelProps {
  assistant?: Agent
  agents: Agent[]
  selectedAgents: Agent[]
  conversationId?: string
  voiceAgentId?: string
  runs: Run[]
  messages: Message[]
  onSendMessage?: (conversationId: string, agentId: string, text: string) => Promise<unknown>
  onOpenFile?: (path: string) => void
  onOpenChat?: () => void
}

/** Outra vista da mesma conversa: gestos e prévias vêm dos eventos do turno. */
export function BooWorkPanel({ assistant, agents, selectedAgents, conversationId, voiceAgentId, runs, messages, onSendMessage, onOpenFile, onOpenChat }: BooWorkPanelProps) {
  const preferredAgentId = voiceAgentId || selectedAgents[0]?.id || ''
  const [agentId, setAgentId] = useState(preferredAgentId)
  const { mode, headphones, refreshToken } = useVoicePreferences()
  const [callPhase, setCallPhase] = useState<RealtimePhase>('idle')
  const [callError, setCallError] = useState('')
  const [sendError, setSendError] = useState('')
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const handleCallPhase = useCallback((phase: RealtimePhase) => { setCallPhase(phase); if (phase === 'connecting') setCallError('') }, [])
  useEffect(() => { setAgentId(preferredAgentId) }, [conversationId, preferredAgentId])
  const choices = (conversationId ? [...(assistant ? [assistant] : []), ...selectedAgents] : [...(assistant ? [assistant] : []), ...agents]).filter((agent, index, list) => list.findIndex(item => item.id === agent.id) === index)
  const visible = choices.find(agent => agent.id === agentId) || choices[0]
  const identity = `${conversationId || ''}:${visible?.id || ''}`
  const identityRef = useRef(identity)
  identityRef.current = identity
  useEffect(() => { setText(''); setPending(false); setSendError('') }, [identity])
  const activity = visible ? booActivity(visible.id, conversationId, runs, messages) : { state: 'idle' as const }
  const state = callPhase === 'speaking' ? 'speaking' : pending && activity.state === 'idle' ? 'working' : activity.state
  const latestTool = visible ? messages.filter(message => message.role === 'activity' && message.agentId === visible.id && message.conversationId === conversationId
    && (activity.runId ? message.runId === activity.runId : true)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) : undefined
  const toolCall = latestTool ? activityToolCall(latestTool, runs.some(run => run.id === latestTool.runId && ['running', 'waiting'].includes(run.status))) : undefined
  const status = sendError || callError || (callPhase !== 'idle' ? CALL_LABEL[callPhase] : activity.detail || (pending ? 'Enviando pedido…' : 'Pronto para ajudar'))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value || !visible || !conversationId || !onSendMessage || pending) return
    const ticket = identity
    setPending(true); setSendError('')
    try {
      await onSendMessage(conversationId, visible.id, value)
      if (identityRef.current === ticket) setText('')
    } catch (cause) { if (identityRef.current === ticket) setSendError(errorText(cause)) }
    finally { if (identityRef.current === ticket) setPending(false) }
  }
  const online = callPhase !== 'idle' ? CALL_LABEL[callPhase] || 'Em ligação' : state === 'working' ? 'Trabalhando' : state === 'waiting' ? 'Aguardando aprovação' : 'Online'
  return <section aria-label="Boo ao vivo" className="flex h-full min-h-0 flex-col gap-3 overflow-auto bg-card/20 p-4">
    <header className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {choices.length > 0 ? <Select value={visible?.id || ''} onValueChange={setAgentId}>
          <SelectTrigger aria-label="Selecionar mascote" className="h-auto w-auto max-w-full gap-2 border-0 bg-transparent p-0 text-2xl font-semibold shadow-none hover:bg-transparent focus-visible:ring-2 dark:bg-transparent" disabled={pending || callPhase !== 'idle'}>
            <SelectValue placeholder="Escolha um Boo" />
          </SelectTrigger>
          <SelectContent>{choices.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
        </Select> : <h2 className="text-2xl font-semibold">Boo</h2>}
        {visible && <>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-500"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />{online}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{visible.description || (conversationId ? 'Na mesma conversa do chat' : 'Abra uma conversa para começar')}</p>
        </>}
      </div>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Configurar voz" onClick={() => window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'voz' }))}><Settings2 className="size-4" /></Button>
      {onOpenChat && <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Voltar ao chat" onClick={onOpenChat}><MessageSquare className="size-4" /></Button>}
    </header>
    <div className="flex flex-col items-center gap-1 text-center">
      {visible ? <>
        {(sendError || callError || activity.detail) && <MascotStatusBubble text={status} />}
        {visible.avatar ? <img src={visible.avatar} alt={'Avatar de ' + visible.name} data-speaking={state === 'speaking'} className="mascot-custom-avatar size-40 max-w-full rounded-full object-cover" /> : <PoliAvatar agent={visible} size={172} state={state} expression={activity.expression || (callPhase !== 'idle' ? 'thinking' : undefined)} motionPolicy="auto" />}
      </> : <p className="text-sm text-muted-foreground">Crie um Boo para exibi-lo aqui.</p>}
      {typeof window.realtimeAPI?.onEvent === 'function'
        ? <Suspense fallback={null}><RealtimeCall variant="panel" conversationId={conversationId} agentId={visible?.id} agentName={visible?.name || 'Assistente'} mode={mode} headphones={headphones} refreshToken={refreshToken} onPhaseChange={handleCallPhase} onErrorChange={setCallError} /></Suspense>
        : <p className="text-center text-[11px] text-muted-foreground">O áudio está disponível no aplicativo desktop.</p>}
    </div>
    {toolCall && <div className="min-w-0 rounded-xl border border-border bg-card/70">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span aria-hidden="true" className={'size-2 shrink-0 rounded-full ' + (toolCall.state === 'running' ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50')} />
        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={activityOpen} onClick={() => setActivityOpen(value => !value)}>
          <span className="block text-xs font-semibold">{toolCall.state === 'running' ? 'Atividade em andamento' : 'Última atividade'}</span>
          <span className="block truncate text-xs text-muted-foreground">{latestTool?.text}</span>
        </button>
        {latestTool?.tool?.path && onOpenFile && <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={() => onOpenFile(latestTool.tool!.path!)}><FileCode2 className="size-3" />Abrir arquivo</Button>}
        <ChevronRight aria-hidden="true" className={'size-4 shrink-0 text-muted-foreground transition-transform ' + (activityOpen ? 'rotate-90' : '')} />
      </div>
      {activityOpen && <div className="max-h-72 min-w-0 overflow-auto border-t border-border px-3 py-2"><ToolCallTree call={toolCall} /></div>}
    </div>}
    <form onSubmit={event => void submit(event)} className="mt-auto flex gap-2">
      <Input aria-label="Mensagem para o Boo" placeholder="Peça algo ao Boo…" value={text} onChange={event => setText(event.target.value)} disabled={!visible || !conversationId || !onSendMessage || pending} className="min-w-0 text-xs" />
      <Button type="submit" size="icon" aria-label="Enviar ao Boo" disabled={!text.trim() || !visible || !conversationId || !onSendMessage || pending}><Send className="size-4" /></Button>
    </form>
  </section>
}
