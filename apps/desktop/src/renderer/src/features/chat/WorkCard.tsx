import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, CircleSlash, LoaderCircle, TerminalSquare, X } from 'lucide-react'
import { ToolCallTree } from '@/components/dsh'
import type { DshToolCall } from '@/components/dsh/tool/types'
import type { Agent, Message } from '../../../../shared/v9'
import { BooWorking } from '../app/BooWorking'
import { booColorsOf } from '../app/PoliAvatar'
import { activityToolCall, formatRunDuration, liveStep, stepActivity, type StepActivity } from './tool-call'
import css from './WorkCard.module.css'

const VISIBLE_STEPS = 6
const COMMANDS_SHOWN = 3
const NOW: Record<StepActivity, string> = { read: 'Lendo', search: 'Buscando', edit: 'Editando', commands: 'Executando', code: 'Executando código', webFetch: 'Navegando em', subagents: 'Coordenando', tools: 'Usando' }
const DONE: Record<StepActivity, string> = { read: 'Leu', search: 'Buscou', edit: 'Editou', commands: 'Executou', code: 'Executou código', webFetch: 'Navegou em', subagents: 'Coordenou', tools: 'Usou' }

type Step = { message: Message; call: DshToolCall; activity: StepActivity }

/** Alvo legível do passo: arquivo, comando ou resumo, sem quebras. */
function target(call: DshToolCall): string {
  return (call.terminal?.command || call.path || call.summary || call.title || '').replace(/\s+/g, ' ').trim()
}

/** Última linha útil da saída de um comando, para o resumo no bloco de terminal. */
function lastLine(output: string | undefined): string {
  return (output || '').split('\n').map(line => line.trim()).filter(Boolean).at(-1)?.slice(0, 160) || ''
}

function StepIcon({ state }: { state: DshToolCall['state'] }) {
  if (state === 'running') return <LoaderCircle aria-hidden="true" className={css.spin} />
  if (state === 'error') return <X aria-hidden="true" />
  if (state === 'interrupted') return <CircleSlash aria-hidden="true" />
  return <Check aria-hidden="true" />
}

/**
 * Card "Executando tarefa": cabeçalho com o passo atual e o tempo, checklist cronológico dos passos,
 * bloco de comandos no estilo terminal e o Boo do agente digitando. Cada passo abre seus detalhes.
 */
export function WorkCard({ messages, agent, turnActive }: { messages: Message[]; agent?: Agent; turnActive: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const [openStep, setOpenStep] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Ordem cronológica estável: início da ferramenta, depois criação da mensagem.
  const steps = useMemo<Step[]>(() => [...messages]
    .sort((a, b) => (a.tool?.startedAt || a.createdAt).localeCompare(b.tool?.startedAt || b.createdAt) || a.createdAt.localeCompare(b.createdAt))
    .map(message => { const call = activityToolCall(message, turnActive); return { message, call, activity: stepActivity(call, message) } }), [messages, turnActive])
  const current = [...steps].reverse().find(step => step.call.state === 'running')
  const startedAt = steps[0] ? Date.parse(steps[0].message.tool?.startedAt || steps[0].message.createdAt) : NaN
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const hidden = showAll ? 0 : Math.max(0, steps.length - VISIBLE_STEPS)
  const commands = steps.filter(step => step.call.kind === 'bash').slice(-COMMANDS_SHOWN)
  const done = steps.filter(step => step.call.state === 'success').length

  return <section className={css.card} data-part="work-card" aria-label="Executando tarefa">
    <div className={css.top}>
      <div className={css.main}>
        <header className={css.header}>
          <span className={css.headerIcon}><LoaderCircle aria-hidden="true" className={css.spin} /></span>
          <div className={css.headerText}>
            <h3 className={css.title}>Executando tarefa</h3>
            <p className={css.subtitle}>{current ? liveStep(current.call, current.activity) : 'Pensando no próximo passo'}</p>
          </div>
          <span className={css.meta}>{done}/{steps.length}{Number.isFinite(startedAt) ? ` · ${formatRunDuration(Math.max(0, now - startedAt))}` : ''}</span>
          <button type="button" className={css.collapse} aria-expanded={!collapsed} aria-label={collapsed ? 'Mostrar passos' : 'Recolher passos'} onClick={() => setCollapsed(value => !value)}>
            <ChevronDown aria-hidden="true" data-open={!collapsed} />
          </button>
        </header>
        {!collapsed && <ol className={css.steps} aria-label="Passos da tarefa">
          {hidden > 0 && <li><button type="button" className={css.more} onClick={() => setShowAll(true)}>+{hidden} {hidden === 1 ? 'passo anterior' : 'passos anteriores'}</button></li>}
          {steps.slice(hidden).map(step => {
            const open = openStep === step.message.id
            const running = step.call.state === 'running'
            const duration = step.call.durationMs !== undefined && !running ? formatRunDuration(step.call.durationMs) : ''
            return <li key={step.message.id} data-message-id={step.message.id} data-state={step.call.state}>
              <button type="button" className={css.step} aria-expanded={open} onClick={() => setOpenStep(open ? null : step.message.id)}>
                <span className={css.stepIcon} data-state={step.call.state}><StepIcon state={step.call.state} /></span>
                <span className={css.stepVerb}>{running ? NOW[step.activity] : DONE[step.activity]}</span>
                <span className={css.stepTarget} title={target(step.call)}>{target(step.call)}</span>
                {duration && <span className={css.stepTime}>{duration}</span>}
              </button>
              {open && <div className={css.stepDetail}><ToolCallTree call={step.call} /></div>}
            </li>
          })}
        </ol>}
      </div>
      {agent && !agent.avatar && <BooWorking size={collapsed ? 84 : 132} colors={booColorsOf(agent)} label={`${agent.name} está trabalhando`} />}
    </div>
    {!collapsed && commands.length > 0 && <div className={css.terminal} aria-label="Comandos executados">
      <p className={css.terminalTitle}><TerminalSquare aria-hidden="true" />Comandos executados</p>
      {commands.map(step => {
        const line = step.call.state === 'running' ? 'executando…' : lastLine(step.call.terminal?.output) || (step.call.state === 'success' ? 'concluído' : 'falhou')
        return <div key={step.message.id} className={css.command}>
          <code className={css.prompt}><span aria-hidden="true">&gt; </span>{step.call.terminal?.command}</code>
          <code className={css.result} data-state={step.call.state}>{step.call.state === 'success' ? '✓ ' : step.call.state === 'error' ? '✗ ' : ''}{line}</code>
        </div>
      })}
    </div>}
  </section>
}
