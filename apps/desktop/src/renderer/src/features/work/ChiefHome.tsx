import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, CalendarClock, Loader2, MessageSquare, PauseCircle, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ASSISTANT_ID, type Agent, type Mission, type Snapshot } from '../../../../shared/v9'
import { describeTrigger } from '../../../../shared/missions'
import { Avatar, AgentPresence } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import { PolitronToolApproval } from '../chat/PolitronToolApproval'
import { MissionControls, MissionReply, PhaseLabel, ProgressBar, StepList, missionPhase, missionProgress, relativeTime } from './mission-ui'

const SUGGESTIONS = [
  'Preciso lançar um novo produto. Monte uma equipe, pesquise o mercado, organize o trabalho e comece a executar. Só me procure quando precisar de uma decisão minha.',
  'Acompanhe meus projetos diariamente e resolva os problemas que estiverem dentro das suas permissões.',
  'Abra este projeto, descubra por que não está funcionando, corrija e teste.',
]
const SUGGESTION_LABELS = ['Lançar um produto', 'Acompanhar projetos todo dia', 'Descobrir e corrigir um bug']

export function ChiefHome({ snapshot, agentStates, onOpenConversation, onOpenAgent, onOpenRoutines, onNotice, canChat = true }: {
  snapshot: Snapshot
  agentStates: Record<string, 'idle' | 'working' | 'waiting'>
  onOpenConversation: (id: string) => void
  onOpenAgent: (agent: Agent) => void
  onOpenRoutines: () => void
  onNotice: (text: string) => void
  canChat?: boolean
}) {
  const chief = snapshot.agents.find(agent => agent.role === 'chief' && agent.temporaryStatus !== 'retired')
  const owners = useMemo(() => [...(chief ? [chief] : []), ...snapshot.agents.filter(agent => agent.role !== 'chief' && !agent.temporary), snapshot.assistant], [chief, snapshot.agents, snapshot.assistant])
  const projects = snapshot.workspaces.filter(workspace => !workspace.archived && workspace.name).sort((a, b) => Number(b.kind === 'free') - Number(a.kind === 'free') || a.name.localeCompare(b.name, 'pt-BR'))
  const [goal, setGoal] = useState('')
  const [workspaceId, setWorkspaceId] = useState(() => { try { return localStorage.getItem('politron.home.workspace') || '' } catch { return '' } })
  const [ownerId, setOwnerId] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const missions = snapshot.missions || []
  const open = missions.filter(mission => ['active', 'paused'].includes(mission.status)).reverse()
  const waiting = missions.filter(mission => mission.status === 'waiting').reverse()
  const finished = missions.filter(mission => ['completed', 'failed', 'cancelled'].includes(mission.status)).sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt)).slice(0, 6)
  const approvals = snapshot.approvals.filter(approval => approval.status === 'pending')
  const routines = (snapshot.routines || []).filter(routine => routine.enabled).sort((a, b) => (a.nextRunAt || '9').localeCompare(b.nextRunAt || '9')).slice(0, 4)
  const agentName = (id: string) => id === ASSISTANT_ID ? snapshot.assistant.name : snapshot.agents.find(agent => agent.id === id)?.name || 'Agente'
  const agentOf = (id: string) => id === ASSISTANT_ID ? snapshot.assistant : snapshot.agents.find(agent => agent.id === id)
  const conversationName = (id: string) => snapshot.conversations.find(item => item.id === id)?.name || 'Conversa'
  const owner = owners.find(agent => agent.id === ownerId) || owners[0]
  const selectedWorkspace = projects.find(item => item.id === workspaceId)

  const assign = async () => {
    const text = goal.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const mission = await window.appAPI.startMission({ goal: text, workspaceId: selectedWorkspace?.id || null, agentId: owner?.id })
      setGoal(''); setExpanded(mission.id)
      onNotice(`${agentName(mission.ownerAgentId)} assumiu o objetivo.`)
    } catch (error) { onNotice(errorText(error)) }
    finally { setSending(false) }
  }
  const pauseAll = async () => {
    for (const mission of open.filter(item => item.status === 'active')) await window.appAPI.missionAction(mission.id, 'pause').catch(error => onNotice(errorText(error)))
  }

  const missionRow = (mission: Mission) => {
    const phase = missionPhase(mission, snapshot.runs, snapshot.approvals)
    const { done, total, current } = missionProgress(mission)
    const isOpen = expanded === mission.id
    const last = mission.updates.at(-1)
    return <li key={mission.id} className="group">
      <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : mission.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar agent={agentOf(mission.ownerAgentId)} size="xs" state={phase === 'running' ? 'working' : phase === 'approval' || phase === 'waiting' ? 'waiting' : 'idle'} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{mission.title}</span><PhaseLabel phase={phase} className="shrink-0" /></span>
          <span className="block truncate text-xs text-muted-foreground">{current ? current.title : last?.text || 'Planejando…'}</span>
          <span className="flex items-center gap-3 pt-0.5"><ProgressBar mission={mission} /><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{total ? `${done}/${total} passos` : `turno ${mission.turns}`}</span></span>
        </span>
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && <div className="space-y-4 border-t border-border/50 bg-muted/20 px-4 py-4 sm:pl-[3.25rem]">
        <StepList steps={mission.steps} />
        {mission.result && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs leading-5 whitespace-pre-wrap">{mission.result}</div>}
        {!!mission.updates.length && <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
          {mission.updates.slice(-4).map(update => <li key={update.at + update.text} className="flex gap-2"><time className="shrink-0 tabular-nums" dateTime={update.at}>{new Date(update.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><span className="min-w-0">{update.agentId ? `${agentName(update.agentId)}: ` : ''}{update.text}</span></li>)}
        </ul>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{agentName(mission.ownerAgentId)} · turno {mission.turns}/{mission.maxTurns} · {relativeTime(mission.updatedAt)}</span>
          <div className="flex flex-wrap items-center gap-1"><MissionControls mission={mission} onNotice={onNotice} compact /><Button size="xs" variant="outline" onClick={() => onOpenConversation(mission.conversationId)}><MessageSquare className="size-3.5" />Acompanhar na conversa</Button></div>
        </div>
      </div>}
    </li>
  }

  const attention = waiting.length + approvals.length
  return <div className="min-h-0 flex-1 overflow-auto">
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8">
      <section aria-labelledby="chief-brief-title" className="max-w-3xl">
        <div className="flex items-center gap-4">
          <Avatar agent={chief || snapshot.assistant} size="md" state={chief ? agentStates[chief.id] || 'idle' : 'idle'} />
          <div className="min-w-0">
            <h1 id="chief-brief-title" className="text-balance text-2xl font-semibold tracking-tight">O que {chief?.name || 'o Chief'} deve resolver?</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Descreva o objetivo. Ele planeja, monta a equipe, executa e só chama você para decisões.</p>
          </div>
        </div>
        <form className="mt-6 rounded-2xl border border-border/80 bg-card/50 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] transition-shadow focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20"
          onSubmit={event => { event.preventDefault(); void assign() }}>
          <label htmlFor="chief-goal" className="sr-only">Objetivo para {chief?.name || 'o Chief'}</label>
          <textarea id="chief-goal" value={goal} disabled={!canChat} onChange={event => setGoal(event.target.value)} rows={3}
            onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void assign() } }}
            placeholder="Ex.: Preciso lançar um novo produto. Monte uma equipe, pesquise o mercado e comece a executar."
            className="field-sizing-content block max-h-72 min-h-24 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80" />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <select aria-label="Projeto" value={selectedWorkspace?.id || ''} onChange={event => { setWorkspaceId(event.target.value); try { localStorage.setItem('politron.home.workspace', event.target.value) } catch { /* opcional */ } }}
              className="h-8 max-w-48 truncate rounded-lg border border-border/70 bg-background px-2 text-xs text-foreground">
              <option value="">Sem projeto (Livre)</option>
              {projects.filter(item => !(item.kind === 'free' && item.name === 'Livre')).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select aria-label="Responsável" value={owner?.id || ''} onChange={event => setOwnerId(event.target.value)} className="h-8 max-w-44 truncate rounded-lg border border-border/70 bg-background px-2 text-xs text-foreground">
              {owners.map(agent => <option key={agent.id} value={agent.id}>{agent.role === 'chief' ? `${agent.name} (Chief)` : agent.name}</option>)}
            </select>
            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter</span>
            <Button type="submit" size="sm" disabled={!goal.trim() || sending || !canChat}>{sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}Atribuir</Button>
          </div>
        </form>
        {!goal && <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion, index) => <button key={suggestion} type="button" disabled={!canChat} onClick={() => setGoal(suggestion)} className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-50">{SUGGESTION_LABELS[index]}</button>)}
        </div>}
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-10">
          {attention > 0 && <section aria-labelledby="attention-title">
            <h2 id="attention-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">Precisa de você <span className="rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">{attention}</span></h2>
            <div className="space-y-3">
              {waiting.map(mission => <article key={mission.id} className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3">
                <header className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Avatar agent={agentOf(mission.ownerAgentId)} size="xs" /><span className="min-w-0 flex-1 truncate"><span className="font-medium text-foreground">{agentName(mission.ownerAgentId)}</span> · {mission.title}</span><button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onOpenConversation(mission.conversationId)}>Conversa<ArrowUpRight className="size-3" /></button></header>
                <MissionReply mission={mission} onNotice={onNotice} />
              </article>)}
              {approvals.map(approval => <div key={approval.id} className="space-y-1.5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{agentName(approval.agentId)}</span> em <button type="button" className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground" onClick={() => onOpenConversation(approval.conversationId)}>{conversationName(approval.conversationId)}<ArrowUpRight className="size-3 shrink-0" /></button></p>
                <PolitronToolApproval approval={approval} onNotice={onNotice} />
              </div>)}
            </div>
          </section>}

          <section aria-labelledby="active-title">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="active-title" className="text-sm font-semibold">Em andamento {!!open.length && <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">{open.length}</span>}</h2>
              {open.some(item => item.status === 'active') && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => void pauseAll()}><PauseCircle className="size-3.5" />Pausar tudo</Button>}
            </div>
            {open.length
              ? <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/30">{open.map(missionRow)}</ul>
              : <div className="rounded-xl border border-dashed border-border/80 px-5 py-8 text-sm leading-6 text-muted-foreground">Nenhum trabalho em andamento. Atribua um objetivo acima: o responsável registra o plano, executa com as ferramentas e continua sozinho até concluir ou precisar de você. Tudo fica salvo e é retomado se o Boobot reiniciar.</div>}
          </section>

          {!!finished.length && <section aria-labelledby="done-title">
            <h2 id="done-title" className="mb-3 text-sm font-semibold">Concluídas recentemente</h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">{finished.map(missionRow)}</ul>
          </section>}
        </div>

        <aside className="min-w-0 space-y-8" aria-label="Equipe e rotinas">
          <section aria-labelledby="team-title">
            <h2 id="team-title" className="mb-2 text-sm font-semibold">Equipe</h2>
            <ul className="space-y-0.5">
              {[...(chief ? [chief] : []), ...snapshot.agents.filter(agent => agent.role !== 'chief' && agent.temporaryStatus !== 'retired')].slice(0, 10).map(agent => <li key={agent.id}>
                <button type="button" onClick={() => onOpenAgent(agent)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                  <Avatar agent={agent} size="xs" state={agentStates[agent.id] || 'idle'} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{agent.name}</span><span className="block truncate text-[11px] text-muted-foreground">{agent.role === 'chief' ? 'Chief · coordenação' : agent.description || `@${agent.alias}`}</span></span>
                  <AgentPresence state={agentStates[agent.id] || 'idle'} />
                </button>
              </li>)}
            </ul>
            {!snapshot.agents.some(agent => agent.role !== 'chief') && <p className="px-2 pt-1 text-[11px] leading-5 text-muted-foreground">O Chief cria especialistas quando o trabalho pedir.</p>}
          </section>
          <section aria-labelledby="routines-title">
            <div className="mb-2 flex items-center justify-between"><h2 id="routines-title" className="text-sm font-semibold">Rotinas</h2><Button size="xs" variant="ghost" onClick={onOpenRoutines}>Gerenciar</Button></div>
            {routines.length ? <ul className="space-y-2">{routines.map(routine => <li key={routine.id} className="flex gap-2 px-2 text-xs"><CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate font-medium">{routine.name}</span><span className="block truncate text-[11px] text-muted-foreground">{routine.nextRunAt ? `Próxima ${relativeTime(routine.nextRunAt)}` : describeTrigger(routine.trigger)}</span></span></li>)}</ul>
              : <button type="button" onClick={onOpenRoutines} className="w-full rounded-lg border border-dashed border-border/80 px-3 py-3 text-left text-[11px] leading-5 text-muted-foreground transition-colors hover:bg-accent/40">Dê responsabilidades contínuas: revisões diárias, monitoramento, reação a mudanças.</button>}
          </section>
        </aside>
      </div>
    </div>
  </div>
}
