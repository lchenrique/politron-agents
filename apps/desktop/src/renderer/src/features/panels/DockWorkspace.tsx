import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { Code2, Columns2, FileDiff, Files, Globe, MessageSquare, MoreHorizontal, PanelBottom, PanelLeft, PanelRight, PanelTop, Plus, RotateCcw, Settings2, Terminal, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import TerminalPanel from '@/components/ide/TerminalPanel'
import type { Agent, BrowserFrame } from '../../../../shared/v9'
import { ProjectExplorer } from './ProjectExplorer'
import { FilePreview, type FileDraft, type FileDraftChange } from './FilePreview'
import { BrowserPanel } from './BrowserPanel'
import { PoliAvatar } from '../app/PoliAvatar'
import { MascotStatusBubble } from '../app/MascotStatusBubble'
import { RealtimeCall } from '../realtime/RealtimeCall'
import { useVoicePreferences } from '../realtime/preferences'
import type { RealtimeMode, RealtimePhase } from '../../../../shared/realtime'
import type { AgentAvatarState } from '../app/Avatar'
import { changeActive, changeRatio, developmentDockLayout, deserializeDockLayout, fileTab, getGroup, groupWithTab, groups, initialDockLayout, placeTab, pruneEmpty, removeGroup, splitGroup, toolTab, type DockEdge, type DockGroup, type DockLayoutState, type DockNode, type DockTab, type DockTool, type DockZone } from './dock-layout'
export type { DockTool, DockZone } from './dock-layout'

export interface DockWorkspaceHandle {
  openTool: (kind: DockTool, zone?: DockZone) => void
  openFile: (workspaceId: string, path: string, zone?: DockZone) => void
  useDevelopmentLayout: () => void
}
const labels: Record<DockTool, string> = { chat: 'Chat', files: 'Arquivos', terminal: 'Terminal', browser: 'Navegador', mascot: 'Mascote', diff: 'Alterações' }
const icons = { chat: MessageSquare, files: Files, terminal: Terminal, browser: Globe, mascot: UserRound, diff: FileDiff, file: Code2 }
const toolKinds: DockTool[] = ['chat', 'files', 'terminal', 'browser', 'mascot', 'diff']
const positions = [
  { value: 'left', label: 'Dividir à esquerda', icon: PanelLeft },
  { value: 'right', label: 'Dividir à direita', icon: PanelRight },
  { value: 'top', label: 'Dividir acima', icon: PanelTop },
  { value: 'bottom', label: 'Dividir abaixo', icon: PanelBottom },
] as const
const STORAGE_KEY = 'politron.dock.layout.v2'
const LEGACY_KEY = 'politron.dock.layout.v1'
function loadLayout(): DockLayoutState {
  try {
    const value = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
    return value ? deserializeDockLayout(JSON.parse(value)) : initialDockLayout()
  } catch { return initialDockLayout() }
}

function DockAddMenu({ groupId, onOpen, label = 'Nova aba' }: { groupId: string; onOpen: (kind: DockTool, groupId: string) => void; label?: string }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={label} title={label}><Plus className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {toolKinds.map(kind => { const Icon = icons[kind]; return <DropdownMenuItem key={kind} onSelect={() => onOpen(kind, groupId)}><Icon className="mr-2 size-4" />{labels[kind]}</DropdownMenuItem> })}
    </DropdownMenuContent>
  </DropdownMenu>
}

const MASCOT_STATE_LABEL: Record<AgentAvatarState, string> = { idle: 'Ocioso', working: 'Trabalhando', waiting: 'Aguardando aprovação', speaking: 'Falando' }
const CALL_STATUS_LABEL: Partial<Record<RealtimePhase, string>> = { connecting: 'Conectando…', listening: 'Ouvindo', hearing: 'Estou ouvindo você', transcribing: 'Entendendo…', thinking: 'Pensando…', speaking: 'Falando', error: 'Falha na ligação' }

function MascotView({ assistant, agents, selectedAgents, agentStates, conversationId, voiceAgentId }: { assistant?: Agent; agents: Agent[]; selectedAgents: Agent[]; agentStates: Record<string, AgentAvatarState>; conversationId?: string; voiceAgentId?: string }) {
  const [agentId, setAgentId] = useState(voiceAgentId || selectedAgents[0]?.id || '')
  const { mode, headphones, refreshToken } = useVoicePreferences()
  const [callPhase, setCallPhase] = useState<RealtimePhase>('idle')
  const [callError, setCallError] = useState('')
  const handleCallPhase = useCallback((phase: RealtimePhase) => { setCallPhase(phase); if (phase === 'connecting') setCallError('') }, [])
  useEffect(() => { setAgentId(voiceAgentId || selectedAgents[0]?.id || '') }, [conversationId, voiceAgentId, selectedAgents])
  const choices = (conversationId ? [...(assistant ? [assistant] : []), ...selectedAgents] : [...(assistant ? [assistant] : []), ...agents]).filter((agent, index, list) => list.findIndex(item => item.id === agent.id) === index)
  const visible = choices.find(agent => agent.id === agentId) || choices[0]
  const state: AgentAvatarState = callPhase === 'speaking' && visible?.id === agentId ? 'speaking' : visible ? agentStates[visible.id] || 'idle' : 'idle'
  return <section aria-label="Visualização do mascote" className="flex h-full min-h-0 flex-col items-center gap-3 overflow-auto bg-card/20 p-4">
    <div className="flex w-full max-w-xs gap-1.5">{choices.length > 0 && <Select value={visible?.id || ''} onValueChange={setAgentId}>
      <SelectTrigger aria-label="Selecionar mascote" className="flex-1" disabled={callPhase !== 'idle'}><SelectValue placeholder="Escolha um Boo" /></SelectTrigger>
      <SelectContent>{choices.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
    </Select>}
      <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label="Configurar voz" title="Abrir configurações de voz do app" onClick={() => window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'voz' }))}><Settings2 className="size-4" /></Button>
    </div>
    <div className="flex min-h-60 flex-1 flex-col items-center justify-center gap-3 text-center">{visible ? <>
      <MascotStatusBubble text={callError || (callPhase !== 'idle' ? CALL_STATUS_LABEL[callPhase] : MASCOT_STATE_LABEL[state])} />
      {visible.avatar ? <img src={visible.avatar} alt={'Avatar de ' + visible.name} data-speaking={state === 'speaking'} className="mascot-custom-avatar size-52 max-w-full rounded-full object-cover" /> : <PoliAvatar agent={visible} size={215} state={state} motionPolicy="auto" />}
      <div><h2 className="text-base font-semibold">{visible.name}</h2><p className="mt-1 max-w-xs text-xs text-muted-foreground">{visible.description || '@' + visible.alias}</p></div>
    </> : <p className="text-sm text-muted-foreground">Crie um Boo para exibi-lo aqui.</p>}</div>
    <RealtimeCall conversationId={conversationId} agentId={visible?.id} agentName={visible?.name || 'Assistente'} mode={mode} headphones={headphones} refreshToken={refreshToken} onPhaseChange={handleCallPhase} onErrorChange={setCallError} />
  </section>
}

