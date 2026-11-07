import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Brain, Wrench } from 'lucide-react'
import { DisclosureRow, TextShimmer } from '@/components/dsh'
import type { Agent, Message } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { activityToolCall, formatRunDuration, liveStep, processTitle, stepActivity } from './tool-call'
import { messagesInTurn, type Turn } from './turns'
import css from './Transcript.module.css'

/** Ferramentas de um turno encerrado: uma linha discreta ("Leu arquivos e executou comandos"); os detalhes abrem no clique. */
export function DshToolGroup({ messages, turnActive, autoOpen, children }: { messages: Message[]; turnActive: boolean; autoOpen?: boolean; agent?: Agent; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const title = useMemo(() => processTitle(messages.map(message => stepActivity(activityToolCall(message, turnActive), message))), [messages, turnActive])
  useEffect(() => { if (autoOpen) setOpen(true) }, [autoOpen])
  return <DisclosureRow
    icon={<Wrench aria-hidden="true" />}
    title={title}
    open={open}
    expandable
    onToggle={() => setOpen(value => !value)}
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

/** Enquanto o turno roda: uma linha só, com o Boo e o passo ao vivo. Some quando a resposta começa a chegar. */
export function RunningTurnStatus({ turn, agent }: { turn: Turn; agent?: Agent }) {
  const [now, setNow] = useState(() => Date.now())
  const messages = useMemo(() => messagesInTurn(turn), [turn])
  const activities = messages.filter(message => message.role === 'activity' && message.tool?.name !== 'reasoning')
  const current = [...activities].reverse().find(message => message.tool?.status === 'running' || message.status === 'running')
  const title = turn.status === 'waiting' ? 'Aguardando sua aprovação'
    : current ? (() => { const call = activityToolCall(current, true); return liveStep(call, stepActivity(call, current)) })()
      : activities.length ? 'Pensando no próximo passo…' : 'Entendendo o assunto…'

  useEffect(() => {
    if (turn.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [turn.status])

  const elapsed = turn.startedAt === undefined ? '' : formatRunDuration(Math.max(0, now - turn.startedAt))
  return <div className={css.running} data-part="running" role="status" aria-live="polite">
    {agent && <Avatar agent={agent} size="xxs" state={turn.status === 'waiting' ? 'waiting' : 'working'} />}
    <TextShimmer active={turn.status === 'running'} className={css.runningLabel}>{title}</TextShimmer>
    {elapsed && <span className={css.endInfo} title="Tempo desde o pedido">{elapsed}</span>}
  </div>
}
