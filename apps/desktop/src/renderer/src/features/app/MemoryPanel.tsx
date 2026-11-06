import { useCallback, useEffect, useState } from 'react'
import { MEMORY_KIND_LABEL, MEMORY_KINDS, MEMORY_SCOPE_LABEL, MEMORY_TEXT_LIMIT, type Memory, type MemoryFilter, type MemoryInclusion, type MemoryInput, type MemoryKind, type MemoryOrigin, type MemoryScope } from '../../../../shared/memory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText } from './appShellShared'

type Owner = { id: string; name: string }
type Draft = { id?: string; text: string; scope: MemoryScope; ownerId: string; kind: MemoryKind | 'nenhum'; inclusion: MemoryInclusion }
const EMPTY: Draft = { text: '', scope: 'global', ownerId: '', kind: 'nenhum', inclusion: 'essencial' }
const INCLUSION_LABEL: Record<MemoryInclusion, string> = { essencial: 'Essencial', pesquisavel: 'Pesquisável' }
const ORIGIN_LABEL: Record<MemoryOrigin, string> = { usuario: 'Você', agente: 'Boo' }

function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void; disabled?: boolean }) {
  return <label className="block min-w-0 space-y-1.5 text-xs font-medium">{label}
    <Select value={value} onValueChange={next => onChange(next as T)} disabled={disabled}><SelectTrigger aria-label={label} className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select>
  </label>
}

