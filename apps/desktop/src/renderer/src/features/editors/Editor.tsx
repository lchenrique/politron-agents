import { useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Model, Project, Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { aliasFor, errorText } from '../app/appShellShared'

export type EditorKind = 'agent' | 'conversation' | 'project'
export type EditorData = (Partial<Agent> | Partial<Conversation> | Partial<Project>) & { workspacePath?: string | null }

export function Editor({ kind, agents, models, initial, projectId, defaultAgentIds, workspaces = [], onClose, onSave, onPickFolder }: {
  kind: EditorKind; agents: Agent[]; models: Model[]; initial?: Agent | Conversation | Project; projectId?: string | null; defaultAgentIds?: string[];
  workspaces?: Workspace[]
  onClose: () => void; onSave: (data: EditorData) => Promise<void>; onPickFolder: () => Promise<string | null>
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [alias, setAlias] = useState((initial as Agent | undefined)?.alias || '')
  const [description, setDescription] = useState((initial as Agent | undefined)?.description || '')
  const [instructions, setInstructions] = useState((initial as Agent | undefined)?.instructions || '')
  const [model, setModel] = useState((initial as Agent | undefined)?.model || '')
  const [runtime, setRuntime] = useState((initial as Agent | undefined)?.runtime || 'codex')
  const [effort, setEffort] = useState((initial as Agent | undefined)?.effort || 'medium')
  const [color, setColor] = useState((initial as Agent | undefined)?.color || '#7565e8')
  const [avatar, setAvatar] = useState((initial as Agent | undefined)?.avatar || '')
  const [canWrite, setCanWrite] = useState((initial as Agent | undefined)?.canWrite || false)
  const [computerUse, setComputerUse] = useState((initial as Agent | undefined)?.computerUse || false)
  const [approvalMode, setApprovalMode] = useState((initial as Agent | undefined)?.approvalMode || 'ask')
  const originalConversation = kind === 'conversation' ? initial as Conversation | undefined : undefined
  const originalProject = kind === 'project' ? initial as Project | undefined : undefined
  const [selectedAgents, setSelectedAgents] = useState<string[]>(originalConversation?.agentIds || originalProject?.defaultAgentIds || defaultAgentIds || [])
  const initialWorkspaceId = originalConversation?.workspaceId || originalProject?.defaultWorkspaceId
  const [directory, setDirectory] = useState(workspaces.find(item => item.id === initialWorkspaceId)?.path || '')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const chooseAvatar = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_400_000) { setProblem('Escolha uma imagem PNG, JPG ou WebP de até 1,4 MB.'); return }
    const reader = new FileReader(); reader.onload = () => setAvatar(String(reader.result || '')); reader.readAsDataURL(file)
  }
  const submit = async () => {
    setSaving(true); setProblem('')
    try {
      if (kind === 'agent') await onSave({ ...(initial ? { id: initial.id } : {}), name, alias: alias || aliasFor(name), description, instructions, model, effort, color, avatar, canWrite, computerUse, approvalMode, runtime })
      else if (kind === 'project') await onSave({ ...(initial ? { id: initial.id } : {}), name, instructions, defaultAgentIds: selectedAgents, workspacePath: directory || null })
      else {
        const isGroup = selectedAgents.length > 1 || (originalConversation?.kind === 'group' && selectedAgents.length > 0)
        if (isGroup && !name.trim()) throw new Error('Dê um nome para a conversa em grupo.')
        await onSave({ ...(initial ? { id: initial.id } : { projectId: projectId ?? null }), name: name.trim() ? name : undefined, kind: isGroup ? 'group' : 'direct', agentIds: selectedAgents, workspacePath: directory || undefined, archived: originalConversation?.archived || false })
      }
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }
  const toggleAgent = (id: string) => setSelectedAgents(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
      <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div><h2 id="workspace-editor-title" className="font-semibold">{kind === 'agent' ? editing ? 'Editar agente' : 'Adicionar agente' : kind === 'project' ? editing ? 'Editar projeto' : 'Novo projeto' : editing ? 'Editar conversa' : 'Nova conversa'}</h2><p className="mt-1 text-xs text-muted-foreground">{kind === 'agent' ? 'Dê um nome, uma função e instruções claras.' : kind === 'project' ? 'Comece pelo nome. Pasta e equipe podem ser definidas depois.' : 'Escolha quem participa. Sem agentes, a conversa fica com o Assistente.'}</p></div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button>
      </header>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
        {(kind !== 'conversation' || selectedAgents.length > 0 || !!name) && <label className="block space-y-1.5 text-sm">{kind === 'agent' ? 'Nome do agente' : kind === 'project' ? 'Nome do projeto' : 'Nome da conversa'}<input autoFocus value={name} onChange={event => { setName(event.target.value); if (kind === 'agent' && !editing) setAlias(aliasFor(event.target.value)) }} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder={kind === 'agent' ? 'Por exemplo, Revisora' : kind === 'project' ? 'Por exemplo, Instruções de Paz' : 'Ex.: Planejamento do projeto'} required={kind === 'project' || kind === 'agent' || selectedAgents.length > 1} /></label>}
        {kind === 'agent' ? <>
          <label className="block space-y-1.5 text-sm">Especialidade<input value={description} onChange={event => setDescription(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="Ex.: Pesquisa, código, revisão" /></label>
          <label className="block space-y-1.5 text-sm">Instruções<textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Descreva como ele deve trabalhar e responder." /></label>
          <div className="flex items-center gap-3"><button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"><Avatar agent={{ id: '', name, alias, description, instructions, model, runtime, color, avatar, canWrite, computerUse, approvalMode, revision: 0, createdAt: '' }} size="md" /> {avatar ? 'Trocar avatar' : 'Escolher avatar'}</button><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => chooseAvatar(event.target.files?.[0])} /><span className="text-xs text-muted-foreground">PNG, JPG ou WebP até 1,4 MB</span></div>
          <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Mais opções</summary><div className="mt-3 space-y-4">
            <label className="block space-y-1.5 text-sm">Menção<input value={alias} onChange={event => setAlias(aliasFor(event.target.value))} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="revisora" /></label>
            <label className="block space-y-1.5 text-sm">Perfil rápido<select value="" onChange={event => { const profile = event.target.value; if (profile === 'codex-balanced' || profile === 'codex-focused') { setRuntime('codex'); setModel(''); setEffort(profile === 'codex-focused' ? 'high' : 'medium') } else if (profile.startsWith('claude-')) { setRuntime('claude'); const desired = profile === 'claude-opus' ? /opus/i : /sonnet/i; setModel(models.find(item => item.runtime === 'claude' && desired.test(item.name))?.id.replace(/^claude:/, '') || ''); setEffort(profile === 'claude-opus' ? 'high' : 'medium') } }} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="">Escolha uma base…</option><option value="codex-balanced">Codex equilibrado</option><option value="codex-focused">Codex focado</option><option value="claude-sonnet">Claude Sonnet equilibrado</option><option value="claude-opus">Claude Opus avançado</option></select></label>
            <label className="block space-y-1.5 text-sm">Motor<select value={runtime} onChange={event => { setRuntime(event.target.value as 'codex' | 'claude'); setModel('') }} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="codex">Codex</option><option value="claude">Claude Agent SDK</option></select></label>
            <label className="block space-y-1.5 text-sm">Modelo<select value={model ? `${runtime}:${model}` : ''} onChange={event => setModel(event.target.value.replace(/^(codex|claude):/, ''))} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="">Padrão do motor</option>{models.filter(item => item.runtime === runtime).map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ' · padrão' : ''}</option>)}</select></label>
            <label className="block space-y-1.5 text-sm">Esforço<select value={effort} onChange={event => setEffort(event.target.value as typeof effort)} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="low">Baixo</option><option value="medium">Equilibrado</option><option value="high">Alto</option><option value="xhigh">Muito alto</option><option value="max">Máximo</option></select></label>
            <label className="block space-y-1.5 text-sm">Aprovações para arquivos e navegador<select value={approvalMode} onChange={event => setApprovalMode(event.target.value as 'ask' | 'automatic')} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="ask">Perguntar antes de agir (padrão)</option><option value="automatic">Executar automaticamente</option></select></label>
            <label className="flex items-center gap-3 rounded-lg border border-border/70 p-3 text-sm"><input type="checkbox" checked={canWrite} onChange={event => setCanWrite(event.target.checked)} className="accent-primary" /><span><span className="block font-medium">Pode editar arquivos</span><span className="mt-0.5 block text-xs text-muted-foreground">O acesso depende da pasta escolhida na conversa.</span></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm"><input type="checkbox" checked={computerUse} onChange={event => setComputerUse(event.target.checked)} className="mt-1 accent-primary" /><span><span className="block font-medium">Permitir Computer Use</span><span className="mt-0.5 block text-xs text-muted-foreground">Navegar em sessão isolada.</span></span></label>
            <label className="flex items-center gap-3 text-sm">Cor<input aria-label="Cor do agente" type="color" value={color} onChange={event => setColor(event.target.value)} className="size-9 cursor-pointer rounded-lg border border-border bg-background p-1" /></label>
          </div></details>
        </> : <>
          {kind === 'conversation' && <div className="space-y-2"><span className="block text-sm font-medium">Quem participa?</span>{agents.length ? <div className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-border p-1">{agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 hover:bg-accent/60"><input type="checkbox" checked={selectedAgents.includes(agent.id)} onChange={() => toggleAgent(agent.id)} className="accent-primary" /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate text-sm">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>)}</div> : <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">Sem agentes cadastrados; o Assistente padrão responde.</p>}{selectedAgents.length === 0 && <p className="text-xs text-muted-foreground">Assistente padrão selecionado</p>}{selectedAgents.length === 1 && <p className="text-xs text-muted-foreground">Conversa direta com um agente.</p>}{selectedAgents.length > 1 && <p className="text-xs text-muted-foreground">Conversa em grupo. Dê um nome para continuar.</p>}</div>}
          {kind === 'project' && <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Opções do projeto</summary><div className="mt-3 space-y-4">
            <label className="block space-y-1.5 text-sm">Instruções do projeto<textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Opcional; valem para as novas conversas" /></label>
            <div className="space-y-1.5 text-sm"><span>Equipe padrão (opcional)</span><div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-border p-2">{agents.length ? agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60"><input type="checkbox" checked={selectedAgents.includes(agent.id)} onChange={() => toggleAgent(agent.id)} className="accent-primary" /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>) : <p className="px-2 py-3 text-xs text-muted-foreground">Sem equipe padrão; novas conversas usam o Assistente.</p>}</div></div>
            <label className="block space-y-1.5 text-sm">Pasta do projeto<div className="flex gap-2"><input readOnly value={directory} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" placeholder="Opcional; pode ser definida depois" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></label>
          </div></details>}
          {kind === 'conversation' && <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Pasta de trabalho (opcional)</summary><div className="mt-3"><div className="flex gap-2"><input readOnly value={directory} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" placeholder="Pode ser definida depois" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></div></details>}
        </>}
        {problem && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border/70 px-5 py-4"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => void submit()} disabled={saving || (kind !== 'conversation' && !name.trim()) || (kind === 'conversation' && selectedAgents.length > 1 && !name.trim()) || (kind === 'agent' && !instructions.trim())}>{saving ? 'Salvando…' : editing ? 'Salvar' : kind === 'agent' ? 'Adicionar agente' : kind === 'project' ? 'Criar projeto' : selectedAgents.length > 1 ? 'Criar grupo' : 'Criar conversa'}</Button></footer>
    </section>
  </div>
}
