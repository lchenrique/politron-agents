import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { Code2, Columns2, FileDiff, Files, Globe, MessageSquare, MoreHorizontal, PanelBottom, PanelLeft, PanelRight, PanelTop, Plus, RotateCcw, Terminal, UserRound, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Menu, type MenuEntry } from '@/components/dsh'
import type { Agent, Conversation, Message, Run } from '../../../../shared/v9'
import { ProjectExplorer } from './ProjectExplorer'
import { FilePreview, type FileDraft, type FileDraftChange } from './FilePreview'
import { DelegationOverview } from './DelegationOverview'
import { BooWorkPanel, type BooWorkPanelProps } from './BooWorkPanel'
import type { AgentAvatarState } from '../app/Avatar'
import { changeActive, changeRatio, developmentDockLayout, deserializeDockLayout, fileTab, getGroup, groupWithTab, groups, initialDockLayout, placeTab, pruneEmpty, removeGroup, splitGroup, toolTab, type DockEdge, type DockGroup, type DockLayoutState, type DockNode, type DockTab, type DockTool, type DockZone } from './dock-layout'

const TerminalPanel = lazy(() => import('@/components/ide/TerminalPanel'))
const PlatformBrowserPanel = lazy(() => import('./PlatformBrowserPanel').then(module => ({ default: module.PlatformBrowserPanel })))
export type { DockTool, DockZone } from './dock-layout'

export interface DockWorkspaceHandle {
  openTool: (kind: DockTool, zone?: DockZone) => void
  openFile: (workspaceId: string, path: string, zone?: DockZone) => void
  /** Ativa a aba onde ela já estiver; só abre uma nova quando não existe. */
  revealTool: (kind: DockTool) => void
  useDevelopmentLayout: () => void
}
const labels: Record<DockTool, string> = { chat: 'Chat', files: 'Arquivos', terminal: 'Terminal', web: 'Navegador', mascot: 'Mascote', diff: 'Alterações', agents: 'Agentes' }
const icons = { chat: MessageSquare, files: Files, terminal: Terminal, web: Globe, mascot: UserRound, diff: FileDiff, agents: Users, file: Code2 }
const toolKinds: DockTool[] = ['chat', 'files', 'terminal', 'web', 'mascot', 'diff', 'agents']
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
  const [open, setOpen] = useState(false)
  return <Menu open={open} onClose={() => setOpen(false)} align="end" portal autoFocus
    anchor={<Button size="icon" variant="ghost" className="size-7 rounded-full shrink-0" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
      onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(value => !value) } }} onClick={() => setOpen(value => !value)}><Plus className="size-4" /></Button>}
    items={toolKinds.map(kind => { const Icon = icons[kind]; return { id: kind, label: labels[kind], icon: <Icon /> } })}
    onSelect={kind => { setOpen(false); if (toolKinds.includes(kind as DockTool)) onOpen(kind as DockTool, groupId) }} />
}