/** Configurações → Memória: fatos que os Boos guardam neste computador. Nada sai do banco local. */
export function MemoryPanel() {
  const api = window.memoryAPI
  const [memories, setMemories] = useState<Memory[]>([])
  const [agents, setAgents] = useState<Owner[]>([]), [workspaces, setWorkspaces] = useState<Owner[]>([])
  const [query, setQuery] = useState(''), [scope, setScope] = useState<MemoryScope | 'todos'>('todos'), [origin, setOrigin] = useState<MemoryOrigin | 'todas'>('todas')
  const [draft, setDraft] = useState<Draft>(EMPTY), [confirming, setConfirming] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  const reload = useCallback(async () => {
    if (!api) return
    const filter: MemoryFilter = { ...(query.trim() ? { query } : {}), ...(scope !== 'todos' ? { scope } : {}), ...(origin !== 'todas' ? { origin } : {}) }
    try { setMemories(await api.list(filter)) } catch (error) { setFeedback(errorText(error)) }
  }, [api, query, scope, origin])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    let active = true
    // Só para mostrar nomes e escolher dono; sem o snapshot a lista continua funcionando.
    void window.appAPI?.snapshot().then(value => {
      if (!active) return
      setAgents(value.agents.filter(agent => agent.temporaryStatus !== 'retired').map(agent => ({ id: agent.id, name: agent.name })))
      setWorkspaces(value.workspaces.filter(workspace => !workspace.archived && workspace.name).map(workspace => ({ id: workspace.id, name: workspace.name })))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
  if (!api) return <p className="text-xs text-muted-foreground">A memória só pode ser editada no app desktop.</p>
  const ownerName = (memory: Memory) => memory.scope === 'global' ? 'todos os Boos' : (memory.scope === 'agent' ? agents : workspaces).find(item => item.id === memory.ownerId)?.name || 'removido'
  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true); setFeedback('')
    try { await action(); setFeedback(done); await reload() } catch (error) { setFeedback(errorText(error)) } finally { setBusy(false) }
  }
  const save = () => act(async () => {
    const input: MemoryInput = { text: draft.text, kind: draft.kind === 'nenhum' ? null : draft.kind, inclusion: draft.inclusion,
      ...(draft.id ? { id: draft.id } : { scope: draft.scope, ownerId: draft.ownerId }) }
    await api.save(input); setDraft(EMPTY)
  }, draft.id ? 'Memória atualizada.' : 'Memória salva.')
  const owners = draft.scope === 'agent' ? agents : draft.scope === 'workspace' ? workspaces : []
  return <div className="space-y-5">
    <section aria-label={draft.id ? 'Editar memória' : 'Nova memória'} className="space-y-3">
      <label className="block space-y-1.5 text-xs font-medium">{draft.id ? 'Editar memória' : 'Nova memória'}
        <Textarea aria-label="Texto da memória" value={draft.text} maxLength={MEMORY_TEXT_LIMIT} onChange={event => setDraft(current => ({ ...current, text: event.target.value }))} placeholder="Ex.: Prefiro respostas curtas e em português." className="text-sm" />
      </label>
      <p className="text-right text-[11px] text-muted-foreground">{draft.text.length}/{MEMORY_TEXT_LIMIT}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice label="Escopo" value={draft.scope} disabled={!!draft.id} onChange={value => setDraft(current => ({ ...current, scope: value, ownerId: '' }))} options={(Object.keys(MEMORY_SCOPE_LABEL) as MemoryScope[]).map(id => [id, MEMORY_SCOPE_LABEL[id]])} />
        {draft.scope !== 'global' && !draft.id && <Choice label={draft.scope === 'agent' ? 'Boo' : 'Projeto'} value={draft.ownerId || 'nenhum'} onChange={value => setDraft(current => ({ ...current, ownerId: value === 'nenhum' ? '' : value }))} options={[['nenhum', 'Escolha…'], ...owners.map(item => [item.id, item.name] as [string, string])]} />}
        <Choice label="Tipo" value={draft.kind} onChange={value => setDraft(current => ({ ...current, kind: value }))} options={[['nenhum', 'Sem tipo'], ...MEMORY_KINDS.map(id => [id, MEMORY_KIND_LABEL[id]] as [MemoryKind, string])]} />
        <Choice label="Inclusão" value={draft.inclusion} onChange={value => setDraft(current => ({ ...current, inclusion: value }))} options={[['essencial', 'Essencial: entra em todo turno'], ['pesquisavel', 'Pesquisável: só sob busca']]} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !draft.text.trim() || (draft.scope !== 'global' && !draft.id && !draft.ownerId)} onClick={() => void save()}>{draft.id ? 'Salvar alteração' : 'Salvar memória'}</Button>
        {draft.id && <Button variant="outline" disabled={busy} onClick={() => setDraft(EMPTY)}>Cancelar</Button>}
      </div>
    </section>
    <section aria-label="Memórias salvas" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="block space-y-1.5 text-xs font-medium">Buscar<Input aria-label="Buscar memórias" value={query} onChange={event => setQuery(event.target.value)} placeholder="Palavras da memória" className="h-9" /></label>
        <Choice label="Filtrar escopo" value={scope} onChange={setScope} options={[['todos', 'Todos'], ...(Object.keys(MEMORY_SCOPE_LABEL) as MemoryScope[]).map(id => [id, MEMORY_SCOPE_LABEL[id]] as [MemoryScope, string])]} />
        <Choice label="Filtrar origem" value={origin} onChange={setOrigin} options={[['todas', 'Todas'], ['usuario', 'Você'], ['agente', 'Boos']]} />
      </div>
      {memories.length ? <ul className="space-y-1.5">{memories.map(memory => <li key={memory.id} className="space-y-2 rounded-md border border-border px-3 py-2 text-xs">
        <p className="whitespace-pre-wrap break-words text-sm leading-5">{memory.text}</p>
        <p className="text-muted-foreground">{MEMORY_SCOPE_LABEL[memory.scope]} · {ownerName(memory)}{memory.kind ? ` · ${MEMORY_KIND_LABEL[memory.kind]}` : ''} · {ORIGIN_LABEL[memory.origin]} · {new Date(memory.updatedAt).toLocaleDateString('pt-BR')}</p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" disabled={busy} aria-label={`Inclusão: ${INCLUSION_LABEL[memory.inclusion]}${memory.inclusionLocked ? ' (fixada por você)' : ''}. Trocar`}
            onClick={() => void act(() => api.save({ id: memory.id, inclusion: memory.inclusion === 'essencial' ? 'pesquisavel' : 'essencial' }), 'Inclusão fixada.')}>{INCLUSION_LABEL[memory.inclusion]}{memory.inclusionLocked ? ' · fixada' : ''}</Button>
          <Button size="xs" variant="outline" disabled={busy} onClick={() => setDraft({ id: memory.id, text: memory.text, scope: memory.scope, ownerId: memory.ownerId, kind: memory.kind ?? 'nenhum', inclusion: memory.inclusion })}>Editar</Button>
          {confirming === memory.id
            ? <Button size="xs" variant="destructive" disabled={busy} onClick={() => { setConfirming(''); void act(() => api.remove(memory.id), 'Memória apagada.') }}>Confirmar exclusão</Button>
            : <Button size="xs" variant="outline" disabled={busy} onClick={() => setConfirming(memory.id)}>Apagar</Button>}
        </div>
      </li>)}</ul> : <p className="text-xs text-muted-foreground">{query || scope !== 'todos' || origin !== 'todas' ? 'Nenhuma memória com esse filtro.' : 'Nenhuma memória ainda. Os Boos salvam fatos com remember, e você pode escrever aqui.'}</p>}
      <Button variant="outline" disabled={busy} onClick={() => void act(async () => { const path = await api.exportJson(); if (!path) throw new Error('Exportação cancelada.') }, 'Memórias exportadas em JSON.')}>Exportar JSON</Button>
    </section>
    <p role="status" className="text-xs text-muted-foreground empty:hidden">{feedback}</p>
  </div>
}
