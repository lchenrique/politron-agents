import { useState } from 'react'
import { CalendarClock, MessageSquare, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ASSISTANT_ID, type Routine, type RoutineTrigger, type Snapshot } from '../../../../shared/v9'
import { DEFAULT_ROUTINE_TURNS, describeTrigger } from '../../../../shared/missions'
import { Avatar } from '../app/Avatar'
import { errorText } from '../app/appShellShared'
import { PhaseLabel, missionPhase, relativeTime } from './mission-ui'

type Draft = { id?: string; name: string; instructions: string; agentId: string; workspaceId: string; kind: 'daily' | 'interval' | 'app-start' | 'project-changed'; time: string; weekdays: number[]; hours: number; maxTurns: number }
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const TEMPLATES: Pick<Draft, 'name' | 'instructions' | 'kind' | 'time' | 'weekdays'>[] = [
  { name: 'Revisão diária do projeto', kind: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5], instructions: 'Abra o projeto, rode build e testes, revise alterações recentes e problemas abertos. Corrija sozinho o que for seguro e reversível dentro das permissões, valide e entregue um resumo: o que verificou, o que corrigiu (com evidência) e o que precisa da minha decisão.' },
  { name: 'Resumo do fim do dia', kind: 'daily', time: '18:00', weekdays: [1, 2, 3, 4, 5], instructions: 'Resuma o trabalho do dia nas missões e conversas deste projeto: o que avançou, o que travou e as prioridades sugeridas para amanhã.' },
  { name: 'Reagir a mudanças', kind: 'project-changed', time: '09:00', weekdays: [], instructions: 'Quando o projeto mudar, revise as alterações, rode as verificações relevantes e aponte regressões. Corrija apenas problemas evidentes e seguros.' },
]

const toTrigger = (draft: Draft): RoutineTrigger => draft.kind === 'daily' ? { kind: 'daily', time: draft.time, weekdays: draft.weekdays } : draft.kind === 'interval' ? { kind: 'interval', minutes: Math.round(draft.hours * 60) } : { kind: 'event', event: draft.kind }
const fromRoutine = (routine: Routine): Draft => ({ id: routine.id, name: routine.name, instructions: routine.instructions, agentId: routine.agentId, workspaceId: routine.workspaceId, maxTurns: routine.maxTurns,
  kind: routine.trigger.kind === 'event' ? routine.trigger.event : routine.trigger.kind, time: routine.trigger.kind === 'daily' ? routine.trigger.time : '09:00',
  weekdays: routine.trigger.kind === 'daily' ? routine.trigger.weekdays : [1, 2, 3, 4, 5], hours: routine.trigger.kind === 'interval' ? routine.trigger.minutes / 60 : 4 })

const field = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'

