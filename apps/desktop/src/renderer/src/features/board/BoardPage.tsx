import { useMemo, useState } from 'react'
import { Check, GitBranch, MessageSquare, Plus, Search, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { BoardTask, BoardTaskInput, BoardTeam, Snapshot } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import { BoardCard } from './BoardCard'
import { shortTaskId } from './boardTaskId'

const field = 'h-9 w-full rounded-md border-[0.5px] border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-faint-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20'
const statuses: { id: BoardTask['status'] | 'queue'; label: string }[] = [
  { id: 'queue', label: 'Fila' }, { id: 'doing', label: 'Em execução' }, { id: 'review', label: 'Revisão' },
  { id: 'rework', label: 'Retrabalho' }, { id: 'integration', label: 'Integração' }, { id: 'blocked', label: 'Bloqueadas' }, { id: 'done', label: 'Concluídas' }, { id: 'cancelled', label: 'Canceladas' },
]
const statusLabel = (status: BoardTask['status']) => status === 'backlog' || status === 'ready' || status === 'queued' ? 'Fila' : statuses.find(item => item.id === status)?.label || 'Cancelada'
const boardOf = (snapshot: Snapshot) => snapshot.board || { teams: [], tasks: [], events: [], missions: [], evidence: [] }

type TaskDraft = { title: string; description: string; acceptanceCriteria: string; kind: 'general' | 'code'; teamId: string; workspaceId: string; assigneeAgentId: string; reviewerAgentId: string }
const blankTask = (teamId = ''): TaskDraft => ({ title: '', description: '', acceptanceCriteria: '', kind: 'general', teamId, workspaceId: '', assigneeAgentId: '', reviewerAgentId: '' })

export function BoardPage({ snapshot, onOpenConversation, onNotice, readOnly }: { snapshot: Snapshot; onOpenConversation: (id: string) => void; onNotice: (text: string) => void; readOnly: boolean }) {
  const board = boardOf(snapshot)
  const [createdTeams, setCreatedTeams] = useState<BoardTeam[]>([])
  const teams = useMemo(() => [...board.teams, ...createdTeams.filter(team => !board.teams.some(item => item.id === team.id))], [board.teams, createdTeams])
  const [teamForm, setTeamForm] = useState(false)
  const [taskForm, setTaskForm] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([])
  const [draft, setDraft] = useState<TaskDraft>(blankTask())
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [feedbackTaskId, setFeedbackTaskId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [assignmentTaskId, setAssignmentTaskId] = useState<string | null>(null)
  const [assignment, setAssignment] = useState({ assigneeAgentId: '', reviewerAgentId: '' })
  const [integrationEvidence, setIntegrationEvidence] = useState<Record<string, string>>({})
  const [evidenceDraft, setEvidenceDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const agents = snapshot.agents.filter(agent => agent.temporaryStatus !== 'retired')
  const selectedTeam = teams.find(team => team.id === draft.teamId)
  const teamAgents = agents.filter(agent => selectedTeam?.agentIds.includes(agent.id))
  const missionById = new Map((snapshot.missions || []).map(mission => [mission.id, mission]))
  const queueInfo = (task: BoardTask) => {
    if (task.status !== 'doing') return null
    const workerLink = board.missions.find(link => link.taskId === task.id && link.role === 'worker' && link.missionId === task.currentMissionId)
    const run = snapshot.runs.find(item => item.conversationId === workerLink?.conversationId && item.status === 'queued')
    if (!run) return null
    const queued = snapshot.runs.filter(item => item.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return { position: queued.findIndex(item => item.id === run.id) + 1 }
  }
  const taskColumn = (task: BoardTask) => queueInfo(task) ? 'queue' : ['backlog', 'ready', 'queued'].includes(task.status) ? 'queue' : task.status
  const taskMatches = (task: BoardTask) => {
    if (teamFilter !== 'all' && task.teamId !== teamFilter) return false
    if (assigneeFilter !== 'all' && task.assigneeAgentId !== assigneeFilter) return false
    if (workspaceFilter !== 'all' && task.workspaceId !== workspaceFilter) return false
    if (kindFilter !== 'all' && task.kind !== kindFilter) return false
    if (statusFilter !== 'all' && statusFilter === 'queue' && taskColumn(task) !== 'queue' && !queueInfo(task)) return false
    if (statusFilter !== 'all' && statusFilter !== 'queue' && task.status !== statusFilter) return false
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return !normalized || `${task.title} ${task.description} ${task.acceptanceCriteria}`.toLocaleLowerCase('pt-BR').includes(normalized)
  }
  const renderTaskCard = (task: BoardTask) => {
    const reviewMission = task.currentReviewMissionId ? missionById.get(task.currentReviewMissionId) : undefined
    return <BoardCard
      key={task.id}
      task={task}
      worker={snapshot.agents.find(agent => agent.id === task.assigneeAgentId)}
      reviewer={snapshot.agents.find(agent => agent.id === task.reviewerAgentId)}
      waitingPosition={queueInfo(task)?.position ?? null}
      evidenceCount={board.evidence.filter(item => item.taskId === task.id).length}
      reviewReady={task.status === 'review' && reviewMission?.status === 'completed'}
      selected={task.id === selectedTaskId}
      onOpen={setSelectedTaskId}
    />
  }
  const detailLabel = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
  const detailText = 'whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]'
  const renderDetails = (task: BoardTask) => {
    const worker = snapshot.agents.find(agent => agent.id === task.assigneeAgentId)
    const reviewer = snapshot.agents.find(agent => agent.id === task.reviewerAgentId)
    const team = teams.find(item => item.id === task.teamId)
    const reviewMission = task.currentReviewMissionId ? missionById.get(task.currentReviewMissionId) : undefined
    const workerMission = task.currentMissionId ? missionById.get(task.currentMissionId) : undefined
    const waiting = queueInfo(task)
    const events = board.events.filter(event => event.taskId === task.id).slice(-10).reverse()
    const evidence = board.evidence.filter(item => item.taskId === task.id)
    const progress = task.status === 'doing' ? workerMission?.updates?.[workerMission.updates.length - 1]?.text : undefined
    return <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl" data-testid="board-task-details" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)?.focus() }}>
      <SheetHeader className="shrink-0 gap-2 border-b border-border p-4 pr-12">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{shortTaskId(task.id)}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{statusLabel(task.status)}</span>
          <span className="inline-flex min-w-0 items-center gap-1">{task.kind === 'code' ? <GitBranch className="size-3 shrink-0" /> : <Users className="size-3 shrink-0" />}<span className="truncate">{task.kind === 'code' ? task.branch || 'Código' : 'Geral'}</span></span>
        </div>
        <SheetTitle className="break-words text-base leading-6 [overflow-wrap:anywhere]">{task.title}</SheetTitle>
        <SheetDescription className="sr-only">Detalhes, critérios de aceite, atividade e ações da tarefa.</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Equipe</dt><dd className="truncate">{team?.name || 'Equipe removida'}</dd>
          {worker && <><dt className="text-muted-foreground">Responsável</dt><dd className="inline-flex min-w-0 items-center gap-1.5"><Avatar agent={worker} size="xxs" /><span className="truncate">{worker.name}</span></dd></>}
          {reviewer && <><dt className="text-muted-foreground">Revisor</dt><dd className="inline-flex min-w-0 items-center gap-1.5"><Avatar agent={reviewer} size="xxs" /><span className="truncate">{reviewer.name}</span></dd></>}
        </dl>
        {waiting && <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Aguardando o limite global de duas execuções ou a liberação do mesmo workspace. Posição estimada: {waiting.position}.</p>}
        {task.blockedReason && <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">Bloqueio: {task.blockedReason}</p>}
        <section className="space-y-1.5"><h3 className={detailLabel}>Descrição</h3><p className={detailText}>{task.description}</p></section>
        <section className="space-y-1.5"><h3 className={detailLabel}>Critérios de aceite</h3><p className={detailText}>{task.acceptanceCriteria}</p></section>
        {task.status === 'review' && <section className="space-y-1.5"><h3 className={detailLabel}>{reviewMission?.status === 'completed' ? 'Parecer do revisor' : 'Revisão em andamento'}</h3>{reviewMission?.result && <p className={cn(detailText, 'text-muted-foreground')}>{reviewMission.result}</p>}</section>}
        {progress && <section className="space-y-1.5"><h3 className={detailLabel}>Progresso</h3><p className={cn(detailText, 'text-muted-foreground')}>{progress}</p></section>}
        {task.integrationEvidence && <section className="space-y-1.5"><h3 className={detailLabel}>Integração</h3><p className={cn(detailText, 'text-muted-foreground')}>{task.integrationEvidence}</p></section>}
        <section className="space-y-1.5"><h3 className={detailLabel}>Evidências · {evidence.length}</h3>{evidence.length > 0 ? <ul className="space-y-1 text-xs">{evidence.map(item => <li key={item.id} className="[overflow-wrap:anywhere]"><span className="font-medium">{item.label}:</span> <span className="text-muted-foreground">{item.summary}</span></li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhuma evidência registrada.</p>}</section>
        {events.length > 0 && <section className="space-y-1.5"><h3 className={detailLabel}>Atividade</h3><ol className="space-y-1 text-xs text-muted-foreground">{events.map(event => <li key={event.id} className="[overflow-wrap:anywhere]">{new Date(event.createdAt).toLocaleString('pt-BR')} · {event.note}</li>)}</ol></section>}
        {!readOnly && !['done', 'cancelled'].includes(task.status) && <div className="flex gap-2"><Input aria-label={`Nova evidência ${task.title}`} value={evidenceDraft[task.id] || ''} onChange={event => setEvidenceDraft(current => ({ ...current, [task.id]: event.target.value }))} placeholder="Registrar evidência ou decisão" maxLength={20_000} /><Button type="button" size="sm" variant="outline" disabled={!evidenceDraft[task.id]?.trim()} onClick={() => void saveEvidence(task)}>Anexar evidência</Button></div>}
      </div>
      {!readOnly && <div className="shrink-0 border-t border-border p-4 pt-0">{renderActions(task)}</div>}
    </SheetContent>
  }

  const createTeam = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      const saved = await window.appAPI.saveBoardTeam({ name: teamName, description: teamDescription, agentIds: teamAgentIds })
      setCreatedTeams(current => [...current.filter(team => team.id !== saved.id), saved]); setDraft(blankTask(saved.id)); setTeamForm(false); setTaskForm(false); setTeamName(''); setTeamDescription(''); setTeamAgentIds([])
      onNotice(`Equipe ${saved.name} criada.`)
    } catch (error) { onNotice(errorText(error)) } finally { setSaving(false) }
  }
  const createTask = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      const input: BoardTaskInput = { title: draft.title, description: draft.description, acceptanceCriteria: draft.acceptanceCriteria, kind: draft.kind, teamId: draft.teamId, workspaceId: draft.kind === 'code' ? draft.workspaceId : null }
      if (editTaskId) {
        await window.appAPI.updateBoardTask(editTaskId, input)
        setTaskForm(false); setEditTaskId(null); setDraft(blankTask()); onNotice('Tarefa atualizada.')
        return
      }
      const created = await window.appAPI.createBoardTask(input)
      if (draft.assigneeAgentId && draft.reviewerAgentId) await window.appAPI.assignBoardTask(created.id, draft.assigneeAgentId, draft.reviewerAgentId)
      setTaskForm(false); setDraft(blankTask()); onNotice(draft.assigneeAgentId ? 'Tarefa criada e enviada para execução.' : 'Tarefa adicionada à fila do board.')
    } catch (error) { onNotice(errorText(error)) } finally { setSaving(false) }
  }
  const action = async (taskId: string, kind: Parameters<typeof window.appAPI.boardTaskAction>[1], note = '') => {
    try { await window.appAPI.boardTaskAction(taskId, kind, note); onNotice(kind === 'approve' ? 'Revisão aprovada.' : kind === 'request_changes' ? 'Tarefa devolvida para retrabalho.' : kind === 'integrate' ? 'Integração registrada; tarefa concluída.' : 'Board atualizado.') }
    catch (error) { onNotice(errorText(error)) }
  }
  const saveAssignment = async (task: BoardTask) => {
    try {
      if (!assignment.assigneeAgentId || !assignment.reviewerAgentId) return
      if (task.status === 'blocked') await window.appAPI.reassignBoardTask(task.id, assignment.assigneeAgentId, assignment.reviewerAgentId)
      else await window.appAPI.assignBoardTask(task.id, assignment.assigneeAgentId, assignment.reviewerAgentId)
      setAssignmentTaskId(null); onNotice(task.status === 'blocked' ? 'Tarefa reatribuída e enviada para execução.' : 'Tarefa atribuída e enviada para execução.')
    } catch (error) { onNotice(errorText(error)) }
  }
  const saveEvidence = async (task: BoardTask) => {
    const summary = evidenceDraft[task.id]?.trim()
    if (!summary) return
    try {
      await window.appAPI.addBoardEvidence(task.id, { kind: 'note', label: 'Evidência', summary })
      setEvidenceDraft(current => ({ ...current, [task.id]: '' })); onNotice('Evidência adicionada ao cartão.')
    } catch (error) { onNotice(errorText(error)) }
  }

  const renderActions = (task: BoardTask) => {
    if (readOnly) return null
    const workerLink = board.missions.find(link => link.taskId === task.id && link.missionId === task.currentMissionId)
    const reviewLink = board.missions.find(link => link.taskId === task.id && link.missionId === task.currentReviewMissionId)
    const reviewMission = task.currentReviewMissionId ? missionById.get(task.currentReviewMissionId) : undefined
    return <div className="mt-3 flex flex-wrap items-center gap-2">
      {workerLink && <Button type="button" size="sm" variant="outline" onClick={() => onOpenConversation(workerLink.conversationId)}><MessageSquare className="size-3.5" />Conversa da execução</Button>}
      {reviewLink && <Button type="button" size="sm" variant="outline" onClick={() => onOpenConversation(reviewLink.conversationId)}><ShieldCheck className="size-3.5" />Abrir conversa do revisor</Button>}
      {task.status === 'backlog' && <Button type="button" size="sm" variant="outline" onClick={() => { setEditTaskId(task.id); setDraft({ title: task.title, description: task.description, acceptanceCriteria: task.acceptanceCriteria, kind: task.kind, teamId: task.teamId, workspaceId: task.workspaceId || '', assigneeAgentId: '', reviewerAgentId: '' }); setTaskForm(true); setTeamForm(false); setSelectedTaskId(null) }}>Editar tarefa</Button>}
      {task.status === 'queued' && <Button type="button" size="sm" onClick={() => void action(task.id, 'start')}>Iniciar</Button>}
      {['backlog', 'ready', 'blocked'].includes(task.status) && <Button type="button" size="sm" variant="outline" onClick={() => { setAssignmentTaskId(assignmentTaskId === task.id ? null : task.id); setAssignment({ assigneeAgentId: task.assigneeAgentId || '', reviewerAgentId: task.reviewerAgentId || '' }) }}>{task.status === 'blocked' ? 'Reatribuir' : 'Atribuir'}</Button>}
      {assignmentTaskId === task.id && ['backlog', 'ready', 'blocked'].includes(task.status) && <div className="grid w-full gap-2 rounded-md border border-border p-3 sm:grid-cols-2" aria-label={`Atribuir ${task.title}`}>
        <label className="grid gap-1 text-xs text-muted-foreground">Responsável<select aria-label={`Responsável para ${task.title}`} className={field} value={assignment.assigneeAgentId} onChange={event => setAssignment({ ...assignment, assigneeAgentId: event.target.value, reviewerAgentId: assignment.reviewerAgentId === event.target.value ? '' : assignment.reviewerAgentId })}><option value="">Selecione</option>{agents.filter(agent => teams.find(team => team.id === task.teamId)?.agentIds.includes(agent.id)).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Revisor<select aria-label={`Revisor para ${task.title}`} className={field} value={assignment.reviewerAgentId} onChange={event => setAssignment({ ...assignment, reviewerAgentId: event.target.value })}><option value="">Selecione</option>{agents.filter(agent => agent.id !== assignment.assigneeAgentId && teams.find(team => team.id === task.teamId)?.agentIds.includes(agent.id)).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" size="sm" variant="ghost" onClick={() => setAssignmentTaskId(null)}>Cancelar</Button><Button type="button" size="sm" disabled={!assignment.assigneeAgentId || !assignment.reviewerAgentId} onClick={() => void saveAssignment(task)}>{task.status === 'blocked' ? 'Salvar reatribuição' : 'Salvar atribuição'}</Button></div>
      </div>}
      {task.status === 'doing' && <Button type="button" size="sm" variant="outline" onClick={() => void action(task.id, 'block', 'Bloqueada pelo usuário.')}>Bloquear</Button>}
      {task.status === 'review' && reviewMission?.status === 'completed' && <>
        <Button type="button" size="sm" onClick={() => void action(task.id, 'approve')}><Check className="size-3.5" />Aprovar revisão</Button>
        {feedbackTaskId === task.id ? <div className="flex w-full flex-wrap gap-2"><Textarea aria-label={`Feedback para ${task.title}`} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Explique o que precisa mudar" className="min-h-16 flex-1" /><Button type="button" size="sm" disabled={!feedback.trim()} onClick={() => { void action(task.id, 'request_changes', feedback); setFeedbackTaskId(null); setFeedback('') }}>Enviar pedido</Button></div> : <Button type="button" size="sm" variant="outline" onClick={() => setFeedbackTaskId(task.id)}>Pedir alterações</Button>}
      </>}
      {task.status === 'integration' && <div className="flex w-full flex-wrap gap-2"><Input aria-label={`Evidência de integração ${task.title}`} value={integrationEvidence[task.id] || ''} onChange={event => setIntegrationEvidence(current => ({ ...current, [task.id]: event.target.value }))} placeholder="PR, commit ou evidência de integração" className="min-w-56 flex-1" /><Button type="button" size="sm" disabled={!integrationEvidence[task.id]?.trim()} onClick={() => void action(task.id, 'integrate', integrationEvidence[task.id])}>Registrar integração</Button></div>}
      {task.status === 'blocked' && <Button type="button" size="sm" onClick={() => void action(task.id, 'resume')}>Retomar</Button>}
      {!['done', 'cancelled'].includes(task.status) && <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void action(task.id, 'cancel')}>Cancelar tarefa</Button>}
    </div>
  }

  const empty = !board.tasks.length
  const selectedTask = board.tasks.find(task => task.id === selectedTaskId)
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="max-h-[55%] shrink-0 space-y-4 overflow-y-auto px-4 pb-3 pt-6 sm:px-8 sm:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><p className="ds-eyebrow mb-2">Trabalho da empresa</p><h1 className="ds-page-title">Board da empresa</h1><p className="ds-page-lede max-w-2xl">Organize responsabilidades, execução e revisão em um fluxo visível. Conversas e missões continuam funcionando do mesmo jeito, fora do board.</p></div>
        {!readOnly && <div className="flex gap-2">{teams.length > 0 && <Button type="button" variant="outline" onClick={() => { setTaskForm(value => !value); setTeamForm(false); setEditTaskId(null); setDraft(blankTask(teams[0]?.id)) }}><Plus className="size-4" />Nova tarefa</Button>}<Button type="button" onClick={() => { setTeamForm(value => !value); setTaskForm(false) }}><Users className="size-4" />Nova equipe</Button></div>}
      </header>
      {readOnly && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Visualização somente leitura neste dispositivo.</p>}
      {teamForm && !readOnly && <form onSubmit={event => void createTeam(event)} className="ds-card grid gap-4 p-4 sm:grid-cols-2" aria-label="Criar equipe">
        <label className="grid gap-1.5 text-xs text-muted-foreground">Nome da equipe<Input aria-label="Nome da equipe" value={teamName} onChange={event => setTeamName(event.target.value)} maxLength={80} required /></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">Descrição<Input aria-label="Descrição da equipe" value={teamDescription} onChange={event => setTeamDescription(event.target.value)} maxLength={500} /></label>
        <fieldset className="sm:col-span-2"><legend className="mb-2 text-xs text-muted-foreground">Agentes disponíveis · selecione pelo menos dois</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{agents.map(agent => <label key={agent.id} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={teamAgentIds.includes(agent.id)} onChange={event => setTeamAgentIds(current => event.target.checked ? [...current, agent.id] : current.filter(id => id !== agent.id))} />{agent.name}</label>)}</div></fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setTeamForm(false)}>Cancelar</Button><Button type="submit" disabled={saving || teamAgentIds.length < 2 || !teamName.trim()}>Salvar equipe</Button></div>
      </form>}
      {taskForm && !readOnly && <form onSubmit={event => void createTask(event)} className="ds-card grid gap-4 p-4 sm:grid-cols-2" aria-label={editTaskId ? 'Editar tarefa' : 'Criar tarefa'}>
        <label className="grid gap-1.5 text-xs text-muted-foreground">Título<Input aria-label="Título" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} maxLength={160} required /></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">Equipe<select aria-label="Equipe" className={field} value={draft.teamId} onChange={event => setDraft({ ...draft, teamId: event.target.value, assigneeAgentId: '', reviewerAgentId: '' })} required>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground sm:col-span-2">Descrição<Textarea aria-label="Descrição" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} maxLength={20_000} required /></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground sm:col-span-2">Critérios de aceite<Textarea aria-label="Critérios de aceite" value={draft.acceptanceCriteria} onChange={event => setDraft({ ...draft, acceptanceCriteria: event.target.value })} maxLength={4000} required /></label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">Tipo<select aria-label="Tipo" className={field} value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as TaskDraft['kind'] })}><option value="general">Geral</option><option value="code">Código</option></select></label>
        {draft.kind === 'code' && <label className="grid gap-1.5 text-xs text-muted-foreground">Workspace do projeto<select aria-label="Workspace do projeto" className={field} value={draft.workspaceId} onChange={event => setDraft({ ...draft, workspaceId: event.target.value })} required><option value="">Selecione…</option>{snapshot.workspaces.filter(workspace => !workspace.archived && workspace.kind !== 'worktree').map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name || workspace.path}</option>)}</select></label>}
        {!editTaskId && <label className="grid gap-1.5 text-xs text-muted-foreground">Responsável<select aria-label="Responsável" className={field} value={draft.assigneeAgentId} onChange={event => setDraft({ ...draft, assigneeAgentId: event.target.value })}><option value="">Deixar na fila</option>{teamAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
        {!editTaskId && <label className="grid gap-1.5 text-xs text-muted-foreground">Revisor<select aria-label="Revisor" className={field} value={draft.reviewerAgentId} onChange={event => setDraft({ ...draft, reviewerAgentId: event.target.value })}><option value="">Selecionar depois</option>{teamAgents.filter(agent => agent.id !== draft.assigneeAgentId).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
        {draft.assigneeAgentId && !draft.reviewerAgentId && <p className="text-xs text-warning sm:col-span-2">Escolha um revisor diferente para enviar a tarefa à execução.</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => { setTaskForm(false); setEditTaskId(null) }}>Cancelar</Button><Button type="submit" disabled={saving || !draft.title.trim() || !draft.description.trim() || !draft.acceptanceCriteria.trim() || !draft.teamId || draft.kind === 'code' && !draft.workspaceId || !editTaskId && !!draft.assigneeAgentId !== !!draft.reviewerAgentId}>{editTaskId ? 'Salvar alterações' : `Criar ${draft.assigneeAgentId ? 'e iniciar' : 'tarefa'}`}</Button></div>
      </form>}
      {!teams.length && !teamForm && <div className="ds-empty px-6 py-10 text-center"><p className="text-sm font-medium">Nenhuma tarefa no board ainda</p><p className="mt-1 text-xs font-medium text-muted-foreground">Nenhuma equipe ainda</p><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">Crie uma equipe e selecione os agentes que podem receber tarefas. Cada trabalho terá um responsável e outro agente fará a revisão.</p>{!readOnly && <Button type="button" className="mt-4" onClick={() => setTeamForm(true)}><Plus className="size-4" />Criar primeira equipe</Button>}</div>}
      {!!teams.length && <div className="flex flex-wrap items-center gap-2"><label className="relative min-w-48 flex-1 sm:max-w-sm"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Buscar tarefas" className="pl-8" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tarefas" /></label><select aria-label="Filtrar equipe" className={cn(field, 'w-auto min-w-40')} value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="all">Todas as equipes</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select><select aria-label="Filtrar responsável" className={cn(field, 'w-auto min-w-40')} value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)}><option value="all">Todos os responsáveis</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><select aria-label="Filtrar projeto" className={cn(field, 'w-auto min-w-40')} value={workspaceFilter} onChange={event => setWorkspaceFilter(event.target.value)}><option value="all">Todos os projetos</option>{snapshot.workspaces.filter(workspace => !workspace.archived && workspace.kind !== 'worktree').map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name || workspace.path}</option>)}</select><select aria-label="Filtrar tipo" className={cn(field, 'w-auto min-w-32')} value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="all">Todos os tipos</option><option value="general">Geral</option><option value="code">Código</option></select><select aria-label="Filtrar status" className={cn(field, 'w-auto min-w-36')} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{statuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></div>}
      {!empty && !board.tasks.some(taskMatches) && <div className="ds-empty px-6 py-6 text-center text-sm">Nenhuma tarefa corresponde aos filtros.</div>}
    </div>
    {!!teams.length && (empty
      ? <div className="ds-empty mx-4 mb-4 px-6 py-10 text-center sm:mx-8"><p className="text-sm font-medium">Nenhuma tarefa no board ainda</p><p className="mt-1 text-xs text-muted-foreground">O board só recebe tarefas criadas aqui; mensagens comuns continuam nas conversas.</p></div>
      : <div role="region" tabIndex={0} aria-label="Colunas do board" className="flex min-h-[18rem] min-w-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 sm:px-8">{statuses.map(column => {
        const cards = board.tasks.filter(taskMatches).filter(task => taskColumn(task) === column.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        return <section key={column.id} className="ds-column flex h-full min-h-0 w-[18.5rem] shrink-0 flex-col" aria-label={`Coluna ${column.label}`}>
          <header className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-3"><h2 className="truncate text-xs font-semibold">{column.label}</h2><span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">{cards.length}</span></header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">{cards.map(renderTaskCard)}{cards.length === 0 && <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">Sem tarefas</p>}</div>
        </section>
      })}</div>)}
    <Sheet open={!!selectedTask} onOpenChange={open => { if (!open) setSelectedTaskId(null) }}>{selectedTask && renderDetails(selectedTask)}</Sheet>
  </div>
}
