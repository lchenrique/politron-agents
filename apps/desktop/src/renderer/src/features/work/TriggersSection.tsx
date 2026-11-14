import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Snapshot } from '../../../../shared/v9'
import { DEFAULT_TRIGGER_TEMPLATES, TRIGGER_VARIABLES, type Trigger, type TriggerAvailability, type TriggerSource } from '../../../../shared/triggers'
import { errorText } from '../app/appShellShared'
import { relativeTime } from './mission-ui'

type Kind = TriggerSource['kind']
type Draft = { name: string; kind: Kind; path: string; label: string; conversationId: string; template: string }
const KINDS: [Kind, string][] = [['folder', 'Pasta observada'], ['github-issue', 'Issue nova com label'], ['github-ci', 'CI falhou']]
const field = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-faint-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20'

const describe = (source: TriggerSource) => source.kind === 'folder' ? `Pasta ${source.path}` : source.kind === 'github-issue' ? `Issue nova com a label ${source.label}` : 'Execução de CI com falha'
const toSource = (draft: Draft): TriggerSource => draft.kind === 'folder' ? { kind: 'folder', path: draft.path } : draft.kind === 'github-issue' ? { kind: 'github-issue', label: draft.label } : { kind: 'github-ci' }

/** Gatilhos automáticos: evento externo vira mensagem numa conversa. A API só existe com o preload local. */
export function TriggersSection({ snapshot, onNotice }: { snapshot: Snapshot; onNotice: (text: string) => void }) {
  const api = window.triggersAPI
  const conversations = snapshot.conversations.filter(item => !item.archived)
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [availability, setAvailability] = useState<TriggerAvailability | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const reload = useCallback(() => { void api?.list().then(setTriggers).catch(() => undefined) }, [api])
  useEffect(() => {
    reload()
    void api?.availability().then(setAvailability).catch(() => undefined)
    const timer = setInterval(reload, 15_000)
    return () => clearInterval(timer)
  }, [api, reload])
  if (!api) return null

  const patch = (value: Partial<Draft>) => setDraft(current => current && { ...current, ...value })
  const conversationName = (id: string) => conversations.find(item => item.id === id)?.name || 'Conversa removida'
  const githubBlocked = (kind: Kind) => kind !== 'folder' && availability?.github.available === false
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await api.save({ name: draft.name, source: toSource(draft), conversationId: draft.conversationId, template: draft.template })
      setDraft(null); reload(); onNotice('Gatilho criado.')
    } catch (error) { onNotice(errorText(error)) } finally { setSaving(false) }
  }
  const toggle = (trigger: Trigger) => void api.save({ id: trigger.id, enabled: !trigger.enabled }).then(reload).catch(error => onNotice(errorText(error)))
  const remove = (trigger: Trigger) => { if (window.confirm(`Excluir o gatilho “${trigger.name}”?`)) void api.remove(trigger.id).then(reload).catch(error => onNotice(errorText(error))) }

  return <section className="space-y-3" aria-labelledby="triggers-title">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 id="triggers-title" className="text-sm font-medium">Gatilhos</h2>
        <p className="text-[13px] text-muted-foreground">Eventos de fora mandam uma mensagem para uma conversa, sem você pedir.</p>
      </div>
      {!draft && <Button variant="outline" onClick={() => setDraft({ name: '', kind: 'folder', path: '', label: '', conversationId: conversations[0]?.id || '', template: DEFAULT_TRIGGER_TEMPLATES.folder })}><Plus className="size-4" />Novo gatilho</Button>}
    </div>
    {draft && <form className="ds-panel space-y-4 p-5" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de gatilho">
        {KINDS.map(([kind, label]) => <Button key={kind} type="button" variant="ghost" size={null} role="radio" aria-checked={draft.kind === kind}
          onClick={() => patch({ kind, template: DEFAULT_TRIGGER_TEMPLATES[kind] })}
          className={cn('h-auto rounded-full border px-3 py-1.5 text-xs font-normal transition-colors', draft.kind === kind ? 'border-primary/50 bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground')}>{label}</Button>)}
      </div>
      {githubBlocked(draft.kind) && <p role="alert" className="text-[13px] text-destructive">{availability?.github.reason}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium">Nome<Input maxLength={80} value={draft.name} onChange={event => patch({ name: event.target.value })} placeholder="Opcional" className={field} /></label>
        <label className="space-y-1.5 text-xs font-medium">Conversa que recebe<Select value={draft.conversationId} onValueChange={conversationId => patch({ conversationId })}><SelectTrigger aria-label="Conversa que recebe" className={field}><SelectValue placeholder="Escolha a conversa" /></SelectTrigger><SelectContent>{conversations.map(item => <SelectItem key={item.id} value={item.id}>{item.kind === 'group' ? `${item.name} (grupo)` : item.name}</SelectItem>)}</SelectContent></Select></label>
        {draft.kind === 'folder' && <label className="space-y-1.5 text-xs font-medium sm:col-span-2">Pasta a observar<Input required value={draft.path} onChange={event => patch({ path: event.target.value })} placeholder="Caminho completo, ex.: D:\entrada" className={field} /></label>}
        {draft.kind === 'github-issue' && <label className="space-y-1.5 text-xs font-medium sm:col-span-2">Label<Input required maxLength={50} value={draft.label} onChange={event => patch({ label: event.target.value })} placeholder="Ex.: bug" className={field} /></label>}
        <label className="space-y-1.5 text-xs font-medium sm:col-span-2">Mensagem
          <Textarea required maxLength={4000} rows={3} value={draft.template} onChange={event => patch({ template: event.target.value })} className={cn(field, 'field-sizing-content h-auto min-h-20 py-2 leading-6 md:text-sm dark:bg-card')} />
          <span className="block text-[11px] font-normal text-muted-foreground">Variáveis: {TRIGGER_VARIABLES[draft.kind].map(name => `{${name}}`).join(', ')}{draft.kind === 'folder' ? '. Mudanças feitas pelo Boo enquanto trabalha nessa conversa não disparam de novo.' : '. O repositório é o do projeto da conversa; o GitHub é consultado a cada 2 minutos.'}</span>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">No máximo 3 disparos por minuto por gatilho.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit" disabled={saving || !draft.conversationId || githubBlocked(draft.kind)}>Criar gatilho</Button></div>
    </form>}
    {triggers.length ? <ul className="ds-list">
      {triggers.map(trigger => <li key={trigger.id} className={cn('flex min-h-14 flex-wrap items-start gap-3 px-4 py-3', !trigger.enabled && 'opacity-60')}>
        <Zap className="mt-1 size-4 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[14px] font-medium">{trigger.name}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground"><span className="truncate">{describe(trigger.source)}</span><span>→ {conversationName(trigger.conversationId)}</span>{trigger.lastFiredAt && <span>Último disparo {relativeTime(trigger.lastFiredAt)}</span>}</p>
          {trigger.lastError && <p className="text-xs text-destructive">{trigger.lastError}</p>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size={null} role="switch" aria-checked={trigger.enabled} aria-label={trigger.enabled ? `Desligar ${trigger.name}` : `Ligar ${trigger.name}`} onClick={() => toggle(trigger)} className={cn('relative mr-2 block h-5 w-9 rounded-full border p-0 transition-colors', trigger.enabled ? 'border-primary/60 bg-primary hover:bg-primary' : 'border-border bg-muted hover:bg-muted')}><span className={cn('absolute top-0.5 size-3.5 rounded-full bg-background shadow-sm transition-[left] duration-200', trigger.enabled ? 'left-[1.15rem]' : 'left-0.5')} /></Button>
          <Button size="icon-sm" variant="ghost" title="Excluir" aria-label={`Excluir ${trigger.name}`} className="hover:text-destructive" onClick={() => remove(trigger)}><Trash2 className="size-4" /></Button>
        </div>
      </li>)}
    </ul> : !draft && <p className="text-[13px] text-muted-foreground">Nenhum gatilho ainda.</p>}
  </section>
}
