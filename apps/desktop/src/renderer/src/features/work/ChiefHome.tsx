import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, CalendarClock, MessageSquare, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/layout/PageShell'
import { PromptInput } from '@/components/ai/prompt-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ASSISTANT_ID, type Agent, type Mission, type Snapshot } from '../../../../shared/v9'
import { describeTrigger } from '../../../../shared/missions'
import { Avatar, AgentPresence } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import { PolitronToolApproval } from '../chat/PolitronToolApproval'
import composer from '../composer/Composer.module.css'
import { deriveDelegations, isDelegationActive } from './delegation-model'
import { MissionControls, MissionReply, PhaseLabel, ProgressBar, StepList, missionPhase, missionProgress, relativeTime } from './mission-ui'

const SUGGESTIONS = [
  'Preciso lançar um novo produto. Monte uma equipe, pesquise o mercado, organize o trabalho e comece a executar. Só me procure quando precisar de uma decisão minha.',
  'Acompanhe meus projetos diariamente e resolva os problemas que estiverem dentro das suas permissões.',
  'Abra este projeto, descubra por que não está funcionando, corrija e teste.',
]
const SUGGESTION_LABELS = ['Lançar um produto', 'Acompanhar projetos todo dia', 'Descobrir e corrigir um bug']
// Radix Select não aceita item com valor vazio; o estado e o localStorage continuam usando ''.
const NO_PROJECT = '__no-project__'
const chipTrigger = 'h-8 w-auto gap-1 rounded-full border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring/35'

