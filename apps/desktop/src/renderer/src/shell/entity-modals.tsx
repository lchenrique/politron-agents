import { useId, useState } from 'react'
import { FolderGit2, Trash2, X } from 'lucide-react'
import type { Agent, Model, Workspace } from '../../../shared/v9'
import type { EditorData } from '@/features/editors/Editor'
import { aliasFor, errorText } from '@/features/app/appShellShared'
import { BOO_VARIANTS, ColoredFolder, FOLDER_COLORS, MiniBoo, normalizeVariant, safeHex, type BooVariant } from './primitives'
import { cn } from '@/lib/utils'

/**
 * Modais de criação/edição no formato do mock: um Boo (identidade, cor, estilo
 * de avatar, harness, modelo e instruções) e uma pasta de workspace (nome,
 * branch, caminho e cor). Gravam pelos mesmos canais IPC do app.
 */

const RUNTIMES: ReadonlyArray<{ id: Agent['runtime']; label: string }> = [
  { id: 'codex', label: 'Codex CLI' },
  { id: 'claude', label: 'Claude Code CLI' },
  { id: 'pi', label: 'Pi Coding Agent' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'antigravity', label: 'Antigravity' },
]

function ModalShell({ title, subtitle, leading, onClose, children, footer }: {
  title: string
  subtitle: string
  leading: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <h2 className="truncate text-[14.5px] font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="truncate text-[11.5px] text-[var(--text-muted)]">{subtitle}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"><X className="size-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 text-[12px]">{children}</div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">{footer}</footer>
    </section>
  </div>
}

const inputClass = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-rail)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none'
const labelClass = 'mb-1 block text-[11px] font-medium text-[var(--text-secondary)]'