const MASCOT_STATE_LABEL: Record<AgentAvatarState, string> = { idle: 'Ocioso', working: 'Trabalhando', waiting: 'Aguardando aprovação', speaking: 'Falando' }
type DropLocation = { groupId: string; edge: DockEdge | 'center' }
export const DockWorkspace = forwardRef<DockWorkspaceHandle, {
  children: ReactNode
  /**
   * Como a aba principal se apresenta: a mesma aba mostra conversa, Central, Rotinas ou projeto.
   * `leading` (avatar) e `trailing` (busca e ações) substituem o rótulo genérico quando há faixa de abas.
   */
  chatTab?: { label: string; title?: string; leading?: ReactNode; trailing?: ReactNode }
  /** Faixa da conversa, exibida somente quando o chat é a única aba e a faixa de abas está oculta. */
  chatHeader?: ReactNode
  workspaceId?: string | null
  conversationId?: string
  delegationMessages?: Message[]
  conversations?: Conversation[]
  runs?: Run[]
  onOpenRelatedConversation?: (conversationId: string) => void
  onSendMessage?: BooWorkPanelProps['onSendMessage']
  voiceAgentId?: string
  assistant?: Agent
  agents: Agent[]
  selectedAgents: Agent[]
  agentStates?: Record<string, AgentAvatarState>
  onChanged: (value: string) => void
  workspaceDiff: string
}>(function DockWorkspace({ children, chatTab, chatHeader, workspaceId, conversationId, delegationMessages = [], conversations = [], runs = [], onOpenRelatedConversation, onSendMessage, voiceAgentId, assistant, agents, selectedAgents, onChanged, workspaceDiff }, ref) {
  const [layout, setLayout] = useState<DockLayoutState>(loadLayout)
  const [openOrganizeMenuId, setOpenOrganizeMenuId] = useState<string | null>(null)
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
  const openInGroup = (kind: DockTool, groupId: string) => {
    setLayout(current => placeTab(current, toolTab(kind), groupId))
  }
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
    // Opening a file should activate an editor tab, not split and shrink the
    // workspace on every first file open. Explicit 'side' still targets the side.
    const destination = zone === 'side' ? toolGroup(current, 'side') || mainGroup(current) : mainGroup(current)
    return placeTab(current, tab, destination.id)
  })
  const revealTool = (kind: DockTool) => {
    const existing = groupWithTab(layout.root, kind)
    if (existing) setLayout(current => changeActive(current, existing.id, kind))
    else openTool(kind)
  }
  useImperativeHandle(ref, () => ({ openTool, openFile, revealTool, useDevelopmentLayout: () => setLayout(current => developmentDockLayout(current)) }))
  const closeTab = (id: string) => {
    const draft = drafts[id]
    if (draft && draft.content !== draft.baseline && !window.confirm('Descartar as alterações não salvas deste arquivo?')) return
    if (draft) changeDraft(id, () => undefined)
    const closingFile = groupWithTab(layout.root, id)?.tabs.find(tab => tab.id === id && tab.kind === 'file')
    if (closingFile?.workspaceId && closingFile.path) {
      // Wait until React has unmounted the view before releasing its cached model.
      requestAnimationFrame(() => {
        void import('./MonacoCodeEditor').then(({ disposePolitronFileModel }) => {
          disposePolitronFileModel(closingFile.workspaceId!, closingFile.path!)
        }).catch(() => undefined)
      })
    }
    if (id === 'terminal') void window.vibeAPI?.terminal?.close?.().catch(() => undefined)
    if (id === 'web') void window.platformBrowserAPI?.close().catch(() => undefined)
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
  const resetLayout = () => {
    if (groups(layout.root).some(group => group.tabs.some(tab => tab.id === 'terminal'))) void window.vibeAPI?.terminal?.close?.().catch(() => undefined)
    if (groups(layout.root).some(group => group.tabs.some(tab => tab.id === 'web'))) void window.platformBrowserAPI?.close().catch(() => undefined)
    setLayout(initialDockLayout())
  }
  const renderTab = (tab: DockTab): ReactNode => {
    switch (tab.kind) {
      case 'chat': return children
      case 'agents': return <DelegationOverview conversationId={conversationId} messages={delegationMessages} conversations={conversations} runs={runs} agents={agents} onOpenConversation={onOpenRelatedConversation} />
      case 'files': return <ProjectExplorer workspaceId={workspaceId} onOpenFile={(id, path) => openFile(id, path)} />
      case 'file': return tab.workspaceId && tab.path ? <FilePreview workspaceId={tab.workspaceId} path={tab.path} draft={drafts[tab.id]} onDraftChange={updater => changeDraft(tab.id, updater)} /> : null
      case 'terminal': return <Suspense fallback={null}><TerminalPanel workspaceId={workspaceId} conversationId={conversationId} showLogs={false} /></Suspense>
      case 'web': return <Suspense fallback={null}><PlatformBrowserPanel onNotice={onChanged} workspaceId={workspaceId} conversationId={conversationId} agents={selectedAgents} /></Suspense>
      case 'mascot': return <BooWorkPanel assistant={assistant} agents={agents} selectedAgents={selectedAgents} conversationId={conversationId} voiceAgentId={voiceAgentId} runs={runs} messages={delegationMessages} onSendMessage={onSendMessage} onOpenChat={() => revealTool('chat')} onOpenFile={workspaceId ? path => openFile(workspaceId, path) : undefined} />
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
  const tabLabel = (tab: DockTab) => tab.kind === 'chat' && chatTab ? chatTab.label : tab.label
  const pane = (group: DockGroup) => {
    const split = groups(layout.root).length > 1
    const primary = group.id === groups(layout.root)[0].id
    const isFocused = group.id === layout.activeGroup
    const hover = drop?.groupId === group.id ? drop.edge : null
    // Uma única aba de chat não precisa de faixa: os painéis abrem pela barra da janela e a faixa volta com a segunda aba.
    const soloChat = !split && group.tabs.length === 1 && group.tabs[0].kind === 'chat'
    return <section key={group.id} aria-label={primary ? 'Área de trabalho principal' : 'Painel auxiliar'} data-dock-group={group.id}
      onMouseDown={() => { if (!isFocused) setLayout(current => ({ ...current, activeGroup: group.id })) }}
      className={'relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background ' + (isFocused && split ? 'ring-1 ring-inset ring-primary/25' : '')}
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
      {!soloChat && <header data-testid="dock-group-header" className="flex h-9 shrink-0 items-stretch gap-1 border-b border-[var(--dsh-border-l3)] bg-[var(--dsh-bg-base)] pr-1.5">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {group.tabs.map(tab => {
            const Icon = icons[tab.kind]
            const label = tabLabel(tab)
            const active = group.active === tab.id
            // A aba do chat é a identidade da conversa: avatar, título e, quando ativa, busca e ações.
            const chat = tab.kind === 'chat' ? chatTab : undefined
            // Aba plana como a sidebar: ativa com sublinhado azul, inativa só com tinta secundária e hover sutil.
            return <div key={tab.id} data-testid={tab.kind === 'chat' ? 'chat-tab' : undefined} data-active={active || undefined} className={'group relative flex shrink-0 items-center gap-0.5 border-r border-[var(--dsh-border-l3)]/60 pr-1 ' + (chat?.trailing && active ? 'max-w-80 ' : 'max-w-48 ') + (chat?.leading ? 'pl-1 ' : '') + (active ? 'text-[var(--dsh-label-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--dsh-blue)]' : 'text-[var(--dsh-label-secondary)] hover:bg-[var(--dsh-hover)]')}>
              {chat?.leading}
              <Button type="button" variant="ghost" size={null} draggable aria-current={active ? 'true' : undefined} aria-label={'Aba ' + label} title={tab.path || chat?.title || label}
                onDragStart={event => { event.dataTransfer.setData('application/x-politron-tab', tab.id); event.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => setDrop(null)}
                onClick={() => setLayout(current => changeActive(current, group.id, tab.id))}
                className={'flex h-full min-w-0 items-center justify-start gap-1.5 rounded-none text-[12.5px] text-inherit hover:bg-transparent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--dsh-blue)] focus-visible:ring-0 ' + (chat?.leading ? 'pl-1 font-semibold' : 'pl-2.5 ' + (active ? 'font-medium' : 'font-normal'))}>
                {!chat?.leading && <Icon className="size-3.5 shrink-0" />}<span className="truncate">{label}</span>{drafts[tab.id] && drafts[tab.id].content !== drafts[tab.id].baseline && <span aria-label="Arquivo modificado" className="size-2 shrink-0 rounded-full bg-warning" />}
              </Button>
              {active && chat?.trailing}
              <Button variant="ghost" size="icon" className={'size-5 shrink-0 rounded-[5px] text-[var(--dsh-label-tertiary)] hover:bg-[var(--dsh-hover)] hover:text-[var(--dsh-label-primary)] focus-visible:opacity-100 ' + (active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} aria-label={'Fechar ' + label} title="Fechar aba" onClick={() => closeTab(tab.id)}><X className="size-3" /></Button>
            </div>
          })}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-border/50 pl-1">
          <DockAddMenu groupId={group.id} onOpen={openInGroup} />
          <Menu open={openOrganizeMenuId === group.id} onClose={() => setOpenOrganizeMenuId(null)} align="end" portal autoFocus
            anchor={<Button variant="ghost" size="icon" className="size-7 rounded-full shrink-0" aria-label={'Organizar ' + (primary ? 'área principal' : 'painel auxiliar')}
              aria-haspopup="menu" aria-expanded={openOrganizeMenuId === group.id}
              onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpenOrganizeMenuId(current => current === group.id ? null : group.id) } }}
              onClick={() => setOpenOrganizeMenuId(current => current === group.id ? null : group.id)}><MoreHorizontal className="size-4" /></Button>}
            items={(() => {
              const allGroups = groups(layout.root)
              const targets = group.active && allGroups.length > 1 ? allGroups.filter(item => item.id !== group.id) : []
              const entries: MenuEntry[] = [
                ...targets.map(item => ({ id: `move:${item.id}`, label: `Mover aba para ${item.tabs.map(tabLabel).join(', ') || 'painel vazio'}`, icon: <Columns2 /> })),
                ...(targets.length ? [{ type: 'separator' as const, id: 'move-separator' }] : []),
                ...positions.map(position => { const Icon = position.icon; return { id: `split:${position.value}`, label: `${position.label} com aba atual`, icon: <Icon />, disabled: allGroups.length >= 8 } }),
                { type: 'separator', id: 'empty-separator' },
                ...positions.map(position => { const Icon = position.icon; return { id: `empty:${position.value}`, label: `Novo painel ${position.value === 'left' ? 'à esquerda' : position.value === 'right' ? 'à direita' : position.value === 'top' ? 'acima' : 'abaixo'}`, icon: <Icon />, disabled: allGroups.length >= 8 } }),
                ...(allGroups.length > 1 ? [{ type: 'separator' as const, id: 'close-separator' }, { id: 'close-panel', label: 'Fechar painel vazio', disabled: group.tabs.length > 0 }] : []),
                { type: 'separator', id: 'restore-separator' },
                { id: 'reset-layout', label: 'Restaurar layout inicial', icon: <RotateCcw /> },
              ]
              return entries
            })()}
            onSelect={id => {
              setOpenOrganizeMenuId(null)
              if (id.startsWith('move:') && group.active) moveTab(group.active, id.slice('move:'.length))
              else if (id.startsWith('split:')) splitEmpty(group.id, id.slice('split:'.length) as DockEdge, group.active)
              else if (id.startsWith('empty:')) splitEmpty(group.id, id.slice('empty:'.length) as DockEdge)
              else if (id === 'close-panel') setLayout(current => removeGroup(current, group.id))
              else if (id === 'reset-layout') resetLayout()
            }} />
        </div>
      </header>}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {group.tabs.length ? group.tabs.map(tab => <div key={tab.id} className={group.active === tab.id ? 'flex h-full min-h-0 min-w-0 flex-col' : 'hidden'}>{tab.kind === 'chat' && soloChat && chatHeader}{tab.kind === 'file' && group.active !== tab.id ? null : renderTab(tab)}</div>)
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
