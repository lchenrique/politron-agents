import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Brain, Wrench } from 'lucide-react'
import { DisclosureRow, TextShimmer } from '@/components/dsh'
import type { Message } from '../../../../shared/v9'
import { activityToolCall, formatRunDuration, liveStep, processTitle, stepActivity } from './tool-call'
import { messagesInTurn, type Turn } from './turns'
import css from './Transcript.module.css'

export function DshToolGroup({ messages, turnActive, autoOpen, children }: { messages: Message[]; turnActive: boolean; autoOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const calls = useMemo(() => messages.map(message => ({ message, call: activityToolCall(message, turnActive) })), [messages, turnActive])
  // "Ao vivo" só com chamada realmente em execução; entre chamadas o turno mostra "Pensando".
  const current = [...calls].reverse().find(({ message }) => turnActive && (message.tool?.status === 'running' || message.status === 'running'))
  const title = current ? liveStep(current.call, stepActivity(current.call, current.message)) : processTitle(calls.map(({ call, message }) => stepActivity(call, message)))

  useEffect(() => { if (autoOpen) setOpen(true) }, [autoOpen])

  return <DisclosureRow
    icon={<Wrench aria-hidden="true" />}
    title={title}
    open={open}
    expandable
    onToggle={() => setOpen(value => !value)}
    running={!!current}
    className={css.group}
    rowClassName={css.groupTitle}
    leadingClassName={css.groupLeading}
    contentClassName={css.groupLabel}
  >
    <div className={css.groupBody}><div className={css.rows}>{children}</div></div>
  </DisclosureRow>
}

export function ReasoningDisclosure({ message, autoOpen }: { message: Message; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (autoOpen) setOpen(true) }, [autoOpen])
  return <DisclosureRow
    icon={<Brain aria-hidden="true" />}
    title="Raciocínio"
    open={open}
    expandable
    onToggle={() => setOpen(value => !value)}
    className={css.group}
    rowClassName={css.groupTitle}
    leadingClassName={css.groupLeading}
    contentClassName={css.groupLabel}
  >
    <div className={`${css.groupBody} ${css.reasoningBody}`}>{message.tool?.output || message.text}</div>
  </DisclosureRow>
}

export function RunningTurnStatus({ turn }: { turn: Turn }) {
  const [now, setNow] = useState(() => Date.now())
  const messages = useMemo(() => messagesInTurn(turn), [turn])
  const running = messages.some(message => message.role === 'activity' && (message.tool?.status === 'running' || message.status === 'running'))
  const title = turn.status === 'waiting' ? 'Aguardando sua aprovação' : running ? 'Em andamento' : 'Pensando'

  useEffect(() => {
    if (turn.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [turn.status])

  const elapsed = turn.startedAt === undefined ? '' : formatRunDuration(Math.max(0, now - turn.startedAt))
  return <div className={css.running} data-part="running" role="status" aria-live="polite">
    <span className={css.runningDivider} />
    <div className={css.runningContent}>
      <TextShimmer active={turn.status === 'running'}>{title}</TextShimmer>
      {elapsed && <span className={css.endInfo}>{elapsed}</span>}
    </div>
  </div>
}