export function ChiefHome({ snapshot, agentStates, onOpenConversation, onOpenAgent, onOpenRoutines, onNotice }: {
  snapshot: Snapshot
  agentStates: Record<string, 'idle' | 'working' | 'waiting'>
  onOpenConversation: (id: string) => void
  onOpenAgent: (agent: Agent) => void
  onOpenRoutines: () => void
  onNotice: (text: string) => void
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
  // Delegações do Chief ainda ativas também são trabalho em andamento, mesmo sem missão aberta.
  const delegations = useMemo(() => deriveDelegations(snapshot).filter(isDelegationActive), [snapshot])
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
      <Button type="button" variant="ghost" size={null} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : mission.id)} className="flex h-auto min-h-14 w-full items-start justify-start gap-3 whitespace-normal rounded-none px-4 py-3 text-left font-normal text-inherit transition-colors hover:bg-accent/40 hover:text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar agent={agentOf(mission.ownerAgentId)} size="sm" state={phase === 'running' ? 'working' : phase === 'approval' || phase === 'waiting' ? 'waiting' : 'idle'} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-[14px] font-medium">{mission.title}</span><PhaseLabel phase={phase} className="shrink-0" /></span>
          <span className="block truncate text-[13px] text-muted-foreground">{current ? current.title : last?.text || 'Planejando…'}</span>
          <span className="flex items-center gap-3 pt-0.5"><ProgressBar mission={mission} /><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total ? `${done}/${total} passos` : `turno ${mission.turns}`}</span></span>
        </span>
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', isOpen && 'rotate-180')} />
      </Button>
      {isOpen && <div className="space-y-4 border-t border-border bg-muted/40 px-4 py-4 @md:pl-[3.5rem]">
        <StepList steps={mission.steps} />
        {mission.result && <div className="rounded-md border border-success/25 bg-success-soft px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap">{mission.result}</div>}
        {!!mission.updates.length && <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
          {mission.updates.slice(-4).map(update => <li key={update.at + update.text} className="flex gap-2"><time className="shrink-0 tabular-nums" dateTime={update.at}>{new Date(update.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><span className="min-w-0">{update.agentId ? `${agentName(update.agentId)}: ` : ''}{update.text}</span></li>)}
        </ul>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{agentName(mission.ownerAgentId)} · turno {mission.turns}/{mission.maxTurns} · {relativeTime(mission.updatedAt)}</span>
          <div className="flex flex-wrap items-center gap-1"><MissionControls mission={mission} onNotice={onNotice} compact /><Button size="sm" variant="outline" onClick={() => onOpenConversation(mission.conversationId)}><MessageSquare className="size-4" />Acompanhar na conversa</Button></div>
        </div>
      </div>}
    </li>
  }

  const attention = waiting.length + approvals.length
  const activeCount = open.length + delegations.length
  const team = [...(chief ? [chief] : []), ...snapshot.agents.filter(agent => agent.role !== 'chief' && agent.temporaryStatus !== 'retired')].slice(0, 12)
  const chiefName = chief?.name || 'o Chief'
  return <PageShell title={`Central do ${chief?.name || 'Chief'}`}
    subtitle={`${attention ? `${attention} ${attention === 1 ? 'item precisa' : 'itens precisam'} de você` : 'Nada precisa de você agora'} · ${activeCount} em andamento`}
    leading={<Avatar agent={chief || snapshot.assistant} size="sm" state={chief ? agentStates[chief.id] || 'idle' : 'idle'} />}>
    <div className="@container space-y-8">
      <section aria-labelledby="attention-title">
        <h2 id="attention-title" className="ds-section-title mb-3 flex items-center gap-2">Precisa de você {attention > 0 && <span className="ds-count" data-tone="attention">{attention}</span>}</h2>
        {attention > 0 ? <div className="space-y-3">
          {waiting.map(mission => <article key={mission.id} className="ds-card border-warning/40 bg-warning-soft/50 px-4 py-3">
            <header className="mb-2 flex items-center gap-2 text-[13px] text-muted-foreground"><Avatar agent={agentOf(mission.ownerAgentId)} size="xs" /><span className="min-w-0 flex-1 truncate"><span className="font-medium text-foreground">{agentName(mission.ownerAgentId)}</span> · {mission.title}</span><Button type="button" variant="ghost" size={null} className="h-8 gap-1 px-2 text-[13px] font-normal text-inherit hover:bg-transparent hover:text-foreground" onClick={() => onOpenConversation(mission.conversationId)}>Conversa<ArrowUpRight className="size-3.5" /></Button></header>
            <MissionReply mission={mission} onNotice={onNotice} />
          </article>)}
          {approvals.map(approval => <div key={approval.id} className="space-y-1.5">
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><span className="font-medium text-foreground">{agentName(approval.agentId)}</span> em <Button type="button" variant="ghost" size={null} className="h-8 min-w-0 shrink gap-1 truncate px-1 text-[13px] font-normal text-inherit hover:bg-transparent hover:text-foreground" onClick={() => onOpenConversation(approval.conversationId)}>{conversationName(approval.conversationId)}<ArrowUpRight className="size-3.5 shrink-0" /></Button></p>
            <PolitronToolApproval approval={approval} agent={agentOf(approval.agentId)} onNotice={onNotice} />
          </div>)}
        </div> : <p className="text-[13px] text-muted-foreground">Nada pendente.</p>}
      </section>

      <section aria-labelledby="chief-brief-title">
        <h2 id="chief-brief-title" className="ds-section-title mb-3">O que {chiefName} deve resolver?</h2>
        {/* Mesmo cartão e mesma coluna do composer do chat; só o conteúdo (projeto e responsável) muda. */}
        <PromptInput className={composer.promptCard} inline showModelPicker={false} showAttachments={false} value={goal} onValueChange={setGoal}
          textareaLabel={`Objetivo para ${chiefName}`} placeholder="Descreva o objetivo" submitLabel="Atribuir" submitDisabled={sending}
          onTextareaKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void assign() } }}
          onSubmit={() => void assign()}
          extraControls={<>
            <Select value={selectedWorkspace?.id || NO_PROJECT} onValueChange={value => { const id = value === NO_PROJECT ? '' : value; setWorkspaceId(id); try { localStorage.setItem('politron.home.workspace', id) } catch { /* opcional */ } }}>
              <SelectTrigger aria-label="Projeto" className={cn(chipTrigger, 'max-w-40')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sem projeto (Livre)</SelectItem>
                {projects.filter(item => !(item.kind === 'free' && item.name === 'Livre')).map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={owner?.id || ''} onValueChange={setOwnerId}>
              <SelectTrigger aria-label="Responsável" className={cn(chipTrigger, 'max-w-36')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {owners.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.role === 'chief' ? `${agent.name} (Chief)` : agent.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>} />
        {!goal && <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion, index) => <Button key={suggestion} type="button" variant="outline" size={null} onClick={() => setGoal(suggestion)} className="h-8 rounded-full border-border bg-card px-3 text-[13px] font-normal text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0">{SUGGESTION_LABELS[index]}</Button>)}
        </div>}
      </section>

      <section aria-labelledby="active-title">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="active-title" className="ds-section-title flex items-center gap-2">Em andamento {activeCount > 0 && <span className="ds-count">{activeCount}</span>}</h2>
          {open.some(item => item.status === 'active') && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void pauseAll()}><PauseCircle className="size-4" />Pausar tudo</Button>}
        </div>
        {activeCount
          ? <ul className="ds-list">{open.map(missionRow)}{delegations.map(delegation => <li key={delegation.id} className="flex min-h-14 items-center gap-3 px-4 py-3" data-delegation-row>
            <Avatar agent={delegation.agent} size="sm" state={delegation.state === 'waiting' ? 'waiting' : 'working'} />
            <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{delegation.title}</p><p className="text-[13px] text-muted-foreground">{delegation.agentName} · {delegation.state === 'waiting' ? 'aguardando você' : 'trabalhando'} · delegado pelo Chief</p></div>
            <Button size="sm" variant="outline" onClick={() => onOpenConversation(delegation.conversationId)}><MessageSquare className="size-4" />Abrir</Button>
          </li>)}</ul>
          : <p className="text-[13px] text-muted-foreground">Nada em andamento.</p>}
      </section>

      <section aria-labelledby="team-title">
        <h2 id="team-title" className="ds-section-title mb-3">Equipe</h2>
        <ul className="grid gap-3 @xl:grid-cols-2">
          {team.map(agent => <li key={agent.id}>
            <Button type="button" variant="ghost" size={null} onClick={() => onOpenAgent(agent)} className="ds-card flex h-auto min-h-14 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left font-normal text-inherit transition-colors hover:bg-accent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0">
              <Avatar agent={agent} size="sm" state={agentStates[agent.id] || 'idle'} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{agent.name}</span><span className="block truncate text-[13px] text-muted-foreground">{agent.role === 'chief' ? 'Chief · coordenação' : agent.description || `@${agent.alias}`}</span></span>
              <AgentPresence state={agentStates[agent.id] || 'idle'} />
            </Button>
          </li>)}
        </ul>
        {!snapshot.agents.some(agent => agent.role !== 'chief') && <p className="pt-2 text-[13px] text-muted-foreground">O Chief cria especialistas quando o trabalho pedir.</p>}
      </section>

      <section aria-labelledby="routines-title">
        <div className="mb-3 flex items-center justify-between"><h2 id="routines-title" className="ds-section-title">Rotinas</h2><Button size="sm" variant="ghost" onClick={onOpenRoutines}>Gerenciar</Button></div>
        {routines.length ? <ul className="ds-list">{routines.map(routine => <li key={routine.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-[13px]"><CalendarClock className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium">{routine.name}</span><span className="shrink-0 text-muted-foreground">{routine.nextRunAt ? `Próxima ${relativeTime(routine.nextRunAt)}` : describeTrigger(routine.trigger)}</span></li>)}</ul>
          : <p className="text-[13px] text-muted-foreground">Nenhuma rotina ativa.</p>}
      </section>

      {!!finished.length && <section aria-labelledby="done-title">
        <h2 id="done-title" className="ds-section-title mb-3">Concluídas recentemente</h2>
        <ul className="ds-list">{finished.map(missionRow)}</ul>
      </section>}
    </div>
  </PageShell>
}