type DropLocation = { groupId: string; edge: DockEdge | 'center' }
export const DockWorkspace = forwardRef<DockWorkspaceHandle, {
  children: ReactNode
  workspaceId?: string | null
  conversationId?: string
  voiceAgentId?: string
  assistant?: Agent
  agents: Agent[]
  selectedAgents: Agent[]
  agentStates?: Record<string, AgentAvatarState>
  browserFrames: BrowserFrame[]
  onRefreshBrowser: () => void
  onChanged: (value: string) => void
  workspaceDiff: string
}>(function DockWorkspace({ children, workspaceId, conversationId, voiceAgentId, assistant, agents, selectedAgents, agentStates = {}, browserFrames, onRefreshBrowser, onChanged, workspaceDiff }, ref) {
  const [layout, setLayout] = useState<DockLayoutState>(loadLayout)
  const [drafts, setDrafts] = useState<Record<string, FileDraft>>({})
  const changeDraft = useCallback((id: string, updater: Parameters<FileDraftChange>[0]) => setDrafts(current => {
    const next = updater(current[id])
    if (!next) { const copy = { ...current }; delete copy[id]; return copy }
    return { ...current, [id]: next }
  }), [])
  useEffect(() => {
    if (!Object.values(drafts).some(item => item.content !== item.baseline)) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [drafts])
  const [drop, setDrop] = useState<DropLocation | null>(null)
  const splitGroups = useRef<Record<string, { setLayout: (layout: Record<string, number>) => void } | null>>({})
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)) } catch { /* manter em memória */ } }, [layout])
  useEffect(() => {
    const sync = (node: DockNode) => {
      if (node.type === 'group') return
      splitGroups.current[node.id]?.setLayout({ first: node.ratio, second: 100 - node.ratio })
      sync(node.first)
      sync(node.second)
    }
    sync(layout.root)
  }, [layout])
  const mainGroup = (state: DockLayoutState) => groupWithTab(state.root, 'chat') || groups(state.root)[0]
  const toolGroup = (state: DockLayoutState, zone: DockZone) => {
    if (zone === 'main') return mainGroup(state)
    return groups(state.root).find(group => group.id !== mainGroup(state).id && group.tabs.some(tab => tab.kind === 'files')) || groups(state.root).find(group => group.id !== mainGroup(state).id && group.tabs.length > 0) || groups(state.root).find(group => group.id !== mainGroup(state).id)
  }
  const openInGroup = (kind: DockTool, groupId: string) => setLayout(current => placeTab(current, toolTab(kind), groupId))
  const openTool = (kind: DockTool, zone: DockZone = 'side') => setLayout(current => {
    const destination = toolGroup(current, zone)
    if (destination) return placeTab(current, toolTab(kind), destination.id)
    return splitGroup(current, mainGroup(current).id, 'right', toolTab(kind))
  })
  const openFile = (id: string, path: string, zone: DockZone = 'main') => setLayout(current => {
    const tab = fileTab(id, path)
    const existing = groupWithTab(current.root, tab.id)
    if (existing) return placeTab(current, tab, existing.id)
    const editor = groups(current.root).find(group => group.tabs.some(item => item.kind === 'file')) || groups(current.root).find(group => !group.tabs.length)
    if (editor) return placeTab(current, tab, editor.id)
    const main = toolGroup(current, zone) || mainGroup(current)
    return groups(current.root).length < 8 ? splitGroup(current, main.id, 'right', tab) : placeTab(current, tab, main.id)
  })
  useImperativeHandle(ref, () => ({ openTool, openFile, useDevelopmentLayout: () => setLayout(current => developmentDockLayout(current)) }))
  const closeTab = (id: string) => {
    const draft = drafts[id]
    if (draft && draft.content !== draft.baseline && !window.confirm('Descartar as alterações não salvas deste arquivo?')) return
    if (draft) changeDraft(id, () => undefined)
    if (id === 'terminal') void window.vibeAPI?.terminal?.close?.().catch(() => undefined)
    setLayout(current => {
      const source = groupWithTab(current.root, id)
      if (!source) return current
      return pruneEmpty({ ...current, root: removeTabFromTree(current.root, source.id, id) })
    })
  }
  function removeTabFromTree(node: DockNode, groupId: string, tabId: string): DockNode {
    if (node.type === 'group') {
      if (node.id !== groupId) return node
      const tabs = node.tabs.filter(tab => tab.id !== tabId)
      return { ...node, tabs, active: node.active === tabId ? tabs.at(-1)?.id || '' : node.active }
    }
    return { ...node, first: removeTabFromTree(node.first, groupId, tabId), second: removeTabFromTree(node.second, groupId, tabId) }
  }
  const moveTab = (tabId: string, destinationId: string, edge: DockEdge | 'center' = 'center') => setLayout(current => {
    const source = groupWithTab(current.root, tabId)
    const target = getGroup(current.root, destinationId)
    if (!source || !target) return current
    const tab = source.tabs.find(item => item.id === tabId)!
    if (edge === 'center') return pruneEmpty(placeTab(current, tab, destinationId))
    if (groups(current.root).length >= 8) return pruneEmpty(placeTab(current, tab, destinationId))
    return pruneEmpty(splitGroup(current, destinationId, edge, tab))
  })
  const splitEmpty = (groupId: string, edge: DockEdge, activeTabId?: string) => setLayout(current => {
    const group = getGroup(current.root, groupId)
    if (!group) return current
    const tab = activeTabId ? group.tabs.find(item => item.id === activeTabId) : undefined
    return splitGroup(current, groupId, edge, tab)
  })
  const resetLayout = () => { if (groups(layout.root).some(group => group.tabs.some(tab => tab.id === 'terminal'))) void window.vibeAPI.terminal.close().catch(() => undefined); setLayout(initialDockLayout()) }
  const renderTab = (tab: DockTab): ReactNode => {
    switch (tab.kind) {
      case 'chat': return children
      case 'files': return <ProjectExplorer workspaceId={workspaceId} onOpenFile={(id, path) => openFile(id, path)} />
      case 'file': return tab.workspaceId && tab.path ? <FilePreview workspaceId={tab.workspaceId} path={tab.path} draft={drafts[tab.id]} onDraftChange={updater => changeDraft(tab.id, updater)} /> : null
      case 'terminal': return <TerminalPanel workspaceId={workspaceId} showLogs={false} />
      case 'browser': return <BrowserPanel frames={browserFrames} agents={agents} onRefresh={onRefreshBrowser} onChanged={onChanged} />
      case 'mascot': return <MascotView assistant={assistant} agents={agents} selectedAgents={selectedAgents} agentStates={agentStates} conversationId={conversationId} voiceAgentId={voiceAgentId} />
      case 'diff': return <div className="h-full overflow-auto p-4"><h2 className="mb-3 text-xs font-semibold text-muted-foreground">Alterações versus HEAD</h2><pre className="min-w-max whitespace-pre font-mono text-[11px] leading-5">{workspaceDiff || 'Nenhuma alteração rastreada.'}</pre></div>
    }
  }
  const computeEdge = (element: HTMLElement, x: number, y: number): DockEdge | 'center' => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) return 'center'
    const left = (x - rect.left) / rect.width, top = (y - rect.top) / rect.height
    const scores: Array<[DockEdge, number]> = [['left', left], ['right', 1 - left], ['top', top], ['bottom', 1 - top]]
    const closest = scores.sort((a, b) => a[1] - b[1])[0]
    return closest[1] < 0.24 ? closest[0] : 'center'
  }
  const pane = (group: DockGroup) => {
    const primary = group.id === groups(layout.root)[0].id
    const isFocused = group.id === layout.activeGroup
    const hover = drop?.groupId === group.id ? drop.edge : null
    return <section key={group.id} aria-label={primary ? 'Área de trabalho principal' : 'Painel auxiliar'} data-dock-group={group.id}
      onMouseDown={() => { if (!isFocused) setLayout(current => ({ ...current, activeGroup: group.id })) }}
      className={'relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background ' + (isFocused ? 'ring-1 ring-inset ring-border/60' : '')}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('application/x-politron-tab')) return
        event.preventDefault()
        const edge = computeEdge(event.currentTarget, event.clientX, event.clientY)
        setDrop(current => current?.groupId === group.id && current.edge === edge ? current : { groupId: group.id, edge })
      }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null) }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
        setDrop(null)
        const data = event.dataTransfer.getData('application/x-politron-tab')
        if (data) moveTab(data, group.id, computeEdge(event.currentTarget, event.clientX, event.clientY))
      }}>
      {hover && <div aria-hidden="true" className={'pointer-events-none absolute z-30 bg-primary/15 ring-2 ring-inset ring-primary/50 ' + (
        hover === 'left' ? 'inset-y-0 left-0 w-1/3' : hover === 'right' ? 'inset-y-0 right-0 w-1/3' :
          hover === 'top' ? 'inset-x-0 top-0 h-1/3' : hover === 'bottom' ? 'inset-x-0 bottom-0 h-1/3' : 'inset-0'
      )} />}
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-card/45 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {group.tabs.map(tab => {
            const Icon = icons[tab.kind]
            return <div key={tab.id} className={'group flex h-8 max-w-44 shrink-0 items-center gap-0.5 rounded-md pr-0.5 ' + (group.active === tab.id ? 'border border-border/70 bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/50')}>
              <button type="button" draggable aria-label={'Aba ' + tab.label} title={tab.path || tab.label}
                onDragStart={event => { event.dataTransfer.setData('application/x-politron-tab', tab.id); event.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => setDrop(null)}
                onClick={() => setLayout(current => changeActive(current, group.id, tab.id))}
                className="flex h-7 min-w-0 items-center gap-1.5 pl-2 text-[11px] font-medium">
                <Icon className="size-3.5 shrink-0" /><span className="truncate">{tab.label}</span>{drafts[tab.id] && drafts[tab.id].content !== drafts[tab.id].baseline && <span aria-label="Arquivo modificado" className="size-2 shrink-0 rounded-full bg-amber-500" />}
              </button>
              <Button variant="ghost" size="icon" className="size-5 shrink-0 opacity-65 hover:opacity-100" aria-label={'Fechar ' + tab.label} title="Fechar aba" onClick={() => closeTab(tab.id)}><X className="size-3" /></Button>
            </div>
          })}
        </div>
        <DockAddMenu groupId={group.id} onOpen={openInGroup} />
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={'Organizar ' + (primary ? 'área principal' : 'painel auxiliar')}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {group.active && groups(layout.root).length > 1 && groups(layout.root).filter(item => item.id !== group.id).map(item =>
              <DropdownMenuItem key={item.id} onSelect={() => moveTab(group.active, item.id)}><Columns2 className="mr-2 size-4" />Mover aba para {item.tabs.map(tab => tab.label).join(', ') || 'painel vazio'}</DropdownMenuItem>)}
            {group.active && <DropdownMenuSeparator />}
            {positions.map(position => { const Icon = position.icon; return <DropdownMenuItem key={position.value} disabled={groups(layout.root).length >= 8} onSelect={() => splitEmpty(group.id, position.value, group.active)}><Icon className="mr-2 size-4" />{position.label} com aba atual</DropdownMenuItem> })}
            <DropdownMenuSeparator />
            {positions.map(position => { const Icon = position.icon; return <DropdownMenuItem key={'empty-' + position.value} disabled={groups(layout.root).length >= 8} onSelect={() => splitEmpty(group.id, position.value)}><Icon className="mr-2 size-4" />Novo painel {position.value === 'left' ? 'à esquerda' : position.value === 'right' ? 'à direita' : position.value === 'top' ? 'acima' : 'abaixo'}</DropdownMenuItem> })}
            {groups(layout.root).length > 1 && <><DropdownMenuSeparator /><DropdownMenuItem disabled={group.tabs.length > 0} onSelect={() => setLayout(current => removeGroup(current, group.id))}>Fechar painel vazio</DropdownMenuItem></>}
            <DropdownMenuSeparator /><DropdownMenuItem onSelect={resetLayout}><RotateCcw className="mr-2 size-4" />Restaurar layout inicial</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {group.tabs.length ? group.tabs.map(tab => <div key={tab.id} className={group.active === tab.id ? 'flex h-full min-h-0 min-w-0 flex-col' : 'hidden'}>{renderTab(tab)}</div>)
          : <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"><Code2 className="size-8 text-muted-foreground/50" /><p className="text-xs text-muted-foreground">Escolha o conteúdo deste painel.</p><DockAddMenu groupId={group.id} onOpen={openInGroup} label="Escolher conteúdo da nova aba" /></div>}
      </div>
    </section>
  }
  const tree = (node: DockNode): ReactNode => {
    if (node.type === 'group') return pane(node)
    const horizontal = node.axis === 'horizontal'
    return <ResizablePanelGroup key={node.id} id={node.id} orientation={horizontal ? 'horizontal' : 'vertical'}
      defaultLayout={{ first: node.ratio, second: 100 - node.ratio }} resizePreviewMode="separator"
      groupRef={ref => { splitGroups.current[node.id] = ref }}
      onLayoutChanged={(sizes, meta) => {
        const ratio = sizes.first
        if (meta.isUserInteraction && typeof ratio === 'number') setLayout(current => changeRatio(current, node.id, ratio))
      }}
      className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <ResizablePanel id="first" defaultSize={`${node.ratio}%`} minSize="18%" maxSize="82%" className="min-h-0 min-w-0 overflow-hidden">{tree(node.first)}</ResizablePanel>
      <ResizableHandle withHandle aria-label="Redimensionar painéis" title="Arraste para redimensionar" />
      <ResizablePanel id="second" defaultSize={`${100 - node.ratio}%`} minSize="18%" maxSize="82%" className="min-h-0 min-w-0 overflow-hidden">{tree(node.second)}</ResizablePanel>
    </ResizablePanelGroup>
  }
  return <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">{tree(layout.root)}</div>
})
