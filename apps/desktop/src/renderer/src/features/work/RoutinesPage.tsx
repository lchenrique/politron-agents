import { useState } from 'react'
import { CalendarClock, MessageSquare, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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

const field = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-faint-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20'

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

  const editor = draft && <form className="ds-panel space-y-5 p-5" onSubmit={event => { event.preventDefault(); void save() }}>
    {!draft.id && <div className="flex flex-wrap gap-1.5">{TEMPLATES.map(template => <Button key={template.name} type="button" variant="outline" size={null} onClick={() => patch(template)} className="h-auto rounded-full border-border bg-card px-3 py-1 text-xs font-normal text-muted-foreground shadow-xs transition-colors hover:border-border-strong hover:bg-card hover:text-foreground">{template.name}</Button>)}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-xs font-medium sm:col-span-2">Nome<Input required maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} placeholder="Ex.: Revisão diária do projeto" className={field} /></label>
      <label className="space-y-1.5 text-xs font-medium sm:col-span-2">O que fazer a cada execução
        <Textarea required maxLength={8000} rows={4} value={draft.instructions} onChange={event => patch({ instructions: event.target.value })} placeholder="O que verificar, o que pode corrigir sozinho e o que entregar no resumo." className={cn(field, 'field-sizing-content h-auto min-h-24 py-2 leading-6 md:text-sm dark:bg-card')} />
      </label>
      <label className="space-y-1.5 text-xs font-medium">Responsável<Select value={draft.agentId} onValueChange={agentId => patch({ agentId })}><SelectTrigger aria-label="Responsável" className={field}><SelectValue /></SelectTrigger><SelectContent>{agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.role === 'chief' ? `${agent.name} (Chief)` : agent.name}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1.5 text-xs font-medium">Projeto<Select value={draft.workspaceId} onValueChange={workspaceId => patch({ workspaceId })}><SelectTrigger aria-label="Projeto" className={field}><SelectValue /></SelectTrigger><SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></label>
    </div>
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-medium">Quando</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Gatilho">
        {([['daily', 'Em horário fixo'], ['interval', 'A cada intervalo'], ['app-start', 'Ao abrir o Boobot'], ['project-changed', 'Quando o projeto mudar']] as const).map(([kind, label]) =>
          <Button key={kind} type="button" variant="ghost" size={null} role="radio" aria-checked={draft.kind === kind} onClick={() => patch({ kind })} className={cn('h-auto rounded-lg border px-3 py-1.5 text-xs font-normal transition-colors', draft.kind === kind ? 'border-primary/50 bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground')}>{label}</Button>)}
      </div>
      {draft.kind === 'daily' && <div className="flex flex-wrap items-center gap-3">
        <Input type="time" aria-label="Horário" required value={draft.time} onChange={event => patch({ time: event.target.value })} className={cn(field, 'w-28')} />
        <div className="flex gap-1" aria-label="Dias da semana">{DAYS.map((day, index) => { const on = draft.weekdays.includes(index); return <Button key={index} type="button" variant="ghost" size="icon-sm" aria-pressed={on} aria-label={DAY_NAMES[index]} onClick={() => patch({ weekdays: on ? draft.weekdays.filter(item => item !== index) : [...draft.weekdays, index].sort() })} className={cn('size-8 rounded-full border text-xs font-medium transition-colors', on ? 'border-primary/60 bg-primary/15 text-foreground hover:bg-primary/15 hover:text-foreground' : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-muted-foreground')}>{day}</Button> })}</div>
        <span className="text-[11px] text-muted-foreground">{draft.weekdays.length ? '' : 'Nenhum dia marcado = todos os dias'}</span>
      </div>}
      {draft.kind === 'interval' && <label className="flex items-center gap-2 text-sm">A cada<Input type="number" min={0.25} max={168} step={0.25} value={draft.hours} onChange={event => patch({ hours: Number(event.target.value) })} className={cn(field, 'w-24')} />horas</label>}
      {draft.kind === 'project-changed' && <p className="text-[11px] leading-5 text-muted-foreground">Dispara quando o número de arquivos alterados no Git muda, no máximo uma vez a cada 30 minutos.</p>}
    </fieldset>
    <label className="flex items-center gap-2 text-xs text-muted-foreground">Limite por execução<Input type="number" min={1} max={50} value={draft.maxTurns} onChange={event => patch({ maxTurns: Number(event.target.value) })} className={cn(field, 'w-20')} />turnos do agente (controle de custo)</label>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" disabled={saving || !draft.name.trim() || !draft.instructions.trim() || !draft.workspaceId}>{draft.id ? 'Salvar rotina' : 'Criar rotina'}</Button></div>
  </form>

  return <div className="min-h-0 flex-1 overflow-auto">
    <div className="ds-page max-w-3xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><p className="ds-eyebrow mb-2">Automação</p><h1 className="ds-page-title">Rotinas</h1><p className="ds-page-lede max-w-xl">Responsabilidades contínuas. Cada execução vira uma missão do responsável e roda mesmo com o chat fechado, enquanto o Boobot estiver aberto ou na bandeja.</p></div>
        {!draft && <Button onClick={() => setDraft(blank())}><Plus className="size-4" />Nova rotina</Button>}
      </header>
      {draft && !draft.id && editor}
      {routines.length ? <ul className="ds-list">
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
              <Button type="button" variant="ghost" size={null} role="switch" aria-checked={routine.enabled} aria-label={routine.enabled ? `Desativar ${routine.name}` : `Ativar ${routine.name}`} onClick={() => toggle(routine)} className={cn('relative mr-2 block h-5 w-9 rounded-full border p-0 transition-colors', routine.enabled ? 'border-primary/60 bg-primary hover:bg-primary' : 'border-border bg-muted hover:bg-muted')}><span className={cn('absolute top-0.5 size-3.5 rounded-full bg-background shadow-sm transition-[left] duration-200', routine.enabled ? 'left-[1.15rem]' : 'left-0.5')} /></Button>
              <Button size="icon-sm" variant="ghost" title="Executar agora" aria-label={`Executar ${routine.name} agora`} onClick={() => runNow(routine)}><Play className="size-4" /></Button>
              {routine.conversationId && <Button size="icon-sm" variant="ghost" title="Histórico na conversa" aria-label={`Abrir conversa de ${routine.name}`} onClick={() => onOpenConversation(routine.conversationId!)}><MessageSquare className="size-4" /></Button>}
              <Button size="icon-sm" variant="ghost" title="Editar" aria-label={`Editar ${routine.name}`} onClick={() => setDraft(fromRoutine(routine))}><Pencil className="size-4" /></Button>
              <Button size="icon-sm" variant="ghost" title="Excluir" aria-label={`Excluir ${routine.name}`} className="hover:text-destructive" onClick={() => remove(routine)}><Trash2 className="size-4" /></Button>
            </div>
          </li>
        })}
      </ul> : !draft && <div className="ds-empty px-6 py-10 text-center">
        <p className="text-sm font-medium">Nenhuma rotina ainda</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Crie aqui ou peça ao Chief: “acompanhe meus projetos diariamente e resolva o que estiver dentro das suas permissões”.</p>
        <Button variant="outline" className="mt-4" onClick={() => setDraft(blank())}><Plus className="size-4" />Criar primeira rotina</Button>
      </div>}
    </div>
  </div>
}