export function BooModal({ agent, models, onClose, onSave, onDelete }: {
  agent?: Agent
  models: Model[]
  onClose: () => void
  onSave: (data: EditorData) => Promise<void>
  onDelete: (id: string) => void
}) {
  const nameId = useId()
  const [name, setName] = useState(agent?.name || '')
  const [role, setRole] = useState(agent?.description || '')
  const [color, setColor] = useState(safeHex(agent?.color))
  const [variant, setVariant] = useState<BooVariant>(normalizeVariant(agent?.avatar))
  const [runtime, setRuntime] = useState<Agent['runtime']>(agent?.runtime || 'codex')
  const [model, setModel] = useState(agent?.model || '')
  const [prompt, setPrompt] = useState(agent?.instructions || '')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const runtimeModels = models.filter(item => item.runtime === runtime)

  const submit = async () => {
    if (!name.trim()) { setProblem('Dê um nome ao Boo.'); return }
    setSaving(true); setProblem('')
    try {
      await onSave({
        ...(agent ? { id: agent.id } : {}),
        name: name.trim(),
        description: role.trim(),
        alias: agent?.alias || aliasFor(name.trim()),
        instructions: prompt,
        color,
        avatar: variant,
        runtime,
        model,
      } as EditorData)
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }

  return <ModalShell title={agent ? 'Editar agente' : 'Novo Agente Especialista (Boo)'} subtitle="Identidade visual, CLI harness, modelo e instruções" onClose={onClose}
    leading={<MiniBoo color={color} variant={variant} size={36} />}
    footer={<>
      <div>{agent && agent.role !== 'chief' ? <button type="button" onClick={() => { onDelete(agent.id); onClose() }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-rose-400 transition hover:bg-rose-500/10"><Trash2 className="size-3.5" /> Excluir</button> : null}</div>
      <div className="flex items-center gap-2">
        {problem ? <p role="alert" className="mr-2 max-w-56 truncate text-[11.5px] text-rose-400">{problem}</p> : null}
        <button type="button" onClick={onClose} className="rounded-lg bg-[var(--bg-card)] px-3.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="rounded-lg bg-[var(--accent-primary)] px-4 py-1.5 text-[12px] font-semibold text-[var(--bg-app)] transition hover:bg-[#059669] disabled:opacity-60">{saving ? 'Salvando…' : agent ? 'Salvar Boo' : 'Criar Boo'}</button>
      </div>
    </>}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor={nameId}>Nome do Boo</label>
        <input id={nameId} value={name} onChange={event => setName(event.target.value)} placeholder="Ex: Orion" className={inputClass} autoFocus />
      </div>
      <div>
        <label className={labelClass}>Especialidade / Papel</label>
        <input value={role} onChange={event => setRole(event.target.value)} placeholder="Ex: DevOps & Containers" className={inputClass} />
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-pane)] p-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className={labelClass}>Cor de identidade</label>
        <div className="flex flex-wrap gap-1.5">
          {FOLDER_COLORS.map(preset => (
            <button key={preset.id} type="button" title={preset.label} aria-label={preset.label} onClick={() => setColor(preset.hex)} style={{ background: preset.hex }}
              className={cn('size-6 rounded-md border transition hover:scale-110', color.toUpperCase() === preset.hex.toUpperCase() ? 'border-white/80 ring-1 ring-white/40' : 'border-white/15')} />
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <label className={labelClass}>Estilo do avatar</label>
        <div className="flex flex-wrap gap-1.5">
          {BOO_VARIANTS.map(item => (
            <button key={item.id} type="button" title={item.hint} aria-label={item.label} onClick={() => setVariant(item.id)}
              className={cn('rounded-md border p-0.5 transition', variant === item.id ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]' : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]')}>
              <MiniBoo color={color} variant={item.id} size={22} />
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div>
        <label className={labelClass}>CLI Harness</label>
        <select value={runtime} onChange={event => { setRuntime(event.target.value as Agent['runtime']); setModel('') }} className={inputClass}>
          {RUNTIMES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Modelo padrão</label>
        <select value={model} onChange={event => setModel(event.target.value)} className={inputClass}>
          <option value="">Herdar do perfil</option>
          {runtimeModels.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
      </div>
    </div>

    <div>
      <label className={labelClass}>Instruções do agente (system prompt)</label>
      <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} placeholder="Como este Boo deve atuar, quais ferramentas priorizar e quando acionar o Chief…" className={cn(inputClass, 'resize-y leading-relaxed')} />
    </div>
  </ModalShell>
}

export function WorkspaceModal({ workspace, color: initialColor, busy, onClose, onSave, onDelete, onPickFolder }: {
  workspace?: Workspace
  color: string
  busy?: boolean
  onClose: () => void
  onSave: (data: EditorData) => Promise<void>
  onDelete: (id: string) => void
  onPickFolder: () => Promise<string | null>
}) {
  const nameId = useId()
  const [name, setName] = useState(workspace?.name || '')
  const [branch, setBranch] = useState(workspace?.branch || 'main')
  const [path, setPath] = useState(workspace?.path || '')
  const [color, setColor] = useState(safeHex(initialColor))
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) { setProblem('Dê um nome à pasta.'); return }
    setSaving(true); setProblem('')
    try {
      await onSave({ ...(workspace ? { id: workspace.id } : {}), name: name.trim(), branch: branch.trim() || null, path: path.trim() || null } as EditorData)
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }

  return <ModalShell title={workspace ? 'Editar pasta' : 'Nova Pasta de Workspace'} subtitle="Organize conversas, branch e diretório local" onClose={onClose}
    leading={<span className="flex size-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)]"><ColoredFolder color={color} open /></span>}
    footer={<>
      <div>{workspace ? <button type="button" onClick={() => { onDelete(workspace.id); onClose() }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-rose-400 transition hover:bg-rose-500/10"><Trash2 className="size-3.5" /> Excluir</button> : null}</div>
      <div className="flex items-center gap-2">
        {problem ? <p role="alert" className="mr-2 max-w-56 truncate text-[11.5px] text-rose-400">{problem}</p> : null}
        <button type="button" onClick={onClose} className="rounded-lg bg-[var(--bg-card)] px-3.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={saving || busy} className="rounded-lg bg-[var(--accent-primary)] px-4 py-1.5 text-[12px] font-semibold text-[var(--bg-app)] transition hover:bg-[#059669] disabled:opacity-60">{saving ? 'Salvando…' : 'Salvar Workspace'}</button>
      </div>
    </>}>
    <div className="grid grid-cols-3 gap-2.5">
      <div className="col-span-2">
        <label className={labelClass} htmlFor={nameId}>Nome da Pasta / Projeto</label>
        <input id={nameId} value={name} onChange={event => setName(event.target.value)} placeholder="Ex: billing-service" className={inputClass} autoFocus />
      </div>
      <div>
        <label className={labelClass}>Branch Git</label>
        <input value={branch} onChange={event => setBranch(event.target.value)} className={cn(inputClass, 'font-mono text-[11.5px] text-[var(--accent-primary)]')} />
      </div>
    </div>
    <div>
      <label className={labelClass}>Caminho no computador</label>
      <div className="flex gap-2">
        <input value={path} onChange={event => setPath(event.target.value)} placeholder="~/projetos/billing-service" className={cn(inputClass, 'min-w-0 flex-1 font-mono text-[11.5px]')} />
        <button type="button" onClick={async () => { try { const picked = await onPickFolder(); if (picked) setPath(picked) } catch (error) { setProblem(errorText(error)) } }} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-2.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"><FolderGit2 className="size-3.5" /> Escolher</button>
      </div>
    </div>
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-pane)] p-3">
      <label className={labelClass}>Cor da pasta</label>
      <div className="flex flex-wrap gap-1.5">
        {FOLDER_COLORS.map(preset => (
          <button key={preset.id} type="button" title={preset.label} aria-label={preset.label} onClick={() => setColor(preset.hex)} style={{ background: preset.hex }}
            className={cn('size-6 rounded-md border transition hover:scale-110', color.toUpperCase() === preset.hex.toUpperCase() ? 'border-white/80 ring-1 ring-white/40' : 'border-white/15')} />
        ))}
      </div>
    </div>
  </ModalShell>
}