export function RoutinesPage({ snapshot, onOpenConversation, onNotice }: { snapshot: Snapshot; onOpenConversation: (id: string) => void; onNotice: (text: string) => void }) {
  const routines = snapshot.routines || []
  const chief = snapshot.agents.find(agent => agent.role === 'chief')
  const agents = [...(chief ? [chief] : []), ...snapshot.agents.filter(agent => agent.role !== 'chief' && !agent.temporary), snapshot.assistant]
  const projects = snapshot.workspaces.filter(workspace => !workspace.archived && workspace.name)
  const livre = projects.find(item => item.kind === 'free' && item.name === 'Livre')
  const blank = (): Draft => ({ name: '', instructions: '', agentId: agents[0]?.id || ASSISTANT_ID, workspaceId: projects.find(item => item.kind !== 'free')?.id || livre?.id || '', kind: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5], hours: 4, maxTurns: DEFAULT_ROUTINE_TURNS })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const agentOf = (id: string) => id === ASSISTANT_ID ? snapshot.assistant : snapshot.agents.find(agent => agent.id === id)
  const lastMission = (routine: Routine) => (snapshot.missions || []).find(mission => mission.id === routine.lastMissionId)
  const patch = (value: Partial<Draft>) => setDraft(current => current && { ...current, ...value })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await window.appAPI.saveRoutine({ ...(draft.id ? { id: draft.id } : {}), name: draft.name, instructions: draft.instructions, agentId: draft.agentId, workspaceId: draft.workspaceId, trigger: toTrigger(draft), maxTurns: draft.maxTurns })
      setDraft(null); onNotice(draft.id ? 'Rotina atualizada.' : 'Rotina criada.')
    } catch (error) { onNotice(errorText(error)) }
    finally { setSaving(false) }
  }
  const toggle = (routine: Routine) => void window.appAPI.saveRoutine({ id: routine.id, enabled: !routine.enabled }).catch(error => onNotice(errorText(error)))
  const runNow = (routine: Routine) => void window.appAPI.runRoutine(routine.id).then(mission => { onNotice(`${routine.name} iniciada.`); onOpenConversation(mission.conversationId) }).catch(error => onNotice(errorText(error)))
  const remove = (routine: Routine) => { if (window.confirm(`Excluir a rotina “${routine.name}”? As missões já executadas continuam no histórico.`)) void window.appAPI.deleteRoutine(routine.id).catch(error => onNotice(errorText(error))) }

  const editor = draft && <form className="space-y-5 rounded-2xl border border-border/80 bg-card/50 p-5" onSubmit={event => { event.preventDefault(); void save() }}>
    {!draft.id && <div className="flex flex-wrap gap-1.5">{TEMPLATES.map(template => <button key={template.name} type="button" onClick={() => patch(template)} className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{template.name}</button>)}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-xs font-medium sm:col-span-2">Nome<input required maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} placeholder="Ex.: Revisão diária do projeto" className={field} /></label>
      <label className="space-y-1.5 text-xs font-medium sm:col-span-2">O que fazer a cada execução
        <textarea required maxLength={8000} rows={4} value={draft.instructions} onChange={event => patch({ instructions: event.target.value })} placeholder="O que verificar, o que pode corrigir sozinho e o que entregar no resumo." className={cn(field, 'field-sizing-content h-auto min-h-24 py-2 leading-6')} />
      </label>
      <label className="space-y-1.5 text-xs font-medium">Responsável<select value={draft.agentId} onChange={event => patch({ agentId: event.target.value })} className={field}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.role === 'chief' ? `${agent.name} (Chief)` : agent.name}</option>)}</select></label>
      <label className="space-y-1.5 text-xs font-medium">Projeto<select value={draft.workspaceId} onChange={event => patch({ workspaceId: event.target.value })} className={field}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    </div>
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-medium">Quando</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Gatilho">
        {([['daily', 'Em horário fixo'], ['interval', 'A cada intervalo'], ['app-start', 'Ao abrir o Boobot'], ['project-changed', 'Quando o projeto mudar']] as const).map(([kind, label]) =>
          <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} onClick={() => patch({ kind })} className={cn('rounded-lg border px-3 py-1.5 text-xs transition-colors', draft.kind === kind ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-accent')}>{label}</button>)}
      </div>
      {draft.kind === 'daily' && <div className="flex flex-wrap items-center gap-3">
        <input type="time" aria-label="Horário" required value={draft.time} onChange={event => patch({ time: event.target.value })} className={cn(field, 'w-28')} />
        <div className="flex gap-1" aria-label="Dias da semana">{DAYS.map((day, index) => { const on = draft.weekdays.includes(index); return <button key={index} type="button" aria-pressed={on} aria-label={DAY_NAMES[index]} onClick={() => patch({ weekdays: on ? draft.weekdays.filter(item => item !== index) : [...draft.weekdays, index].sort() })} className={cn('size-8 rounded-full border text-xs font-medium transition-colors', on ? 'border-primary/60 bg-primary/15 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-accent')}>{day}</button> })}</div>
        <span className="text-[11px] text-muted-foreground">{draft.weekdays.length ? '' : 'Nenhum dia marcado = todos os dias'}</span>
      </div>}
      {draft.kind === 'interval' && <label className="flex items-center gap-2 text-sm">A cada<input type="number" min={0.25} max={168} step={0.25} value={draft.hours} onChange={event => patch({ hours: Number(event.target.value) })} className={cn(field, 'w-24')} />horas</label>}
      {draft.kind === 'project-changed' && <p className="text-[11px] leading-5 text-muted-foreground">Dispara quando o número de arquivos alterados no Git muda, no máximo uma vez a cada 30 minutos.</p>}
    </fieldset>
    <label className="flex items-center gap-2 text-xs text-muted-foreground">Limite por execução<input type="number" min={1} max={50} value={draft.maxTurns} onChange={event => patch({ maxTurns: Number(event.target.value) })} className={cn(field, 'w-20')} />turnos do agente (controle de custo)</label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" disabled={saving || !draft.name.trim() || !draft.instructions.trim() || !draft.workspaceId}>{draft.id ? 'Salvar rotina' : 'Criar rotina'}</Button></div>
  </form>

  return <div className="min-h-0 flex-1 overflow-auto">
    <div className="mx-auto w-full max-w-3xl space-y-8 px-5 pb-16 pt-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">Rotinas</h1><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Responsabilidades contínuas. Cada execução vira uma missão do responsável e roda mesmo com o chat fechado, enquanto o Boobot estiver aberto ou na bandeja.</p></div>
        {!draft && <Button onClick={() => setDraft(blank())}><Plus className="size-4" />Nova rotina</Button>}
      </header>
      {draft && !draft.id && editor}
      {routines.length ? <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
        {routines.map(routine => {
          if (draft?.id === routine.id) return <li key={routine.id} className="p-3">{editor}</li>
          const mission = lastMission(routine)
          const workspace = snapshot.workspaces.find(item => item.id === routine.workspaceId)
          return <li key={routine.id} className={cn('flex flex-wrap items-start gap-3 px-4 py-3', !routine.enabled && 'opacity-60')}>
            <Avatar agent={agentOf(routine.agentId)} size="xs" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">{routine.name}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{describeTrigger(routine.trigger)}</span>
                <span>{agentOf(routine.agentId)?.name || 'Agente removido'} · {workspace?.name || 'Projeto removido'}</span>
                {routine.enabled && routine.nextRunAt && <span>Próxima {relativeTime(routine.nextRunAt)}</span>}
              </p>
              {mission && <p className="flex items-center gap-2 text-[11px] text-muted-foreground">Última {relativeTime(routine.lastRunAt)} · <PhaseLabel phase={missionPhase(mission, snapshot.runs, snapshot.approvals)} /></p>}
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" role="switch" aria-checked={routine.enabled} aria-label={routine.enabled ? `Desativar ${routine.name}` : `Ativar ${routine.name}`} onClick={() => toggle(routine)} className={cn('relative mr-2 h-5 w-9 rounded-full border transition-colors', routine.enabled ? 'border-primary/60 bg-primary' : 'border-border bg-muted')}><span className={cn('absolute top-0.5 size-3.5 rounded-full bg-background shadow-sm transition-[left] duration-200', routine.enabled ? 'left-[1.15rem]' : 'left-0.5')} /></button>
              <Button size="icon-sm" variant="ghost" title="Executar agora" aria-label={`Executar ${routine.name} agora`} onClick={() => runNow(routine)}><Play className="size-4" /></Button>
              {routine.conversationId && <Button size="icon-sm" variant="ghost" title="Histórico na conversa" aria-label={`Abrir conversa de ${routine.name}`} onClick={() => onOpenConversation(routine.conversationId!)}><MessageSquare className="size-4" /></Button>}
              <Button size="icon-sm" variant="ghost" title="Editar" aria-label={`Editar ${routine.name}`} onClick={() => setDraft(fromRoutine(routine))}><Pencil className="size-4" /></Button>
              <Button size="icon-sm" variant="ghost" title="Excluir" aria-label={`Excluir ${routine.name}`} className="hover:text-destructive" onClick={() => remove(routine)}><Trash2 className="size-4" /></Button>
            </div>
          </li>
        })}
      </ul> : !draft && <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center">
        <p className="text-sm font-medium">Nenhuma rotina ainda</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Crie aqui ou peça ao Chief: “acompanhe meus projetos diariamente e resolva o que estiver dentro das suas permissões”.</p>
        <Button variant="outline" className="mt-4" onClick={() => setDraft(blank())}><Plus className="size-4" />Criar primeira rotina</Button>
      </div>}
    </div>
  </div>
}
