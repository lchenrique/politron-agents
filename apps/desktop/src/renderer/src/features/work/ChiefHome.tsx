import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, CalendarClock, Loader2, MessageSquare, PauseCircle, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
// Radix Select não aceita item com valor vazio; o estado e o localStorage continuam usando ''.
const NO_PROJECT = '__no-project__'

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
      <Button type="button" variant="ghost" size={null} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : mission.id)} className="flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none px-4 py-3 text-left font-normal text-inherit transition-colors hover:bg-accent/40 hover:text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar agent={agentOf(mission.ownerAgentId)} size="xs" state={phase === 'running' ? 'working' : phase === 'approval' || phase === 'waiting' ? 'waiting' : 'idle'} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{mission.title}</span><PhaseLabel phase={phase} className="shrink-0" /></span>
          <span className="block truncate text-xs text-muted-foreground">{current ? current.title : last?.text || 'Planejando…'}</span>
          <span className="flex items-center gap-3 pt-0.5"><ProgressBar mission={mission} /><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{total ? `${done}/${total} passos` : `turno ${mission.turns}`}</span></span>
        </span>
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </Button>
      {isOpen && <div className="space-y-4 border-t border-border/50 bg-muted/20 px-4 py-4 @md:pl-[3.25rem]">
        <StepList steps={mission.steps} />
        {mission.result && <div className="rounded-md border border-success/25 bg-success-soft px-3 py-2 text-xs leading-5 whitespace-pre-wrap">{mission.result}</div>}
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
  return <div className="@container min-h-0 flex-1 overflow-auto">
    <div className="ds-page max-w-5xl">
      <section aria-labelledby="chief-brief-title" className="max-w-3xl">
        <p className="ds-eyebrow mb-3">Central</p>
        <div className="flex items-center gap-4">
          <Avatar agent={chief || snapshot.assistant} size="md" state={chief ? agentStates[chief.id] || 'idle' : 'idle'} />
          <div className="min-w-0">
            <h1 id="chief-brief-title" className="ds-page-title">O que {chief?.name || 'o Chief'} deve resolver?</h1>
            <p className="ds-page-lede mt-1">Descreva o objetivo. Ele planeja, monta a equipe, executa e só chama você para decisões.</p>
          </div>
        </div>
        <form className="mt-6 rounded-2xl bg-[var(--dsw-specific-input-major,var(--card))] shadow-[var(--dsw-elevation-soft,var(--shadow-composer))] transition-shadow focus-within:shadow-[var(--dsw-elevation-prominent,var(--shadow-composer))]"
          onSubmit={event => { event.preventDefault(); void assign() }}>
          <label htmlFor="chief-goal" className="sr-only">Objetivo para {chief?.name || 'o Chief'}</label>
          <Textarea id="chief-goal" value={goal} disabled={!canChat} onChange={event => setGoal(event.target.value)} rows={3}
            onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void assign() } }}
            placeholder="Ex.: Preciso lançar um novo produto. Monte uma equipe, pesquise o mercado e comece a executar."
            className="field-sizing-content block max-h-72 min-h-24 w-full resize-none rounded-none border-0 bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 shadow-none outline-none placeholder:text-muted-foreground/80 focus-visible:ring-0 md:text-[15px] dark:bg-transparent" />
          {/* Barra de controles como a do composer do DSH: chips de 28px sem borda e botão redondo de 34px. */}
          <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-0.5">
            <Select value={selectedWorkspace?.id || NO_PROJECT} onValueChange={value => { const id = value === NO_PROJECT ? '' : value; setWorkspaceId(id); try { localStorage.setItem('politron.home.workspace', id) } catch { /* opcional */ } }}>
              <SelectTrigger aria-label="Projeto" className="max-w-48 h-7 w-auto gap-1 rounded-full border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring/35"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sem projeto (Livre)</SelectItem>
                {projects.filter(item => !(item.kind === 'free' && item.name === 'Livre')).map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={owner?.id || ''} onValueChange={setOwnerId}>
              <SelectTrigger aria-label="Responsável" className="max-w-44 h-7 w-auto gap-1 rounded-full border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring/35"><SelectValue /></SelectTrigger>
              <SelectContent>
                {owners.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.role === 'chief' ? `${agent.name} (Chief)` : agent.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="ml-auto hidden text-[11px] text-muted-foreground @md:inline">Ctrl + Enter</span>
            <Button type="submit" size={null} aria-label="Atribuir" title="Atribuir (Ctrl + Enter)" disabled={!goal.trim() || sending || !canChat} className="size-[34px] -translate-y-0.5 rounded-full bg-[var(--dsw-alias-button-info-fill,var(--primary))] text-white hover:bg-[var(--dsw-alias-button-info-fill,var(--primary))]/90 disabled:opacity-40">{sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</Button>
          </div>
        </form>
        {!goal && <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion, index) => <Button key={suggestion} type="button" variant="outline" size={null} disabled={!canChat} onClick={() => setGoal(suggestion)} className="h-7 rounded-full border-0 bg-[var(--dsw-alias-button-tool-bar-fill,var(--muted))] px-2.5 text-[13px] font-normal text-muted-foreground shadow-none transition-colors hover:bg-[var(--dsw-alias-button-tool-bar-hover,var(--accent))] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 disabled:opacity-50">{SUGGESTION_LABELS[index]}</Button>)}
        </div>}
      </section>

      <div className="mt-12 grid gap-10 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-10">
          {attention > 0 && <section aria-labelledby="attention-title">
            <h2 id="attention-title" className="ds-section-title mb-3 flex items-center gap-2">Precisa de você <span className="ds-count" data-tone="attention">{attention}</span></h2>
            <div className="space-y-3">
              {waiting.map(mission => <article key={mission.id} className="rounded-lg border border-warning/30 bg-warning-soft/50 px-4 py-3">
                <header className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Avatar agent={agentOf(mission.ownerAgentId)} size="xs" /><span className="min-w-0 flex-1 truncate"><span className="font-medium text-foreground">{agentName(mission.ownerAgentId)}</span> · {mission.title}</span><Button type="button" variant="ghost" size={null} className="h-auto gap-1 p-0 text-xs font-normal text-inherit hover:bg-transparent hover:text-foreground" onClick={() => onOpenConversation(mission.conversationId)}>Conversa<ArrowUpRight className="size-3" /></Button></header>
                <MissionReply mission={mission} onNotice={onNotice} />
              </article>)}
              {approvals.map(approval => <div key={approval.id} className="space-y-1.5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{agentName(approval.agentId)}</span> em <Button type="button" variant="ghost" size={null} className="h-auto min-w-0 shrink gap-1 truncate p-0 text-xs font-normal text-inherit hover:bg-transparent hover:text-foreground" onClick={() => onOpenConversation(approval.conversationId)}>{conversationName(approval.conversationId)}<ArrowUpRight className="size-3 shrink-0" /></Button></p>
                <PolitronToolApproval approval={approval} onNotice={onNotice} />
              </div>)}
            </div>
          </section>}

          <section aria-labelledby="active-title">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="active-title" className="ds-section-title flex items-center gap-2">Em andamento {!!open.length && <span className="ds-count">{open.length}</span>}</h2>
              {open.some(item => item.status === 'active') && <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => void pauseAll()}><PauseCircle className="size-3.5" />Pausar tudo</Button>}
            </div>
            {open.length
              ? <ul className="ds-list">{open.map(missionRow)}</ul>
              : <div className="ds-empty px-5 py-8 text-sm leading-6">Nenhum trabalho em andamento. Atribua um objetivo acima: o responsável registra o plano, executa com as ferramentas e continua sozinho até concluir ou precisar de você. Tudo fica salvo e é retomado se o Boobot reiniciar.</div>}
          </section>

          {!!finished.length && <section aria-labelledby="done-title">
            <h2 id="done-title" className="ds-section-title mb-3">Concluídas recentemente</h2>
            <ul className="ds-list">{finished.map(missionRow)}</ul>
          </section>}
        </div>

        <aside className="min-w-0 space-y-8" aria-label="Equipe e rotinas">
          <section aria-labelledby="team-title">
            <h2 id="team-title" className="ds-section-title mb-2">Equipe</h2>
            <ul className="space-y-0.5">
              {[...(chief ? [chief] : []), ...snapshot.agents.filter(agent => agent.role !== 'chief' && agent.temporaryStatus !== 'retired')].slice(0, 10).map(agent => <li key={agent.id}>
                <Button type="button" variant="ghost" size={null} onClick={() => onOpenAgent(agent)} className="flex h-auto w-full justify-start gap-2.5 whitespace-normal rounded-md px-2 py-1.5 text-left font-normal text-inherit transition-colors hover:bg-accent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:ring-0">
                  <Avatar agent={agent} size="xs" state={agentStates[agent.id] || 'idle'} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{agent.name}</span><span className="block truncate text-[11px] text-muted-foreground">{agent.role === 'chief' ? 'Chief · coordenação' : agent.description || `@${agent.alias}`}</span></span>
                  <AgentPresence state={agentStates[agent.id] || 'idle'} />
                </Button>
              </li>)}
            </ul>
            {!snapshot.agents.some(agent => agent.role !== 'chief') && <p className="px-2 pt-1 text-[11px] leading-5 text-muted-foreground">O Chief cria especialistas quando o trabalho pedir.</p>}
          </section>
          <section aria-labelledby="routines-title">
            <div className="mb-2 flex items-center justify-between"><h2 id="routines-title" className="ds-section-title">Rotinas</h2><Button size="xs" variant="ghost" onClick={onOpenRoutines}>Gerenciar</Button></div>
            {routines.length ? <ul className="space-y-2">{routines.map(routine => <li key={routine.id} className="flex gap-2 px-2 text-xs"><CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate font-medium">{routine.name}</span><span className="block truncate text-[11px] text-muted-foreground">{routine.nextRunAt ? `Próxima ${relativeTime(routine.nextRunAt)}` : describeTrigger(routine.trigger)}</span></span></li>)}</ul>
              : <Button type="button" variant="ghost" size={null} onClick={onOpenRoutines} className="ds-empty block h-auto w-full whitespace-normal rounded-lg px-3 py-3 text-left text-[11px] font-normal leading-5 text-muted-foreground transition-colors hover:border-ring/50 hover:bg-[color-mix(in_srgb,var(--muted)_55%,transparent)] hover:text-foreground">Dê responsabilidades contínuas: revisões diárias, monitoramento, reação a mudanças.</Button>}
          </section>
        </aside>
      </div>
    </div>
  </div>
}
