import { useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent, Conversation, Model, Project } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { aliasFor, errorText } from '../app/appShellShared'

export type EditorKind = 'agent' | 'conversation' | 'project'
export type EditorData = Partial<Agent> | Partial<Conversation> | Partial<Project>

export function Editor({ kind, agents, models, initial, projectId, defaultAgentIds, onClose, onSave, onPickFolder }: {
  kind: EditorKind; agents: Agent[]; models: Model[]; initial?: Agent | Conversation | Project; projectId?: string | null; defaultAgentIds?: string[];
  onClose: () => void; onSave: (data: EditorData) => Promise<void>; onPickFolder: () => Promise<string | null>
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [alias, setAlias] = useState((initial as Agent | undefined)?.alias || '')
  const [description, setDescription] = useState((initial as Agent | undefined)?.description || '')
  const [instructions, setInstructions] = useState((initial as Agent | undefined)?.instructions || '')
  const [model, setModel] = useState((initial as Agent | undefined)?.model || '')
  const [color, setColor] = useState((initial as Agent | undefined)?.color || '#7565e8')
  const [avatar, setAvatar] = useState((initial as Agent | undefined)?.avatar || '')
  const [canWrite, setCanWrite] = useState((initial as Agent | undefined)?.canWrite || false)
  const [computerUse, setComputerUse] = useState((initial as Agent | undefined)?.computerUse || false)
  const originalConversation = kind === 'conversation' ? initial as Conversation | undefined : undefined
  const originalProject = kind === 'project' ? initial as Project | undefined : undefined
  const [selectedAgents, setSelectedAgents] = useState<string[]>(originalConversation?.agentIds || originalProject?.defaultAgentIds || defaultAgentIds || [])
  const [directory, setDirectory] = useState(originalConversation?.directory || originalProject?.directory || '')
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
      if (kind === 'agent') await onSave({ ...(initial ? { id: initial.id } : {}), name, alias: alias || aliasFor(name), description, instructions, model, color, avatar, canWrite, computerUse, runtime: 'codex' })
      else if (kind === 'project') await onSave({ ...(initial ? { id: initial.id } : {}), name, instructions, defaultAgentIds: selectedAgents, directory: directory || null })
      else await onSave({ ...(initial ? { id: initial.id } : { projectId: projectId ?? null }), name: name.trim() ? name : undefined, kind: selectedAgents.length > 1 || (originalConversation?.kind === 'group' && selectedAgents.length) ? 'group' : 'direct', agentIds: selectedAgents, directory: directory || null, archived: originalConversation?.archived || false })
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }
  const toggleAgent = (id: string) => setSelectedAgents(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
      <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div><h2 id="workspace-editor-title" className="font-semibold">{kind === 'agent' ? editing ? 'Editar agente' : 'Criar agente' : kind === 'project' ? editing ? 'Editar projeto' : 'Novo projeto' : editing ? 'Editar conversa' : 'Nova conversa com equipe'}</h2><p className="mt-1 text-xs text-muted-foreground">{kind === 'agent' ? 'Defina como ele trabalha e quais recursos pode usar.' : kind === 'project' ? 'Pasta, instruções e equipe padrão são herdadas pelas novas conversas do projeto.' : 'Sem participantes, o Assistente padrão responde. Escolha agentes para formar uma equipe.'}</p></div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button>
      </header>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
        <label className="block space-y-1.5 text-sm">Nome<input autoFocus value={name} onChange={event => { setName(event.target.value); if (kind === 'agent' && !editing) setAlias(aliasFor(event.target.value)) }} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder={kind === 'agent' ? 'Por exemplo, Revisora' : kind === 'project' ? 'Nome do projeto' : 'Opcional; o título vem da primeira mensagem'} /></label>
        {kind === 'agent' ? <>
          <label className="block space-y-1.5 text-sm">Menção<input value={alias} onChange={event => setAlias(aliasFor(event.target.value))} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="revisora" /></label>
          <label className="block space-y-1.5 text-sm">Descrição<input value={description} onChange={event => setDescription(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="Especialidade em uma linha" /></label>
          <label className="block space-y-1.5 text-sm">Instruções<textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={5} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Explique como esse agente deve trabalhar" /></label>
          <label className="block space-y-1.5 text-sm">Modelo<select value={model} onChange={event => setModel(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="">Padrão do Codex</option>{models.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ' · padrão' : ''}</option>)}</select></label>
          <div className="flex items-center gap-3"><button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"><Avatar agent={{ id: '', name, alias, description, instructions, model, runtime: 'codex', color, avatar, canWrite, computerUse, revision: 0, createdAt: '' }} size="md" /> Personalizar avatar</button><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => chooseAvatar(event.target.files?.[0])} /><input aria-label="Cor do agente" type="color" value={color} onChange={event => setColor(event.target.value)} className="size-10 cursor-pointer rounded-lg border border-border bg-background p-1" /></div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm"><input type="checkbox" checked={canWrite} onChange={event => setCanWrite(event.target.checked)} className="mt-1 accent-primary" /><span><span className="block font-medium">Pode editar arquivos da pasta do grupo</span><span className="mt-0.5 block text-xs text-muted-foreground">O acesso continua limitado à pasta escolhida nesta conversa.</span></span></label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm"><input type="checkbox" checked={computerUse} onChange={event => setComputerUse(event.target.checked)} className="mt-1 accent-primary" /><span><span className="block font-medium">Permitir Computer Use</span><span className="mt-0.5 block text-xs text-muted-foreground">Este agente pode navegar em uma sessão isolada e mostrar cada ação com seu cursor.</span></span></label>
        </> : <>
          {kind === 'project' && <label className="block space-y-1.5 text-sm">Instruções do projeto<textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Opcional; valem para todas as conversas do projeto" /></label>}
          <div className="space-y-1.5 text-sm"><span>{kind === 'project' ? 'Equipe padrão (opcional)' : 'Participantes (opcional)'}</span><div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-border p-2">{agents.length ? agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60"><input type="checkbox" checked={selectedAgents.includes(agent.id)} onChange={() => toggleAgent(agent.id)} className="accent-primary" /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>) : <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum agente cadastrado; o Assistente padrão cuida da conversa.</p>}</div></div>
          <label className="block space-y-1.5 text-sm">{kind === 'project' ? 'Pasta do projeto' : 'Pasta da conversa'}<div className="flex gap-2"><input readOnly value={directory} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" placeholder="Opcional; uma pasta privada será usada sem seleção" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></label>
        </>}
        {problem && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border/70 px-5 py-4"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => void submit()} disabled={saving || (kind !== 'conversation' && !name.trim()) || (kind === 'agent' && !instructions.trim())}>{saving ? 'Salvando…' : editing ? 'Salvar' : kind === 'agent' ? 'Criar agente' : kind === 'project' ? 'Criar projeto' : 'Criar conversa'}</Button></footer>
    </section>
  </div>
}
