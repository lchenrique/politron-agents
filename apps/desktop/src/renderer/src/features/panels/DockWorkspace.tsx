import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import {
  Code2, Columns2, Database, FileDiff, Files, Globe, MessageSquare, MoreHorizontal, PanelBottom, PanelBottomOpen,
  PanelLeft, PanelLeftOpen, PanelRight, PanelRightOpen, PanelTop, PanelTopOpen, Plus, RotateCcw, Sparkles,
  Terminal, Trash2, UserRound, Users, X,
} from 'lucide-react'
import type { Agent, Conversation, FileChange, Message, Run } from '../../../../shared/v9'
import { ProjectExplorer } from './ProjectExplorer'
import { FilePreview, type FileDraft, type FileDraftChange } from './FilePreview'
import { DelegationOverview } from './DelegationOverview'
import { BooWorkPanel, type BooWorkPanelProps } from './BooWorkPanel'
import type { AgentAvatarState } from '../app/Avatar'
import {
  changeActive, changeRatio, deserializeDockLayout, fileTab, getGroup, groupWithTab, groups, initialDockLayout,
  placeTab, presetLayout, pruneEmpty, removeGroup, splitGroup, toolTab,
  type DockEdge, type DockGroup, type DockLayoutState, type DockNode, type DockTab, type DockTool, type DockZone, type LayoutPreset,
} from './dock-layout'
import { FloatingMenu, FloatingMenuItem } from '@/shell/floating-menu'
import { LauncherTab } from '@/shell/tabs/launcher'
import { FilesDiffTab } from '@/shell/tabs/files-diff'
import { MemoryTab } from '@/shell/tabs/memory'
import { SquadTab } from '@/shell/tabs/squad'

const TerminalPanel = lazy(() => import('@/components/ide/TerminalPanel'))
const PlatformBrowserPanel = lazy(() => import('./PlatformBrowserPanel').then(module => ({ default: module.PlatformBrowserPanel })))
export type { DockTool, DockZone, LayoutPreset } from './dock-layout'

export interface DockWorkspaceHandle {
  openTool: (kind: DockTool, zone?: DockZone) => void
  openFile: (workspaceId: string, path: string, zone?: DockZone) => void
  /** Ativa a aba onde ela já estiver; só abre uma nova quando não existe. */
  revealTool: (kind: DockTool) => void
  useDevelopmentLayout: () => void
  applyPreset: (preset: LayoutPreset) => void
  resetLayout: () => void
}

/** Ícone de cada aba, como no registro de abas do HTML. */
const icons: Record<DockTool, typeof MessageSquare> = {
  chat: Sparkles,
  files: Files,
  terminal: Terminal,
  web: Globe,
  mascot: UserRound,
  diff: FileDiff,
  agents: Users,
  squad: Users,
  memory: Database,
  launcher: Plus,
}

const STORAGE_KEY = 'politron.dock.layout.v3'
const LEGACY_KEYS = ['politron.dock.layout.v2', 'politron.dock.layout.v1']

function loadLayout(): DockLayoutState {
  try {
    const value = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean)
    return value ? deserializeDockLayout(JSON.parse(value)) : initialDockLayout()
  } catch { return initialDockLayout() }
}

const MASCOT_STATE_LABEL: Record<AgentAvatarState, string> = { idle: 'Ocioso', working: 'Trabalhando', waiting: 'Aguardando aprovação', speaking: 'Falando' }
type DropLocation = { groupId: string; edge: DockEdge | 'center' }

const DROP_LABEL: Record<DockEdge | 'center', string> = {
  left: 'Dividir à esquerda',
  right: 'Dividir à direita',
  top: 'Dividir acima',
  bottom: 'Dividir abaixo',
  center: 'Agrupar aba aqui',
}
const DROP_STYLE: Record<DockEdge | 'center', string> = {
  left: 'top-2 bottom-2 left-2 w-[46%]',
  right: 'top-2 right-2 bottom-2 w-[46%]',
  top: 'top-2 right-2 left-2 h-[46%]',
  bottom: 'right-2 bottom-2 left-2 h-[46%]',
  center: 'inset-2',
}

