import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Folder, FolderGit2, FolderOpen, FolderPlus, Loader2, Palette, ShieldCheck, TriangleAlert, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { randomPitColor, type Agent, type Conversation, type Model, type Workspace } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { PoliCustomizer } from '../app/PoliCustomizer'
import { ModelSelector } from '../composer/ModelSelector'
import { ApprovalGrantList } from './ApprovalGrantList'
import { EFFORT_LABELS, EFFORT_LEVELS, aliasFor, errorText } from '../app/appShellShared'

export type EditorKind = 'agent' | 'conversation' | 'workspace'
export type EditorData = (Partial<Agent> | Partial<Conversation> | Partial<Workspace>) & { workspacePath?: string | null; path?: string | null }

type AgentSection = 'identity' | 'appearance' | 'execution'
const AGENT_SECTIONS: { id: AgentSection; label: string; description: string; icon: typeof UserRound }[] = [
  { id: 'identity', label: 'Identidade', description: 'Nome, menção, instruções e papel do agente na equipe.', icon: UserRound },
  { id: 'appearance', label: 'Aparência', description: 'Mascote ou imagem que representa o agente nas conversas.', icon: Palette },
  { id: 'execution', label: 'Modelo e permissões', description: 'Com qual modelo o agente trabalha e o que pode fazer sem perguntar.', icon: ShieldCheck },
]

type ProjectOrigin = 'new' | 'existing' | 'github' | 'free'
// Hierarquia inspirada no "Add project" do Paseo: primeiro a origem, depois só os campos dela.
const PROJECT_ORIGINS: { id: ProjectOrigin; label: string; description: string; icon: typeof FolderOpen }[] = [
  { id: 'new', label: 'Criar pasta nova', description: 'Começa do zero em uma pasta vazia neste computador.', icon: FolderPlus },
  { id: 'existing', label: 'Abrir pasta existente', description: 'Associa uma pasta que já está no computador.', icon: FolderOpen },
  { id: 'github', label: 'Clonar do GitHub', description: 'Baixa um repositório com a autenticação Git já configurada aqui.', icon: FolderGit2 },
  { id: 'free', label: 'Sem pasta por enquanto', description: 'Projeto livre; a pasta pode ser definida depois.', icon: Folder },
]
const lastSegment = (value: string) => value.trim().replace(/\.git\/?$/, '').replace(/[\\/]+$/, '').split(/[\\/:]/).pop() || ''

function EditorGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const titleId = useId()
  return <section aria-labelledby={titleId} className="ds-card p-4">
    <h4 id={titleId} className="ds-section-title">{title}</h4>
    {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
}

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
  const [temporary, setTemporary] = useState((initial as Agent | undefined)?.temporary === true)
  const [effort, setEffort] = useState((initial as Agent | undefined)?.effort || 'medium')
  const runtimeModels = models.filter(item => item.runtime === runtime)
  const selectedModel = model
    ? runtimeModels.find(item => item.id === `${runtime}:${model}` || item.id === model)
    : runtimeModels.find(item => item.isDefault) || runtimeModels[0]
  const allowedEfforts = selectedModel?.supportedEfforts ?? EFFORT_LEVELS
  const selectedEffort = allowedEfforts.includes(effort) ? effort
    : selectedModel?.defaultEffort && allowedEfforts.includes(selectedModel.defaultEffort) ? selectedModel.defaultEffort
      : allowedEfforts[0]
  // Cada Pit novo sorteia uma cor da paleta; editar um agente existente preserva a cor já escolhida.
  const [color, setColor] = useState((initial as Agent | undefined)?.color || randomPitColor())
  const [pitsShape, setPitsShape] = useState((initial as Agent | undefined)?.pitsShape || 'ghost-wave')
  const [pits, setPits] = useState<Partial<Agent>>(() => {
    const agent = initial as Agent | undefined
    return { pitsAccessory: agent?.pitsAccessory, pitsHeadAccessory: agent?.pitsHeadAccessory, pitsFaceAccessory: agent?.pitsFaceAccessory, pitsBodyWidth: agent?.pitsBodyWidth, pitsBodyHeight: agent?.pitsBodyHeight, pitsMouthSize: agent?.pitsMouthSize, pitsBlushStrength: agent?.pitsBlushStrength, pitsEyeColor: agent?.pitsEyeColor, pitsEyeSize: agent?.pitsEyeSize, pitsEyeSpacing: agent?.pitsEyeSpacing, pitsCheekColor: agent?.pitsCheekColor, pitsAccentColor: agent?.pitsAccentColor, pitsHeadset: agent?.pitsHeadset, pitsBlush: agent?.pitsBlush, pitsAura: agent?.pitsAura, pitsAnimate: agent?.pitsAnimate, pitsSpeed: agent?.pitsSpeed, pitsAmplitude: agent?.pitsAmplitude }
  })
  const [avatar, setAvatar] = useState((initial as Agent | undefined)?.avatar || '')
  const [canWrite, setCanWrite] = useState((initial as Agent | undefined)?.canWrite ?? true)
  const [computerUse, setComputerUse] = useState((initial as Agent | undefined)?.computerUse || false)
  const [approvalMode, setApprovalMode] = useState((initial as Agent | undefined)?.approvalMode || 'automatic')
  const [runtimePermissionMode, setRuntimePermissionMode] = useState((initial as Agent | undefined)?.runtimePermissionMode || 'managed')
  const originalConversation = kind === 'conversation' ? initial as Conversation | undefined : undefined
  const originalWorkspace = kind === 'workspace' ? initial as Workspace | undefined : undefined
  const [selectedAgents, setSelectedAgents] = useState<string[]>(originalConversation?.agentIds || originalWorkspace?.defaultAgentIds || defaultAgentIds || [])
  // Grupos novos usam o primeiro participante como líder; todos responderem é uma escolha explícita.
  const [responseMode, setResponseMode] = useState<NonNullable<Conversation['responseMode']>>(originalConversation?.responseMode || 'leader')
  const [leaderAgentId, setLeaderAgentId] = useState(originalConversation?.leaderAgentId || originalConversation?.agentIds[0] || selectedAgents[0] || '')
  const [workspacePermissions, setWorkspacePermissions] = useState<NonNullable<Workspace['permissions']>>(originalWorkspace?.permissions || { chiefCreateAgents: true, chiefEditAgents: true, chiefManageTeam: true, chiefCreateSessions: true, filesWrite: 'inherit', computerUse: 'inherit' })
  const contextWorkspace = workspaces.find(item => item.id === workspaceId)
  const [directory, setDirectory] = useState(originalWorkspace?.kind === 'local' || originalWorkspace?.kind === 'worktree' ? originalWorkspace.path : '')
  const [origin, setOrigin] = useState<ProjectOrigin>('new')
  const [parentFolder, setParentFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [repository, setRepository] = useState('')
  const [cloning, setCloning] = useState(false)
  const creatingProject = kind === 'workspace' && !editing
  // Nome do projeto pode vir da pasta ou do repositório quando o usuário não digitou um.
  const projectName = name.trim() || (!creatingProject ? '' : origin === 'new' ? folderName.trim() : origin === 'existing' ? lastSegment(directory) : origin === 'github' ? lastSegment(folderName || repository) : '')
  const targetFolderName = origin === 'new' ? folderName.trim() || name.trim() : folderName.trim() || lastSegment(repository)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const pickInto = (set: (value: string) => void, current: string) => async () => { try { set(await onPickFolder() || current) } catch (error) { setProblem(errorText(error)) } }
  const [agentSection, setAgentSection] = useState<AgentSection>('identity')
  const currentAgentSection = AGENT_SECTIONS.find(item => item.id === agentSection) || AGENT_SECTIONS[0]
  const tabsId = useId()
  const agentTabRefs = useRef<Partial<Record<AgentSection, HTMLButtonElement | null>>>({})
  // Abas WAI-ARIA: setas nos dois eixos, porque a lista é horizontal em janelas estreitas e vertical nas largas.
  const onAgentTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const index = AGENT_SECTIONS.findIndex(item => item.id === agentSection)
    const last = AGENT_SECTIONS.length - 1
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % AGENT_SECTIONS.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + last) % AGENT_SECTIONS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1
    if (next < 0) return
    event.preventDefault()
    setAgentSection(AGENT_SECTIONS[next].id)
    agentTabRefs.current[AGENT_SECTIONS[next].id]?.focus()
  }
  const uploadRef = useRef<HTMLInputElement>(null)
  const chooseAvatar = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_400_000) { setProblem('Escolha uma imagem PNG, JPG ou WebP de até 1,4 MB.'); return }
    const reader = new FileReader(); reader.onload = () => setAvatar(String(reader.result || '')); reader.readAsDataURL(file)
  }
  const submit = async () => {
    setSaving(true); setProblem('')
    try {
      if (kind === 'agent' && !instructions.trim()) { setAgentSection('identity'); throw new Error('Escreva as instruções de trabalho do agente para continuar.') }
      if (kind === 'agent') await onSave({ ...(initial ? { id: initial.id } : {}), name, alias: alias || aliasFor(name), description, instructions, model, effort: selectedEffort, role, color, avatar, pitsShape, ...pits, temporary, canWrite, computerUse, approvalMode, runtimePermissionMode, runtime })
      else if (kind === 'workspace') {
        let path: string | null = directory || null
        if (creatingProject && origin === 'free') path = null
        if (creatingProject && origin === 'existing' && !directory) throw new Error('Escolha a pasta existente do projeto.')
        if (creatingProject && (origin === 'new' || origin === 'github')) {
          if (origin === 'github' && !repository.trim()) throw new Error('Informe a URL do GitHub ou owner/repositório.')
          if (!parentFolder) throw new Error(origin === 'new' ? 'Escolha onde a pasta nova será criada.' : 'Escolha onde o repositório será clonado.')
          if (!targetFolderName) throw new Error('Dê um nome para a pasta.')
          if (origin === 'new') path = await window.appAPI.createProjectFolder({ parent: parentFolder, name: targetFolderName })
          else {
            setCloning(true)
            try { path = await window.appAPI.cloneRepository({ repository: repository.trim(), parent: parentFolder, name: folderName.trim() || undefined }) } finally { setCloning(false) }
          }
          // Se salvar o projeto falhar, a nova tentativa reaproveita a pasta já criada em vez de recriá-la.
          setDirectory(path); setOrigin('existing'); if (!name.trim()) setName(projectName)
        }
        await onSave({ ...(initial ? { id: initial.id } : {}), name: projectName || name, instructions, defaultAgentIds: selectedAgents, permissions: workspacePermissions, path })
      }
      else {
        const isGroup = selectedAgents.length > 1 || (originalConversation?.kind === 'group' && selectedAgents.length > 0)
        if (isGroup && !name.trim()) throw new Error('Dê um nome para a conversa em grupo.')
        if (isGroup && responseMode !== 'broadcast' && !leaderAgentId && !selectedAgents[0]) throw new Error('Escolha quem é o líder do grupo.')
        await onSave({ ...(initial ? { id: initial.id } : { workspaceId: workspaceId ?? undefined }), name: name.trim() ? name : undefined, kind: isGroup ? 'group' : 'direct', agentIds: selectedAgents, responseMode: isGroup ? responseMode : 'leader', leaderAgentId: isGroup && responseMode !== 'broadcast' ? leaderAgentId || selectedAgents[0] : null, workspacePath: !workspaceId && !initial ? directory || undefined : undefined, archived: originalConversation?.archived || false })
      }
      onClose()
    } catch (error) { setProblem(errorText(error)) } finally { setSaving(false) }
  }
  const toggleAgent = (id: string) => setSelectedAgents(current => {
    if (!current.includes(id) && current.length >= 6) { setProblem('Um grupo pode ter no máximo 6 agentes.'); return current }
    setProblem('')
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id]
    if (!next.includes(leaderAgentId)) setLeaderAgentId(next[0] || '')
    return next
  })
  // Especialidade e instruções não mudam nada no rosto do Pit: fora dos deps, digitar nesses campos não força o Boo Studio (SVG, 3 cópias na tela) a recalcular a cada tecla.
  const previewAgent: Agent = useMemo(() => ({ id: (initial as Agent | undefined)?.id || '', name, alias, description: '', instructions: '', model, runtime, role, color, avatar, pitsShape, ...pits, canWrite, computerUse, approvalMode, runtimePermissionMode, revision: 0, createdAt: '' }),
    [initial, name, alias, model, runtime, role, color, avatar, pitsShape, pits, canWrite, computerUse, approvalMode, runtimePermissionMode])
  const onCustomizePoli = useCallback((patch: Partial<Agent>) => { if (patch.color) setColor(patch.color); if (patch.pitsShape) setPitsShape(patch.pitsShape); setPits(current => ({ ...current, ...patch })) }, [])
  return <div className={`fixed inset-0 z-50 flex bg-black/45 ${kind === 'agent' ? 'justify-end' : 'items-center justify-center p-4'}`} onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-editor-title" className={`flex w-full flex-col overflow-hidden border border-border bg-background text-foreground shadow-2xl ${kind === 'agent' ? 'h-full max-h-screen max-w-[840px] rounded-l-xl border-y-0 border-r-0' : 'max-w-lg rounded-xl'}`}>
      <header className={kind === 'agent' ? 'flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4' : 'flex items-center justify-between border-b border-border/70 px-5 py-4'}>
        {kind === 'agent' && <Avatar agent={previewAgent} size="sm" />}
        <div className="min-w-0 flex-1"><h2 id="workspace-editor-title" className="font-semibold">{kind === 'agent' ? editing ? 'Editar agente' : 'Criar agente' : kind === 'workspace' ? editing ? 'Editar projeto' : 'Novo projeto' : editing ? 'Editar conversa' : 'Nova conversa'}</h2><p className="mt-1 text-xs text-muted-foreground">{kind === 'agent' ? 'Defina identidade, aparência e como este agente trabalha.' : kind === 'workspace' ? editing ? 'Nome, pasta, equipe e instruções do projeto.' : 'Escolha de onde vem o projeto. Agentes e instruções são opcionais.' : contextWorkspace ? `Conversa dentro de ${contextWorkspace.name}.` : 'Escolha quem participa. Sem agentes, a conversa fica com o Assistente.'}</p></div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button>
      </header>
      {kind === 'agent' ? <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav role="tablist" aria-label="Seções do agente" onKeyDown={onAgentTabKeyDown} className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/70 px-4 py-2 lg:w-56 lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          {AGENT_SECTIONS.map(item => <Button key={item.id} variant={null} size={null} id={`${tabsId}-${item.id}-tab`} ref={node => { agentTabRefs.current[item.id] = node }} role="tab" aria-selected={agentSection === item.id} aria-controls={`${tabsId}-panel`} tabIndex={agentSection === item.id ? 0 : -1} type="button" onClick={() => setAgentSection(item.id)}
            className="ds-nav-item flex h-9 shrink-0 items-center justify-start gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-sm font-medium focus-visible:ring-0" data-active={agentSection === item.id}>
            <item.icon aria-hidden="true" className="size-4 shrink-0" />{item.label}
          </Button>)}
        </nav>
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${agentSection}-tab`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <div className={`mx-auto space-y-4 ${agentSection === 'appearance' ? 'max-w-3xl' : 'max-w-2xl'}`}>
          <div><h3 className="ds-section-title text-[15px]">{currentAgentSection.label}</h3><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{currentAgentSection.description}</p></div>
          {agentSection === 'identity' && <>
            <EditorGroup title="Como aparece na conversa" description="Nome exibido nas mensagens e menção usada para chamar este agente.">
              <label className="block space-y-1.5 text-sm">Nome do agente<Input autoFocus value={name} onChange={event => { setName(event.target.value); if (!editing) setAlias(aliasFor(event.target.value)) }} className="h-10 w-full border border-input bg-background px-3" placeholder="Ex.: Revisora de código" required /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm">Menção<Input value={alias} onChange={event => setAlias(aliasFor(event.target.value))} className="h-10 w-full border border-input bg-background px-3" placeholder="revisora" /></label>
                <label className="block space-y-1.5 text-sm">Especialidade <span className="font-normal text-muted-foreground">(opcional)</span><Input value={description} onChange={event => setDescription(event.target.value)} className="h-10 w-full border border-input bg-background px-3" placeholder="Ex.: Pesquisa, código, revisão" /></label>
              </div>
            </EditorGroup>
            <EditorGroup title="Como trabalha">
              <label className="block space-y-1.5 text-sm">Instruções de trabalho<Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={7} className="w-full resize-y border border-input bg-background px-3 py-2" placeholder="Como deve trabalhar? O que deve priorizar? Como deve responder?" required /><span className="text-xs text-muted-foreground">Essas instruções definem o comportamento do agente. Você pode alterá-las depois.</span></label>
            </EditorGroup>
            <EditorGroup title="Papel na equipe">
              <label className="block max-w-md space-y-1.5 text-sm">Papel do agente<Select value={role} onValueChange={value => setRole(value as typeof role)}><SelectTrigger aria-label="Papel do agente"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agent">Agente da equipe</SelectItem><SelectItem value="chief">Chief coordenador</SelectItem></SelectContent></Select>{role === 'chief' && <span className="block text-xs leading-5 text-muted-foreground">As ações administrativas continuam sujeitas às permissões e aprovações do workspace.</span>}</label>
              {(initial as Agent | undefined)?.temporary && <label className="flex items-center gap-2 text-sm"><Checkbox checked={!temporary} onCheckedChange={checked => setTemporary(checked !== true)} /><span>Tornar este Boo permanente (não aposentar após a tarefa)</span></label>}
            </EditorGroup>
          </>}
          {agentSection === 'appearance' && <><p className="text-sm text-muted-foreground">Personalize o mascote. A imagem escolhida substitui o Boo nos lugares em que o avatar é exibido.</p><PoliCustomizer agent={previewAgent} onChange={onCustomizePoli} onReset={() => setAvatar('')} /><EditorGroup title="Imagem própria"><div className="flex flex-wrap items-center gap-3"><Button type="button" variant="ghost" size={null} onClick={() => uploadRef.current?.click()} className="rounded-md border border-border px-3 py-2 text-sm font-normal text-inherit hover:bg-accent hover:text-inherit">{avatar ? "Trocar imagem" : "Escolher imagem própria"}</Button><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => chooseAvatar(event.target.files?.[0])} />{avatar && <Button type="button" variant="ghost" size={null} className="rounded-md border border-border px-3 py-2 text-sm font-normal text-inherit hover:bg-accent hover:text-inherit" onClick={() => setAvatar("")}>Usar Boo</Button>}<span className="text-xs text-muted-foreground">PNG, JPG ou WebP · até 1,4 MB</span></div></EditorGroup></>}
          {agentSection === 'execution' && <>
            <EditorGroup title="Modelo" description="Motor, modelo e esforço usados quando este agente responde.">
            <label className="block space-y-1.5 text-sm">Perfil rápido<Select value="" onValueChange={profile => { if (profile === 'codex-balanced' || profile === 'codex-focused') { setRuntime('codex'); setModel(''); setEffort(profile === 'codex-focused' ? 'high' : 'medium') } else if (profile.startsWith('claude-')) { setRuntime('claude'); const desired = profile === 'claude-opus' ? /opus/i : /sonnet/i; setModel(models.find(item => item.runtime === 'claude' && desired.test(item.name))?.id.replace(/^claude:/, '') || ''); setEffort(profile === 'claude-opus' ? 'high' : 'medium') } }}><SelectTrigger aria-label="Perfil rápido"><SelectValue placeholder="Escolha uma base…" /></SelectTrigger><SelectContent><SelectItem value="codex-balanced">Codex equilibrado</SelectItem><SelectItem value="codex-focused">Codex focado</SelectItem><SelectItem value="claude-sonnet">Claude Sonnet equilibrado</SelectItem><SelectItem value="claude-opus">Claude Opus avançado</SelectItem></SelectContent></Select></label>
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">Motor<Select value={runtime} onValueChange={value => { setRuntime(value as Agent['runtime']); setModel('') }}><SelectTrigger aria-label="Motor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="codex">Codex</SelectItem><SelectItem value="claude">Claude Agent SDK</SelectItem><SelectItem value="pi">Pi Coding Agent (CLI)</SelectItem><SelectItem value="opencode">OpenCode (agente com ferramentas Boobot)</SelectItem><SelectItem value="antigravity">Antigravity (chat em modo plano)</SelectItem></SelectContent></Select></label>
            <div className="flex min-w-0 flex-col gap-1.5 text-sm [&_button]:w-full [&_button]:max-w-none [&_button]:justify-between"><span>Modelo</span><ModelSelector label="Modelo" variant="outline" allowInherit={false} value={model ? runtime + ':' + model : ''} onValueChange={value => setModel(value.replace(/^(codex|claude|pi|opencode|antigravity):/, ''))} models={models.filter(item => item.runtime === runtime).map(item => ({ ...item, provider: runtime === 'claude' ? 'Claude Code' : runtime === 'pi' ? 'Pi' : runtime === 'opencode' ? 'OpenCode' : runtime === 'antigravity' ? 'Antigravity' : 'Codex' }))} /></div>
            </div>
            {allowedEfforts.length > 0 && <label className="block space-y-1.5 text-sm sm:max-w-[calc(50%-0.5rem)]">Esforço<Select value={selectedEffort} onValueChange={value => setEffort(value as typeof effort)}><SelectTrigger aria-label="Esforço"><SelectValue /></SelectTrigger><SelectContent>{allowedEfforts.map(level => <SelectItem key={level} value={level}>{EFFORT_LABELS[level]}</SelectItem>)}</SelectContent></Select></label>}
            </EditorGroup>
            <EditorGroup title="Permissões" description="O que este agente pode fazer. As consequências aparecem junto de cada escolha.">
            <div className="divide-y divide-border rounded-md border border-border">
              <div className="px-3 py-2.5"><label className="flex items-center gap-3 text-sm"><Checkbox checked={canWrite} onCheckedChange={checked => setCanWrite(checked === true)} aria-describedby={`${tabsId}-write-hint`} /><span>Permitir edição de arquivos do workspace</span></label><p id={`${tabsId}-write-hint`} className="mt-0.5 pl-7 text-xs text-muted-foreground">A política do workspace também se aplica.</p></div>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm"><Checkbox checked={computerUse} onCheckedChange={checked => setComputerUse(checked === true)} className="mt-1" /><span><span className="block font-medium">Permitir Computer Use</span><span className="mt-0.5 block text-xs text-muted-foreground">Navegar em sessão isolada.</span></span></label>
            </div>
            <div className="space-y-2">
            <label className="block space-y-1.5 text-sm">Modo de aprovação deste agente<Select value={approvalMode} onValueChange={value => setApprovalMode(value as Agent['approvalMode'])}><SelectTrigger aria-label="Modo de aprovação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ask">Perguntar antes de cada ação</SelectItem><SelectItem value="automatic">Automático · pede só ações sensíveis (recomendado)</SelectItem><SelectItem value="bypass">Bypass · autonomia total</SelectItem></SelectContent></Select></label>
            <p data-testid="approval-mode-note" data-tone={approvalMode === 'bypass' ? 'warning' : undefined} className="flex gap-2 rounded-lg text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground">{approvalMode === 'bypass' && <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />}<span>{approvalMode === 'bypass' ? 'Bypass permite comandos de terminal sem confirmação para este agente. O terminal não é isolado e pode afetar todo o computador. No Chief, também permite criação de equipes e delegações dentro das permissões do workspace.' : approvalMode === 'automatic' ? 'O agente trabalha sozinho dentro das permissões: arquivos, navegador, comandos rotineiros, equipe e delegações. Pede aprovação só para ações sensíveis, como apagar arquivos em massa, push, publicação ou deploy.' : 'Este agente pede aprovação antes das ações que exigem confirmação. O modo do Assistente padrão é configurado separadamente.'}</span></p>
            {(runtime === 'codex' || runtime === 'claude') && <>
              <label className="block space-y-1.5 text-sm">Permissões do {runtime === 'claude' ? 'Claude Code' : 'Codex'}<Select value={runtimePermissionMode} onValueChange={value => setRuntimePermissionMode(value as NonNullable<Agent['runtimePermissionMode']>)}><SelectTrigger aria-label={`Permissões do ${runtime === 'claude' ? 'Claude Code' : 'Codex'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="managed">Gerenciado · recomendado</SelectItem><SelectItem value="bypass">{runtime === 'claude' ? 'Bypass do Claude Code' : 'Acesso total do Codex'}</SelectItem></SelectContent></Select></label>
              <p data-tone={runtimePermissionMode === 'bypass' ? 'warning' : undefined} className="rounded-md text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground">{runtimePermissionMode === 'bypass' ? runtime === 'claude' ? 'Ativa bypassPermissions no Claude Code. Ferramentas nativas de edição e shell continuam bloqueadas; chamadas às ferramentas do Politron ainda seguem o modo de aprovação e os limites do workspace.' : 'Ativa danger-full-access e approvalPolicy never no Codex. As ferramentas nativas de edição e shell continuam bloqueadas; chamadas às ferramentas do Politron ainda seguem o modo de aprovação e os limites do workspace.' : 'O motor usa as permissões gerenciadas pelo Politron. Ferramentas do agente continuam limitadas ao workspace e ao modo de aprovação.'}</p>
            </>}
            {editing && (initial as Agent | undefined)?.id && <ApprovalGrantList agentId={(initial as Agent).id} />}
            </div>
            </EditorGroup>
          </>}
          </div>
        </div>
      </div> : <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
        {(kind !== 'conversation' || selectedAgents.length > 0 || !!name) && <label className="block space-y-1.5 text-sm">{kind === 'workspace' ? 'Nome do projeto' : 'Nome da conversa'}<Input autoFocus value={name} onChange={event => setName(event.target.value)} className="h-10 w-full border border-input bg-background px-3" placeholder={kind === 'workspace' ? projectName || 'Por exemplo, Site institucional' : 'Ex.: Planejamento do projeto'} required={(kind === 'workspace' && !creatingProject) || selectedAgents.length > 1} /></label>}
          {creatingProject && <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-medium">Origem do projeto</legend>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">{PROJECT_ORIGINS.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-accent/60 has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-inset">
              <input type="radio" name="project-origin" value={item.id} checked={origin === item.id} onChange={() => { setOrigin(item.id); setProblem('') }} className="sr-only" />
              <item.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span>
            </label>)}</div>
            {origin === 'existing' && <label className="block space-y-1.5 pt-2 text-sm">Pasta do projeto<div className="flex gap-2"><Input readOnly value={directory} className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-xs" placeholder="Nenhuma pasta escolhida" /><Button type="button" variant="outline" onClick={pickInto(setDirectory, directory)}><FolderOpen className="size-4" /> Escolher</Button></div></label>}
            {origin === 'github' && <label className="block space-y-1.5 pt-2 text-sm">Repositório do GitHub<Input value={repository} onChange={event => setRepository(event.target.value)} className="h-10 w-full border border-input bg-background px-3" placeholder="https://github.com/owner/repo ou owner/repo" spellCheck={false} autoComplete="off" /><span className="block text-xs text-muted-foreground">Usa a autenticação Git/GitHub deste computador. Nenhuma senha é pedida aqui e nada é publicado.</span></label>}
            {(origin === 'new' || origin === 'github') && <div className="space-y-3 pt-2">
              <label className="block space-y-1.5 text-sm">{origin === 'new' ? 'Onde criar' : 'Clonar em'}<div className="flex gap-2"><Input readOnly value={parentFolder} className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-xs" placeholder="Escolha a pasta de destino" /><Button type="button" variant="outline" onClick={pickInto(setParentFolder, parentFolder)}><FolderOpen className="size-4" /> Escolher</Button></div></label>
              <label className="block space-y-1.5 text-sm">Nome da pasta {origin === 'github' && <span className="font-normal text-muted-foreground">(opcional)</span>}<Input value={folderName} onChange={event => setFolderName(event.target.value)} className="h-10 w-full border border-input bg-background px-3" placeholder={targetFolderName || 'minha-landing-page'} spellCheck={false} /></label>
              {parentFolder && targetFolderName && <p className="break-all text-xs text-muted-foreground">{origin === 'new' ? 'Será criada' : 'Destino'}: {parentFolder.replace(/[\\/]+$/, '')}{parentFolder.includes('\\') ? '\\' : '/'}{targetFolderName}</p>}
            </div>}
          </fieldset>}
          {kind === 'conversation' && <div className="space-y-2"><span className="block text-sm font-medium">Quem participa?</span>{agents.length ? <div className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-border p-1">{agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 hover:bg-accent/60"><Checkbox checked={selectedAgents.includes(agent.id)} onCheckedChange={() => toggleAgent(agent.id)} /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate text-sm">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>)}</div> : <p className="rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">Sem agentes cadastrados; o Assistente padrão responde.</p>}{selectedAgents.length === 0 && <p className="text-xs text-muted-foreground">Assistente padrão selecionado</p>}{selectedAgents.length === 1 && <p className="text-xs text-muted-foreground">Conversa direta com um agente.</p>}{selectedAgents.length > 1 && <p className="text-xs text-muted-foreground">Conversa em grupo. Dê um nome para continuar.</p>}</div>}
        {kind === 'conversation' && selectedAgents.length > 1 && <div className="space-y-2 rounded-lg border border-border/70 p-3 text-sm"><span className="block font-medium">Quem responde sem menção?</span><Select value={responseMode} onValueChange={value => setResponseMode(value as typeof responseMode)}><SelectTrigger aria-label="Quem responde sem menção?"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leader">Só o líder do grupo · padrão</SelectItem><SelectItem value="auto">Automático · Jev pelo OpenRouter</SelectItem><SelectItem value="discussion">Rodada em ordem · todos colaboram</SelectItem><SelectItem value="broadcast">Todos respondem em paralelo</SelectItem></SelectContent></Select>{responseMode !== 'broadcast' && <label className="block space-y-1.5 text-sm">Líder e fallback do automático<Select value={leaderAgentId || selectedAgents[0] || ''} onValueChange={setLeaderAgentId}><SelectTrigger aria-label="Líder e fallback do automático"><SelectValue placeholder="Escolha um participante" /></SelectTrigger><SelectContent>{selectedAgents.map(id => { const agent = agents.find(item => item.id === id); return agent && <SelectItem key={id} value={id}>{agent.name} · @{agent.alias}</SelectItem> })}</SelectContent></Select></label>}<p className="text-xs leading-5 text-muted-foreground">No modo automático, o Jev escolhe um agente usando o contexto recente. A rodada chama os participantes em sequência e envia as respostas anteriores como contexto. Sem chave, em caso de falha ou pouca confiança, responde o líder. Uma @menção sempre direciona a resposta aos agentes mencionados.</p></div>}
          {kind === 'workspace' && <div className="space-y-1.5 text-sm"><span>Agentes do projeto (opcional)</span><div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-border p-2">{agents.length ? agents.map(agent => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent/60"><Checkbox checked={selectedAgents.includes(agent.id)} onCheckedChange={() => toggleAgent(agent.id)} /><Avatar agent={agent} /><span className="min-w-0 flex-1 truncate">{agent.name}</span><span className="text-xs text-muted-foreground">@{agent.alias}</span></label>) : <p className="px-2 py-3 text-xs text-muted-foreground">Sem agentes cadastrados; novas conversas usam o Assistente.</p>}</div><span className="block text-xs text-muted-foreground">{selectedAgents.length === 0 ? 'Sem equipe: o Assistente padrão responde.' : selectedAgents.length === 1 ? 'Um agente forma a equipe padrão do projeto.' : `${selectedAgents.length} agentes formam a equipe padrão do projeto.`}</span></div>}
          {kind === 'workspace' && <details open={editing} className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Mais opções do projeto</summary><div className="mt-3 space-y-4">
            <label className="block space-y-1.5 text-sm">Instruções do projeto<Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} className="w-full resize-y border border-input bg-background px-3 py-2" placeholder="Opcional; valem para as novas conversas" /></label>
            <fieldset className="space-y-2 rounded-lg border border-border/70 p-3"><legend className="px-1 text-sm font-medium">Permissões do workspace</legend><p className="text-xs leading-5 text-muted-foreground">As ações do Chief ficam bloqueadas até você habilitá-las aqui. A aprovação de cada proposta continua obrigatória.</p>{([['chiefCreateAgents','Chief pode propor novos agentes'],['chiefEditAgents','Chief pode propor alterações de agentes'],['chiefManageTeam','Chief pode propor mudanças na equipe'],['chiefCreateSessions','Chief pode propor novas sessões']] as const).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs"><Checkbox checked={workspacePermissions[key]} onCheckedChange={checked => setWorkspacePermissions(current => ({ ...current, [key]: checked === true }))} />{label}</label>)}{([['filesWrite','Alterações de arquivos'],['computerUse','Uso do navegador']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">{label}<Select value={workspacePermissions[key]} onValueChange={value => setWorkspacePermissions(current => ({ ...current, [key]: value as 'inherit' | 'deny' }))}><SelectTrigger aria-label={label} className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inherit">Herdar do agente</SelectItem><SelectItem value="deny">Bloquear</SelectItem></SelectContent></Select></label>)}</fieldset>
            {editing && <label className="block space-y-1.5 text-sm">Pasta do projeto<div className="flex gap-2"><Input readOnly value={directory} className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-xs" placeholder="Deixe em branco para um projeto livre" /><Button type="button" variant="outline" onClick={pickInto(setDirectory, directory)}><FolderOpen className="size-4" /> Escolher</Button></div></label>}
          </div></details>}
          {kind === 'conversation' && !contextWorkspace && !initial && <details className="rounded-lg border border-border/70 px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Pasta de trabalho (opcional)</summary><div className="mt-3"><div className="flex gap-2"><Input readOnly value={directory} className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-xs" placeholder="Pode ser definida depois" /><Button type="button" variant="outline" onClick={async () => { try { setDirectory(await onPickFolder() || directory) } catch (error) { setProblem(errorText(error)) } }}><FolderOpen className="size-4" /> Escolher</Button></div></div></details>}
        {kind === 'conversation' && problem && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}
      </div>}
      {/* No agente, o rodapé fica fora da rolagem: salvar/cancelar e o erro de validação continuam visíveis em qualquer seção. */}
      <footer className={kind === 'agent' ? 'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-background px-5 py-3' : 'flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-5 py-4'}>{cloning && <p role="status" className="mr-auto flex min-w-0 flex-1 basis-60 items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />Clonando repositório… pode levar alguns minutos.</p>}{kind !== 'conversation' && problem && <p role="alert" className="mr-auto min-w-0 flex-1 basis-60 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{problem}</p>}<Button variant="ghost" onClick={() => { if (cloning) void window.appAPI.cancelClone().catch(error => setProblem(errorText(error))); else if (!saving) onClose() }}>{cloning ? 'Cancelar clonagem' : 'Cancelar'}</Button><Button onClick={() => void submit()} disabled={saving || (kind === 'agent' && !name.trim()) || (kind === 'workspace' && !projectName) || (kind === 'conversation' && selectedAgents.length > 1 && !name.trim())}>{saving ? cloning ? 'Clonando…' : 'Salvando…' : editing ? 'Salvar alterações' : kind === 'agent' ? 'Criar agente' : kind === 'workspace' ? origin === 'github' ? 'Clonar e criar projeto' : origin === 'existing' ? 'Abrir projeto' : 'Criar projeto' : selectedAgents.length > 1 ? 'Criar grupo' : 'Criar conversa'}</Button></footer>
    </section>
  </div>
}
