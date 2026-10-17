import { useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { randomPitColor, type Agent, type Conversation, type Model, type Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { PoliCustomizer } from '../app/PoliCustomizer'
import { EFFORT_LABELS, EFFORT_LEVELS, aliasFor, errorText } from '../app/appShellShared'

export type EditorKind = 'agent' | 'conversation' | 'workspace'
export type EditorData = (Partial<Agent> | Partial<Conversation> | Partial<Workspace>) & { workspacePath?: string | null; path?: string | null }

export function Editor({ kind, agents, models, initial, workspaceId, defaultAgentIds, workspaces = [], onClose, onSave, onPickFolder }: {
  kind: EditorKind; agents: Agent[]; models: Model[]; initial?: Agent | Conversation | Workspace; workspaceId?: string | null; defaultAgentIds?: string[];
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
  const [role, setRole] = useState((initial as Agent | undefined)?.role || 'agent')
  const [effort, setEffort] = useState((initial as Agent | undefined)?.effort || 'medium')
  // Cada Pit novo sorteia uma cor da paleta; editar um agente existente preserva a cor já escolhida.
  const [color, setColor] = useState((initial as Agent | undefined)?.color || randomPitColor())
  const [pitsShape, setPitsShape] = useState((initial as Agent | undefined)?.pitsShape || 'round')
  const [pits, setPits] = useState<Partial<Agent>>(() => {
    const agent = initial as Agent | undefined
    return { pitsEyeColor: agent?.pitsEyeColor, pitsEyeSize: agent?.pitsEyeSize, pitsEyeSpacing: agent?.pitsEyeSpacing, pitsCheekColor: agent?.pitsCheekColor, pitsBlush: agent?.pitsBlush, pitsAura: agent?.pitsAura, pitsAnimate: agent?.pitsAnimate, pitsSpeed: agent?.pitsSpeed, pitsAmplitude: agent?.pitsAmplitude }
  })
  const [avatar, setAvatar] = useState((initial as Agent | undefined)?.avatar || '')
  const [canWrite, setCanWrite] = useState((initial as Agent | undefined)?.canWrite || false)
  const [computerUse, setComputerUse] = useState((initial as Agent | undefined)?.computerUse || false)
  const [approvalMode, setApprovalMode] = useState((initial as Agent | undefined)?.approvalMode || 'ask')
  const originalConversation = kind === 'conversation' ? initial as Conversation | undefined : undefined
  const originalWorkspace = kind === 'workspace' ? initial as Workspace | undefined : undefined
  const [selectedAgents, setSelectedAgents] = useState<string[]>(originalConversation?.agentIds || originalWorkspace?.defaultAgentIds || defaultAgentIds || [])
  const [workspacePermissions, setWorkspacePermissions] = useState<NonNullable<Workspace['permissions']>>(originalWorkspace?.permissions || { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit', computerUse: 'inherit' })
  const contextWorkspace = workspaces.find(item => item.id === workspaceId)
  const [directory, setDirectory] = useState(originalWorkspace?.kind === 'local' || originalWorkspace?.kind === 'worktree' ? originalWorkspace.path : '')
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
      if (kind === 'agent') await onSave({ ...(initial ? { id: initial.id } : {}), name, alias: alias || aliasFor(name), description, instructions, model, effort, role, color, avatar, pitsShape, ...pits, canWrite, computerUse, approvalMode, runtime })
      else if (kind === 'workspace') await onSave({ ...(initial ? { id: initial.id } : {}), name, instructions, defaultAgentIds: selectedAgents, permissions: workspacePermissions, path: directory || null })
      else {
        const isGroup = selectedAgents.length > 1 || (originalConversation?.kind === 'group' && selectedAgents.length > 0)
        if (isGroup && !name.trim()) throw new Error('Dê um nome para a conversa em grupo.')
        await onSave({ ...(initial ? { id: initial.id } : { workspaceId: workspaceId ?? undefined }), name: name.trim() ? name : undefined, kind: isGroup ? 'group' : 'direct', agentIds: selectedAgents, workspacePath: !workspaceId && !initial ? directory || undefined : undefined, archived: originalConversation?.archived || false })
      }
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }
  const toggleAgent = (id: string) => setSelectedAgents(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const previewAgent: Agent = { id: (initial as Agent | undefined)?.id || '', name, alias, description, instructions, model, runtime, role, color, avatar, pitsShape, ...pits, canWrite, computerUse, approvalMode, revision: 0, createdAt: '' }
  return <div className={`fixed inset-0 z-50 flex bg-black/45 ${kind === 'agent' ? 'justify-end' : 'items-center justify-center p-4'}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" className={`flex w-full flex-col overflow-hidden border border-border bg-background text-foreground shadow-2xl ${kind === 'agent' ? 'h-full max-h-screen max-w-[840px] rounded-l-2xl border-y-0 border-r-0' : 'max-w-lg rounded-2xl'}`}>
      <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        {kind === 'agent' && <Avatar agent={previewAgent} size="md" />}
        <div className="min-w-0 flex-1"><h2 id="workspace-editor-title" className="font-semibold">{kind === 'agent' ? editing ? 'Personalizar Pits' : 'Adicionar agente' : kind === 'workspace' ? editing ? 'Editar workspace' : 'Novo workspace' : editing ? 'Editar conversa' : 'Nova conversa'}</h2><p className="mt-1 text-xs text-muted-foreground">{kind === 'agent' ? 'Rosto, formato e cor deste agente.' : kind === 'workspace' ? 'Comece pelo nome. Pasta e equipe podem ser definidas depois.' : contextWorkspace ? `Conversa dentro de ${contextWorkspace.name}.` : 'Escolha quem participa. Sem agentes, a conversa fica com o Assistente.'}</p></div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button>
      </header>
      <div className={`${kind === 'agent' ? 'min-h-0 flex-1' : 'max-h-[72vh]'} space-y-4 overflow-y-auto px-5 py-4`}>
        {(kind !== 'conversation' || selectedAgents.length > 0 || !!name) && <label className="block space-y-1.5 text-sm">{kind === 'agent' ? 'Nome do agente' : kind === 'workspace' ? 'Nome do workspace' : 'Nome da conversa'}<Input autoFocus value={name} onChange={event => { setName(event.target.value); if (kind === 'agent' && !editing) setAlias(aliasFor(event.target.value)) }} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder={kind === 'agent' ? 'Por exemplo, Revisora' : kind === 'workspace' ? 'Por exemplo, Site institucional' : 'Ex.: Planejamento do projeto'} required={kind === 'workspace' || kind === 'agent' || selectedAgents.length > 1} /></label>}
        {kind === 'agent' ? <>
          <label className="block space-y-1.5 text-sm">Especialidade<Input value={description} onChange={event => setDescription(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="Ex.: Pesquisa, código, revisão" /></label>
          <label className="block space-y-1.5 text-sm">Instruções<Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Descreva como ele deve trabalhar e responder." /></label>
          <label className="block space-y-1.5 rounded-lg border border-border/70 p-3 text-sm">Papel deste agente<Select value={role} onValueChange={value => setRole(value as typeof role)}><SelectTrigger aria-label="Papel deste agente" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agent">Agente da equipe</SelectItem><SelectItem value="chief">Chief coordenador</SelectItem></SelectContent></Select>{role === 'chief' && <span className="mt-2 block text-xs leading-5 text-muted-foreground">O Chief só pode propor ações habilitadas no workspace. Criar, editar, mudar a equipe e delegar exigem aprovação sua.</span>}</label>
          <PoliCustomizer agent={previewAgent} onChange={patch => { if (patch.color) setColor(patch.color); if (patch.pitsShape) setPitsShape(patch.pitsShape); setPits(current => ({ ...current, ...patch })) }} />
          <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"><Avatar agent={previewAgent} size="md" /> {avatar ? "Trocar imagem enviada" : "Usar imagem prÃ³pria"}</button><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => chooseAvatar(event.target.files?.[0])} />{avatar && <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent" onClick={() => setAvatar("")}>Voltar ao Poli</button>}<span className="text-xs text-muted-foreground">Opcional Â· PNG, JPG ou WebP atÃ© 1,4 MB</span></div>
          <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Mais opções</summary><div className="mt-3 space-y-4">
            <label className="block space-y-1.5 text-sm">Menção<Input value={alias} onChange={event => setAlias(aliasFor(event.target.value))} className="h-10 w-full rounded-lg border border-input bg-background px-3" placeholder="revisora" /></label>
            <label className="block space-y-1.5 text-sm">Perfil rápido<Select value="" onValueChange={profile => { if (profile === 'codex-balanced' || profile === 'codex-focused') { setRuntime('codex'); setModel(''); setEffort(profile === 'codex-focused' ? 'high' : 'medium') } else if (profile.startsWith('claude-')) { setRuntime('claude'); const desired = profile === 'claude-opus' ? /opus/i : /sonnet/i; setModel(models.find(item => item.runtime === 'claude' && desired.test(item.name))?.id.replace(/^claude:/, '') || ''); setEffort(profile === 'claude-opus' ? 'high' : 'medium') } }}><SelectTrigger aria-label="Perfil rápido"><SelectValue placeholder="Escolha uma base…" /></SelectTrigger><SelectContent><SelectItem value="codex-balanced">Codex equilibrado</SelectItem><SelectItem value="codex-focused">Codex focado</SelectItem><SelectItem value="claude-sonnet">Claude Sonnet equilibrado</SelectItem><SelectItem value="claude-opus">Claude Opus avançado</SelectItem></SelectContent></Select></label>
            <label className="block space-y-1.5 text-sm">Motor<Select value={runtime} onValueChange={value => { setRuntime(value as 'codex' | 'claude'); setModel('') }}><SelectTrigger aria-label="Motor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="codex">Codex</SelectItem><SelectItem value="claude">Claude Agent SDK</SelectItem></SelectContent></Select></label>
            <label className="block space-y-1.5 text-sm">Modelo<Select value={model ? runtime + ':' + model : ''} onValueChange={value => setModel(value.replace(/^(codex|claude):/, ''))}><SelectTrigger aria-label="Modelo"><SelectValue placeholder="Padrão do motor" /></SelectTrigger><SelectContent>{models.filter(item => item.runtime === runtime).map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.isDefault ? ' · padrão' : ''}</SelectItem>)}</SelectContent></Select></label>
            <label className="block space-y-1.5 text-sm">Esforço<Select value={effort} onValueChange={value => setEffort(value as typeof effort)}><SelectTrigger aria-label="Esforço"><SelectValue /></SelectTrigger><SelectContent>{EFFORT_LEVELS.map(level => <SelectItem key={level} value={level}>{EFFORT_LABELS[level]}</SelectItem>)}</SelectContent></Select></label>
            <label className="block space-y-1.5 text-sm">Aprovações para arquivos e navegador<Select value={approvalMode} onValueChange={value => setApprovalMode(value as 'ask' | 'automatic')}><SelectTrigger aria-label="Aprovações para arquivos e navegador"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ask">Perguntar antes de agir (padrão)</SelectItem><SelectItem value="automatic">Executar automaticamente</SelectItem></SelectContent></Select></label>
            <label className="flex items-center gap-3 rounded-lg border border-border/70 p-3 text-sm"><Checkbox checked={canWrite} onCheckedChange={checked => setCanWrite(checked === true)} /><span><span className="block font-medium">Pode editar arquivos</span><span className="mt-0.5 block text-xs text-muted-foreground">O acesso depende da pasta escolhida na conversa.</span></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 text-sm"><Checkbox checked={computerUse} onCheckedChange={checked => setComputerUse(checked === true)} className="mt-1" /><span><span className="block font-medium">Permitir Computer Use</span><span className="mt-0.5 block text-xs text-muted-foreground">Navegar em sessão isolada.</span></span></label>
          </div></details>
        </> : <>
          {kind === 'conversation' && <div className="space-y-2"><span className="block text-sm font-medium">Quem participa?</span>{agents.length ? <div className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-border p-1">{agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 hover:bg-accent/60"><Checkbox checked={selectedAgents.includes(agent.id)} onCheckedChange={() => toggleAgent(agent.id)} /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate text-sm">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>)}</div> : <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">Sem agentes cadastrados; o Assistente padrão responde.</p>}{selectedAgents.length === 0 && <p className="text-xs text-muted-foreground">Assistente padrão selecionado</p>}{selectedAgents.length === 1 && <p className="text-xs text-muted-foreground">Conversa direta com um agente.</p>}{selectedAgents.length > 1 && <p className="text-xs text-muted-foreground">Conversa em grupo. Dê um nome para continuar.</p>}</div>}
          {kind === 'workspace' && <details open className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Opções do workspace</summary><div className="mt-3 space-y-4">
            <label className="block space-y-1.5 text-sm">Instruções do workspace<Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2" placeholder="Opcional; valem para as novas conversas" /></label>
            <div className="space-y-1.5 text-sm"><span>Equipe padrão (opcional)</span><div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-border p-2">{agents.length ? agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60"><Checkbox checked={selectedAgents.includes(agent.id)} onCheckedChange={() => toggleAgent(agent.id)} /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>) : <p className="px-2 py-3 text-xs text-muted-foreground">Sem equipe padrão; novas conversas usam o Assistente.</p>}</div></div>
            <fieldset className="space-y-2 rounded-lg border border-border/70 p-3"><legend className="px-1 text-sm font-medium">Permissões do workspace</legend><p className="text-xs leading-5 text-muted-foreground">As ações do Chief ficam bloqueadas até você habilitá-las aqui. A aprovação de cada proposta continua obrigatória.</p>{([['chiefCreateAgents','Chief pode propor novos agentes'],['chiefEditAgents','Chief pode propor alterações de agentes'],['chiefManageTeam','Chief pode propor mudanças na equipe'],['chiefCreateSessions','Chief pode propor novas sessões']] as const).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs"><Checkbox checked={workspacePermissions[key]} onCheckedChange={checked => setWorkspacePermissions(current => ({ ...current, [key]: checked === true }))} />{label}</label>)}{([['filesWrite','Alterações de arquivos'],['computerUse','Uso do navegador']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">{label}<Select value={workspacePermissions[key]} onValueChange={value => setWorkspacePermissions(current => ({ ...current, [key]: value as 'inherit' | 'deny' }))}><SelectTrigger aria-label={label} className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Herdar do agente</SelectItem><SelectItem value="deny">Bloquear</SelectItem></SelectContent></Select></label>)}</fieldset>
            <label className="block space-y-1.5 text-sm">Pasta do workspace<div className="flex gap-2"><Input readOnly value={directory} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" placeholder="Deixe em branco para um workspace livre" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></label>
          </div></details>}
          {kind === 'conversation' && !contextWorkspace && !initial && <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Pasta de trabalho (opcional)</summary><div className="mt-3"><div className="flex gap-2"><Input readOnly value={directory} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" placeholder="Pode ser definida depois" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></div></details>}
        </>}
        {problem && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border/70 px-5 py-4"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => void submit()} disabled={saving || (kind !== 'conversation' && !name.trim()) || (kind === 'conversation' && selectedAgents.length > 1 && !name.trim()) || (kind === 'agent' && !instructions.trim())}>{saving ? 'Salvando…' : editing ? 'Salvar' : kind === 'agent' ? 'Adicionar agente' : kind === 'workspace' ? 'Criar workspace' : selectedAgents.length > 1 ? 'Criar grupo' : 'Criar conversa'}</Button></footer>
    </section>
  </div>
}