export const DockWorkspace = forwardRef<DockWorkspaceHandle, {
  children: ReactNode
  chatTab?: { label: string; title?: string; leading?: ReactNode; trailing?: ReactNode }
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
  fileChanges?: FileChange[]
  onEditAgent?: (agentId: string) => void
  onStartAgentConversation?: (agentId: string) => void
  onOpenSettings?: (section?: string) => void
}>(function DockWorkspace(props, ref) {
  const { children, chatHeader, fileChanges = [], workspaceId, conversationId, delegationMessages = [], conversations = [], runs = [], onOpenRelatedConversation, onSendMessage, voiceAgentId, assistant, agents, selectedAgents, agentStates, onChanged, workspaceDiff, onEditAgent, onStartAgentConversation, onOpenSettings } = props
  const [layout, setLayout] = useState<DockLayoutState>(loadLayout)
  const [drafts, setDrafts] = useState<Record<string, FileDraft>>({})
  const [drop, setDrop] = useState<DropLocation | null>(null)
  const [paneMenu, setPaneMenu] = useState<{ groupId: string; anchor: HTMLElement } | null>(null)
  const draggedTab = useRef<{ groupId: string; tabId: string } | null>(null)

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

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)) } catch { /* manter em memória */ } }, [layout])

  const mainGroup = (state: DockLayoutState) => groupWithTab(state.root, 'chat') || groups(state.root)[0]
  const sideGroup = (state: DockLayoutState) => groups(state.root).find(group => group.id !== mainGroup(state).id && group.tabs.some(tab => tab.kind === 'files'))
    || groups(state.root).find(group => group.id !== mainGroup(state).id)
  const toolGroup = (state: DockLayoutState, zone: DockZone) => zone === 'main' ? mainGroup(state) : sideGroup(state)

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
    const destination = zone === 'side' ? toolGroup(current, 'side') || mainGroup(current) : mainGroup(current)
    return placeTab(current, tab, destination.id)
  })

  const revealTool = (kind: DockTool) => {
    const existing = groupWithTab(layout.root, kind)
    if (existing) setLayout(current => changeActive(current, existing.id, kind))
    else openTool(kind)
  }

  const resetLayout = useCallback(() => {
    if (groups(layout.root).some(group => group.tabs.some(tab => tab.id === 'terminal'))) void window.vibeAPI?.terminal?.close?.().catch(() => undefined)
    if (groups(layout.root).some(group => group.tabs.some(tab => tab.id === 'web'))) void window.platformBrowserAPI?.close?.().catch(() => undefined)
    setLayout(initialDockLayout())
  }, [layout.root])

  const applyPreset = useCallback((preset: LayoutPreset) => {
    setLayout(current => {
      const next = presetLayout(preset, current)
      if (preset !== 'focus-chat' && groups(next.root).some(group => group.tabs.some(tab => tab.id === 'terminal'))) {
        // O terminal continua montado; nada a liberar.
      }
      return next
    })
  }, [])

  useImperativeHandle(ref, () => ({
    openTool,
    openFile,
    revealTool,
    useDevelopmentLayout: () => setLayout(current => presetLayout('ide-split', current)),
    applyPreset,
    resetLayout,
  }))

  const closeTab = (groupId: string, tabId: string) => {
    const draft = drafts[tabId]
    if (draft && draft.content !== draft.baseline && !window.confirm('Descartar as alterações não salvas deste arquivo?')) return
    if (draft) changeDraft(tabId, () => undefined)
    const closingFile = groupWithTab(layout.root, tabId)?.tabs.find(tab => tab.id === tabId && tab.kind === 'file')
    if (closingFile?.workspaceId && closingFile.path) {
      requestAnimationFrame(() => {
        void import('./MonacoCodeEditor').then(({ disposePolitronFileModel }) => {
          disposePolitronFileModel(closingFile.workspaceId!, closingFile.path!)
        }).catch(() => undefined)
      })
    }
    if (tabId === 'terminal') void window.vibeAPI?.terminal?.close?.().catch(() => undefined)
    if (tabId === 'web') void window.platformBrowserAPI?.close?.().catch(() => undefined)
    setLayout(current => {
      const source = getGroup(current.root, groupId)
      if (!source) return current
      const tabs = source.tabs.filter(tab => tab.id !== tabId)
      if (!tabs.length && groups(current.root).length === 1) {
        // O último painel nunca fica vazio: volta para o lançador de abas.
        return placeTab({ ...current, root: updateGroupTabs(current.root, groupId, [], '') }, toolTab('launcher'), groupId)
      }
      return pruneEmpty({ ...current, root: updateGroupTabs(current.root, groupId, tabs, source.active === tabId ? tabs.at(-1)?.id || '' : source.active) })
    })
  }

  function updateGroupTabs(node: DockNode, groupId: string, tabs: DockTab[], active: string): DockNode {
    if (node.type === 'group') return node.id === groupId ? { ...node, tabs, active } : node
    return { ...node, first: updateGroupTabs(node.first, groupId, tabs, active), second: updateGroupTabs(node.second, groupId, tabs, active) }
  }

  const moveTab = (tabId: string, destinationId: string, edge: DockEdge | 'center' = 'center') => setLayout(current => {
    const source = groupWithTab(current.root, tabId)
    const target = getGroup(current.root, destinationId)
    if (!source || !target) return current
    const tab = source.tabs.find(item => item.id === tabId)
    if (!tab) return current
    if (edge === 'center') {
      if (source.id === destinationId) return current
      // Sair da origem: se ela ficar vazia e houver outros painéis, ela some.
      const removed = updateGroupTabs(current.root, source.id, source.tabs.filter(item => item.id !== tabId), source.active === tabId ? source.tabs.find(item => item.id !== tabId)?.id || '' : source.active)
      return pruneEmpty(placeTab({ root: removed, activeGroup: destinationId }, tab, destinationId))
    }
    if (groups(current.root).length >= 8) return pruneEmpty(placeTab(current, tab, destinationId))
    const removed = updateGroupTabs(current.root, source.id, source.tabs.filter(item => item.id !== tabId), source.active === tabId ? source.tabs.find(item => item.id !== tabId)?.id || '' : source.active)
    return pruneEmpty(splitGroup({ root: removed, activeGroup: current.activeGroup }, destinationId, edge, tab))
  })

  const splitWithCurrent = (groupId: string, edge: DockEdge) => setLayout(current => {
    const group = getGroup(current.root, groupId)
    if (!group) return current
    const tabId = group.active || group.tabs[0]?.id
    const tab = group.tabs.find(item => item.id === tabId)
    if (!tab) return current
    const remaining = group.tabs.filter(item => item.id !== tab.id)
    const base = remaining.length
      ? { ...current, root: updateGroupTabs(current.root, groupId, remaining, remaining[0].id) }
      : current
    return splitGroup(base, groupId, edge, tab)
  })

  const splitNewPane = (groupId: string, edge: DockEdge) => setLayout(current => splitGroup(current, groupId, edge, toolTab('launcher')))

  const renderTab = (tab: DockTab): ReactNode => {
    switch (tab.kind) {
      case 'chat': return <>{chatHeader}{children}</>
      case 'agents': return <DelegationOverview conversationId={conversationId} messages={delegationMessages} conversations={conversations} runs={runs} agents={agents} onOpenConversation={onOpenRelatedConversation} />
      case 'files': return <FilesDiffTab workspaceId={workspaceId} changes={fileChanges} onOpenFile={(id, path) => openFile(id, path)} />
      case 'file': return tab.workspaceId && tab.path ? <FilePreview workspaceId={tab.workspaceId} path={tab.path} draft={drafts[tab.id]} onDraftChange={updater => changeDraft(tab.id, updater)} /> : null
      case 'terminal': return <div className="flex h-full min-h-0 flex-col">
        {/* Barra do terminal do design: estado e pasta; o xterm real fica logo abaixo. */}
        <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 font-mono text-[11px] text-[var(--text-muted)]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-[var(--accent-primary)]" />
            <span className="truncate">zsh · {workspaceId || 'sem pasta'} · sessão local</span>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={null}><TerminalPanel workspaceId={workspaceId} conversationId={conversationId} showLogs={false} /></Suspense></div>
      </div>
      case 'web': return <Suspense fallback={null}><PlatformBrowserPanel onNotice={onChanged} workspaceId={workspaceId} conversationId={conversationId} agents={selectedAgents} /></Suspense>
      case 'mascot': return <BooWorkPanel assistant={assistant} agents={agents} selectedAgents={selectedAgents} conversationId={conversationId} voiceAgentId={voiceAgentId} runs={runs} messages={delegationMessages} onSendMessage={onSendMessage} onOpenChat={() => revealTool('chat')} onOpenFile={workspaceId ? path => openFile(workspaceId, path) : undefined} />
      case 'diff': return <div className="h-full overflow-auto p-4"><h2 className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">Alterações versus HEAD</h2><pre className="min-w-max font-mono text-[11px] leading-5 whitespace-pre">{workspaceDiff || 'Nenhuma alteração rastreada.'}</pre></div>
      case 'squad': return <SquadTab assistant={assistant} agents={agents} agentStates={agentStates} runs={runs} onEdit={onEditAgent} onStartConversation={onStartAgentConversation} />
      case 'memory': return <MemoryTab onOpenSettings={onOpenSettings} />
      case 'launcher': return <LauncherTab workspaceId={workspaceId} onPick={kind => openInGroup(kind, groupWithTab(layout.root, tab.id)?.id || mainGroup(layout).id)} />
      default: return null
    }
  }

  const computeEdge = (element: HTMLElement, x: number, y: number): DockEdge | 'center' => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) return 'center'
    const left = (x - rect.left) / rect.width
    const top = (y - rect.top) / rect.height
    const scores: Array<[DockEdge, number]> = [['left', left], ['right', 1 - left], ['top', top], ['bottom', 1 - top]]
    const closest = scores.sort((a, b) => a[1] - b[1])[0]
    return closest[1] < 0.24 ? closest[0] : 'center'
  }

  const pane = (group: DockGroup) => {
    const hover = drop?.groupId === group.id ? drop.edge : null
    const menuTarget = paneMenu?.groupId === group.id ? paneMenu : null
    const primary = group.id === mainGroup(layout).id
    return (
      <section
        key={group.id}
        aria-label={primary ? 'Área de trabalho principal' : 'Painel auxiliar'}
        data-dock-group={group.id}
        onMouseDown={() => { if (layout.activeGroup !== group.id) setLayout(current => ({ ...current, activeGroup: group.id })) }}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-pane)]"
        onDragOver={event => {
          if (!draggedTab.current) return
          event.preventDefault()
          const edge = computeEdge(event.currentTarget, event.clientX, event.clientY)
          setDrop(current => current?.groupId === group.id && current.edge === edge ? current : { groupId: group.id, edge })
        }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null) }}
        onDrop={event => {
          event.preventDefault()
          event.stopPropagation()
          setDrop(null)
          const source = draggedTab.current
          draggedTab.current = null
          if (source) moveTab(source.tabId, group.id, computeEdge(event.currentTarget, event.clientX, event.clientY))
        }}
      >
        {hover ? (
          <div aria-hidden="true" className={`dock-drop-preview ${DROP_STYLE[hover]}`}>
            <span className="rounded-md border border-[var(--accent-primary)] bg-[var(--bg-sidebar)]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)] shadow-lg">{DROP_LABEL[hover]}</span>
          </div>
        ) : null}

        <header data-testid="dock-group-header" className="flex h-[36px] shrink-0 select-none items-center justify-between gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-1.5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-1">
            {group.tabs.map(tab => {
              const Icon = icons[tab.kind as DockTool] || Code2
              const active = group.active === tab.id
              // A aba principal assume o nome do conteúdo (Central, Rotinas, conversa); as demais usam o registro.
              const label = tab.kind === 'chat' && props.chatTab?.label ? props.chatTab.label : tab.label
              return (
                <div
                  key={tab.id}
                  draggable
                  data-testid={tab.kind === 'chat' ? 'chat-tab' : undefined}
                  data-active={active || undefined}
                  onDragStart={event => {
                    draggedTab.current = { groupId: group.id, tabId: tab.id }
                    event.dataTransfer.setData('application/x-politron-tab', tab.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => { draggedTab.current = null; setDrop(null) }}
                  className={
                    'group flex h-[26px] shrink-0 items-center rounded-md border transition ' +
                    (active
                      ? 'border-[var(--border-default)] bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]'
                      : 'border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]')
                  }
                >
                  <button
                    type="button"
                    aria-label={'Aba ' + label}
                    aria-current={active ? 'true' : undefined}
                    title={tab.path || label}
                    onClick={() => setLayout(current => changeActive(current, group.id, tab.id))}
                    className="flex h-full min-w-0 items-center gap-1.5 rounded-md py-0 pr-1.5 pl-2.5 text-[11.5px] text-inherit"
                  >
                    <Icon className={'size-3.5 shrink-0 ' + (active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]')} />
                    <span className="max-w-[140px] truncate">{label}</span>
                    {drafts[tab.id] && drafts[tab.id].content !== drafts[tab.id].baseline ? <span aria-label="Arquivo modificado" className="size-1.5 shrink-0 rounded-full bg-[var(--warning)]" /> : null}
                  </button>
                  <button
                    type="button"
                    aria-label={'Fechar ' + label}
                    title="Fechar aba"
                    onClick={event => { event.stopPropagation(); closeTab(group.id, tab.id) }}
                    className="mr-0.5 rounded p-0.5 opacity-60 transition group-hover:opacity-100 hover:bg-[var(--bg-active)]"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 pl-1">
            <button type="button" onClick={() => openInGroup('launcher', group.id)} title="Nova aba neste painel" aria-label="Nova aba" className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]">
              <Plus className="size-3.5" />
            </button>
            <button type="button" onClick={event => setPaneMenu(current => current?.groupId === group.id ? null : { groupId: group.id, anchor: event.currentTarget })} title="Manipular coluna ou dividir painel" aria-label="Manipular coluna ou dividir painel" className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]">
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {group.tabs.length
            ? group.tabs.map(tab => (
              <div key={tab.id} className={group.active === tab.id ? 'flex h-full min-h-0 min-w-0 flex-col' : 'hidden'}>
                {renderTab(tab)}
              </div>
            ))
            : <LauncherTab workspaceId={workspaceId} onPick={kind => openInGroup(kind, group.id)} />}
        </div>

        {menuTarget ? (
          <FloatingMenu anchor={menuTarget.anchor} onClose={() => setPaneMenu(null)} width={256} align="right">
            {groups(layout.root).filter(item => item.id !== group.id).map(other => (
              <FloatingMenuItem
                key={other.id}
                icon={<Columns2 className="size-4" />}
                label={`Mover aba para ${other.tabs[0]?.label.split('·')[0].trim() || 'painel vazio'}`}
                onClick={() => { setPaneMenu(null); if (group.active) moveTab(group.active, other.id) }}
              />
            ))}
            <FloatingMenuItem icon={<PanelLeft className="size-4" />} label="Dividir à esquerda com aba atual" onClick={() => { setPaneMenu(null); splitWithCurrent(group.id, 'left') }} />
            <FloatingMenuItem icon={<PanelRight className="size-4" />} label="Dividir à direita com aba atual" onClick={() => { setPaneMenu(null); splitWithCurrent(group.id, 'right') }} />
            <FloatingMenuItem icon={<PanelTop className="size-4" />} label="Dividir acima com aba atual" onClick={() => { setPaneMenu(null); splitWithCurrent(group.id, 'top') }} />
            <FloatingMenuItem icon={<PanelBottom className="size-4" />} label="Dividir abaixo com aba atual" onClick={() => { setPaneMenu(null); splitWithCurrent(group.id, 'bottom') }} />
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <FloatingMenuItem icon={<PanelLeftOpen className="size-4" />} label="Novo painel à esquerda" onClick={() => { setPaneMenu(null); splitNewPane(group.id, 'left') }} />
            <FloatingMenuItem icon={<PanelRightOpen className="size-4" />} label="Novo painel à direita" onClick={() => { setPaneMenu(null); splitNewPane(group.id, 'right') }} />
            <FloatingMenuItem icon={<PanelTopOpen className="size-4" />} label="Novo painel acima" onClick={() => { setPaneMenu(null); splitNewPane(group.id, 'top') }} />
            <FloatingMenuItem icon={<PanelBottomOpen className="size-4" />} label="Novo painel abaixo" onClick={() => { setPaneMenu(null); splitNewPane(group.id, 'bottom') }} />
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <FloatingMenuItem
              icon={<Trash2 className="size-4" />}
              label="Fechar painel"
              danger
              onClick={() => { setPaneMenu(null); if (groups(layout.root).length > 1) setLayout(current => removeGroup(current, group.id)) }}
            />
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <FloatingMenuItem icon={<RotateCcw className="size-4 text-[var(--accent-primary)]" />} label="Restaurar layout inicial" onClick={() => { setPaneMenu(null); resetLayout() }} />
          </FloatingMenu>
        ) : null}
      </section>
    )
  }

  const tree = (node: DockNode): ReactNode => {
    if (node.type === 'group') return pane(node)
    return <SplitContainer key={node.id} node={node} onRatio={ratio => setLayout(current => changeRatio(current, node.id, ratio))}>
      {child => tree(child)}
    </SplitContainer>
  }

  return <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden p-0.5">{tree(layout.root)}</div>
})

/** Split de dois painéis com o splitter de 4px do HTML. */
function SplitContainer({ node, onRatio, children }: { node: Extract<DockNode, { type: 'split' }>; onRatio: (ratio: number) => void; children: (node: DockNode) => ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(node.ratio)
  const [dragging, setDragging] = useState(false)
  const horizontal = node.axis === 'horizontal'

  useEffect(() => { setRatio(node.ratio) }, [node.ratio])

  useEffect(() => {
    if (!dragging) return
    const onMove = (event: MouseEvent) => {
      const rect = container.current?.getBoundingClientRect()
      if (!rect) return
      const next = horizontal ? ((event.clientX - rect.left) / rect.width) * 100 : ((event.clientY - rect.top) / rect.height) * 100
      setRatio(Math.max(18, Math.min(82, Number.isFinite(next) ? next : 50)))
    }
    const onUp = () => { setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, horizontal])

  useEffect(() => {
    if (dragging) return
    if (Math.abs(ratio - node.ratio) > 0.5) onRatio(ratio)
    // Só persiste quando o usuário solta o mouse; o efeito acompanha o arraste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  return (
    <div ref={container} className={'flex min-h-0 min-w-0 flex-1 overflow-hidden ' + (horizontal ? 'flex-row' : 'flex-col')}>
      <div style={{ flexBasis: `${ratio}%` }} className="relative flex min-h-0 min-w-0 overflow-hidden">{children(node.first)}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label="Redimensionar painéis"
        onMouseDown={event => { event.preventDefault(); setDragging(true) }}
        className={(horizontal ? 'splitter-v' : 'splitter-h') + (dragging ? ' active' : '')}
      />
      <div style={{ flexBasis: `${100 - ratio}%` }} className="relative flex min-h-0 min-w-0 overflow-hidden">{children(node.second)}</div>
    </div>
  )
}

export { MASCOT_STATE_LABEL }
