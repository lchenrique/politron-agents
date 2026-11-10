export type DockTool = 'chat' | 'files' | 'terminal' | 'web' | 'mascot' | 'diff' | 'agents' | 'squad' | 'memory' | 'launcher'
export type DockZone = 'main' | 'side'
export type DockEdge = 'left' | 'right' | 'top' | 'bottom'
export type DockTab = { id: string; kind: DockTool | 'file'; label: string; workspaceId?: string; path?: string }
export type DockGroup = { type: 'group'; id: string; tabs: DockTab[]; active: string }
export type DockSplit = { type: 'split'; id: string; axis: 'horizontal' | 'vertical'; ratio: number; first: DockNode; second: DockNode }
export type DockNode = DockGroup | DockSplit
export interface DockLayoutState { root: DockNode; activeGroup: string }
/** Presets de colunas do menu "Layout & Painéis" do top bar. */
export type LayoutPreset = 'two-cols' | 'three-cols' | 'ide-split' | 'quad-grid' | 'focus-chat'

const tools: DockTool[] = ['chat', 'files', 'terminal', 'web', 'mascot', 'diff', 'agents', 'squad', 'memory', 'launcher']
/** Títulos iguais ao registro de abas do HTML de referência. */
const names: Record<DockTool, string> = {
  chat: 'Chief · Orquestração',
  files: 'Arquivos & Diff',
  terminal: 'Terminal Local',
  web: 'Preview Web',
  mascot: 'Mascote',
  diff: 'Alterações',
  agents: 'Delegações',
  squad: 'Equipe de Boos',
  memory: 'Memória & MCP',
  launcher: 'Nova Aba',
}
/** Layouts salvos antes do navegador único guardam a aba 'browser' do agente; ela vira a aba do navegador da plataforma. */
const legacyTool: Record<string, DockTool> = { browser: 'web' }
let counter = 0
const uid = () => 'dock-' + Date.now().toString(36) + '-' + (++counter).toString(36)
export const newGroup = (tabs: DockTab[] = []): DockGroup => ({ type: 'group', id: uid(), tabs, active: tabs.at(-1)?.id || '' })
export const toolTab = (kind: DockTool): DockTab => ({ id: kind, kind, label: names[kind] })
export const fileTab = (workspaceId: string, path: string): DockTab => ({
  id: 'file:' + encodeURIComponent(workspaceId) + ':' + encodeURIComponent(path),
  kind: 'file', label: path.split('/').pop() || path, workspaceId, path,
})
export function initialDockLayout(): DockLayoutState {
  const root = newGroup([toolTab('chat')])
  return { root, activeGroup: root.id }
}
export function groups(node: DockNode): DockGroup[] {
  return node.type === 'group' ? [node] : [...groups(node.first), ...groups(node.second)]
}
export function groupWithTab(root: DockNode, tabId: string): DockGroup | undefined {
  return groups(root).find(group => group.tabs.some(tab => tab.id === tabId))
}
export function getGroup(root: DockNode, id: string): DockGroup | undefined { return groups(root).find(group => group.id === id) }
function updateNode(node: DockNode, id: string, transform: (group: DockGroup) => DockNode): DockNode {
  if (node.type === 'group') return node.id === id ? transform(node) : node
  return { ...node, first: updateNode(node.first, id, transform), second: updateNode(node.second, id, transform) }
}
export function changeActive(layout: DockLayoutState, id: string, tab: string): DockLayoutState {
  if (!getGroup(layout.root, id)) return layout
  return { root: updateNode(layout.root, id, group => ({ ...group, active: tab })), activeGroup: id }
}
export function detachTab(layout: DockLayoutState, tabId: string): DockLayoutState {
  const source = groupWithTab(layout.root, tabId)
  if (!source) return layout
  return { ...layout, root: updateNode(layout.root, source.id, group => {
    const tabs = group.tabs.filter(tab => tab.id !== tabId)
    return { ...group, tabs, active: group.active === tabId ? tabs.at(-1)?.id || '' : group.active }
  }) }
}
export function placeTab(layout: DockLayoutState, tab: DockTab, groupId: string): DockLayoutState {
  if (!getGroup(layout.root, groupId)) return layout
  const clean = detachTab(layout, tab.id)
  return { root: updateNode(clean.root, groupId, group => ({ ...group, tabs: [...group.tabs, tab], active: tab.id })), activeGroup: groupId }
}
export function splitGroup(layout: DockLayoutState, id: string, edge: DockEdge, tab?: DockTab): DockLayoutState {
  if (!getGroup(layout.root, id) || groups(layout.root).length >= 8) return layout
  const clean = tab ? detachTab(layout, tab.id) : layout
  const sibling = newGroup(tab ? [tab] : [])
  const axis = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical'
  const first = edge === 'left' || edge === 'top'
  const root = updateNode(clean.root, id, old => ({
    type: 'split', id: uid(), axis, ratio: 50,
    first: first ? sibling : old, second: first ? old : sibling,
  }))
  return { root, activeGroup: sibling.id }
}
export function removeGroup(layout: DockLayoutState, id: string): DockLayoutState {
  if (layout.root.type === 'group' && layout.root.id === id) return layout
  const visit = (node: DockNode): DockNode | null => {
    if (node.type === 'group') return node.id === id ? null : node
    const a = visit(node.first), b = visit(node.second)
    if (!a) return b
    if (!b) return a
    return { ...node, first: a, second: b }
  }
  const root = visit(layout.root)
  if (!root) return initialDockLayout()
  return { root, activeGroup: getGroup(root, layout.activeGroup) ? layout.activeGroup : groups(root)[0].id }
}
export function pruneEmpty(layout: DockLayoutState): DockLayoutState {
  let next = layout
  for (const group of groups(layout.root)) if (!group.tabs.length && groups(next.root).length > 1) next = removeGroup(next, group.id)
  return next
}
export function changeRatio(layout: DockLayoutState, splitId: string, ratio: number): DockLayoutState {
  const visit = (node: DockNode): DockNode => node.type === 'group' ? node : {
    ...node, ratio: node.id === splitId ? Math.max(18, Math.min(82, ratio)) : node.ratio,
    first: visit(node.first), second: visit(node.second),
  }
  return { ...layout, root: visit(layout.root) }
}
function validTab(tab: unknown): tab is DockTab {
  if (!tab || typeof tab !== 'object') return false
  const v = tab as Partial<DockTab>
  return typeof v.id === 'string' && v.id.length < 2000 && typeof v.label === 'string' && v.label.length < 600
    && (tools.includes(v.kind as DockTool) || (v.kind === 'file' && !!v.workspaceId && !!v.path))
}
function migrateTab(tab: unknown): unknown {
  if (!tab || typeof tab !== 'object') return tab
  const value = tab as Record<string, unknown>
  const kind = typeof value.kind === 'string' ? legacyTool[value.kind] : undefined
  if (!kind) return tab
  return { ...value, id: kind, kind, label: names[kind] }
}
function migrateTabId(id: unknown): unknown {
  return typeof id === 'string' ? legacyTool[id] || id : id
}
function cleanTabs(items: unknown, seen: Set<string>): DockTab[] {
  if (!Array.isArray(items)) return []
  return items.map(migrateTab).filter((item): item is DockTab => {
    if (!validTab(item) || seen.has(item.id) || seen.size >= 50) return false
    seen.add(item.id)
    return true
  })
}
export function deserializeDockLayout(input: unknown): DockLayoutState {
  if (!input || typeof input !== 'object') return initialDockLayout()
  const raw = input as Record<string, unknown>
  const seen = new Set<string>()
  if (raw.root) {
    let count = 0
    const parse = (node: unknown, depth: number): DockNode | null => {
      if (!node || typeof node !== 'object' || depth > 7 || count > 15) return null
      const value = node as Record<string, unknown>
      if (value.type === 'group') {
        count++
        const tabs = cleanTabs(value.tabs, seen)
        const id = uid()
        const active = migrateTabId(value.active)
        return { type: 'group', id, tabs, active: tabs.some(tab => tab.id === active) ? active as string : tabs[0]?.id || '' }
      }
      if (value.type !== 'split') return null
      const first = parse(value.first, depth + 1), second = parse(value.second, depth + 1)
      if (!first) return second
      if (!second) return first
      return { type: 'split', id: uid(), first, second, axis: value.axis === 'vertical' ? 'vertical' : 'horizontal',
        ratio: typeof value.ratio === 'number' && Number.isFinite(value.ratio) ? Math.max(18, Math.min(82, value.ratio)) : 50 }
    }
    // Preserve IDs as well as the grouping when opening the application again.
    const preserve = (original: unknown, node: DockNode): DockNode => {
      const v = original as Record<string, unknown>
      const id = typeof v?.id === 'string' && v.id.length < 100 ? v.id : node.id
      if (node.type === 'group') return { ...node, id }
      return { ...node, id, first: preserve(v.first, node.first), second: preserve(v.second, node.second) }
    }
    const parsed = parse(raw.root, 0)
    if (!parsed) return initialDockLayout()
    const root = preserve(raw.root, parsed)
    if (!seen.has('chat')) {
      const first = groups(root)[0]
      return { root: updateNode(root, first.id, group => ({ ...group, tabs: [toolTab('chat'), ...group.tabs], active: group.active || 'chat' })), activeGroup: first.id }
    }
    const active = typeof raw.activeGroup === 'string' && getGroup(root, raw.activeGroup) ? raw.activeGroup : groups(root)[0].id
    return { root, activeGroup: active }
  }
  const main = raw.main as { tabs?: unknown; active?: unknown } | undefined
  const side = raw.side as { tabs?: unknown; active?: unknown } | undefined
  if (!main || !side) return initialDockLayout()
  const a = newGroup(cleanTabs(main.tabs, seen)), b = newGroup(cleanTabs(side.tabs, seen))
  if (!seen.has('chat')) a.tabs.unshift(toolTab('chat'))
  a.active = a.tabs.some(t => t.id === migrateTabId(main.active)) ? migrateTabId(main.active) as string : a.tabs[0]?.id || ''
  b.active = b.tabs.some(t => t.id === migrateTabId(side.active)) ? migrateTabId(side.active) as string : b.tabs[0]?.id || ''
  if (!b.tabs.length) return { root: a, activeGroup: a.id }
  const position = raw.position
  const first = position === 'left' || position === 'top'
  const size = typeof raw.size === 'number' ? Math.max(18, Math.min(82, raw.size)) : 42
  return { root: { type: 'split', id: uid(), axis: position === 'top' || position === 'bottom' ? 'vertical' : 'horizontal',
    ratio: first ? size : 100 - size, first: first ? b : a, second: first ? a : b }, activeGroup: a.id }
}

/** Um clique organiza o ambiente IDE sem descartar arquivos ou ferramentas abertas. */
export function developmentDockLayout(previous?: DockLayoutState): DockLayoutState {
  const previousTabs = previous ? groups(previous.root).flatMap(group => group.tabs) : []
  const seen = new Set<string>()
  const unique = previousTabs.filter(tab => {
    if (seen.has(tab.id)) return false
    seen.add(tab.id)
    return true
  })
  const remaining = unique.filter(tab => !['chat', 'files', 'terminal'].includes(tab.id))
  const chat = newGroup([toolTab('chat')])
  const editor = newGroup(remaining)
  const files = newGroup([toolTab('files')])
  const terminal = newGroup([toolTab('terminal')])
  return {
    activeGroup: editor.id,
    root: {
      type: 'split', id: uid(), axis: 'vertical', ratio: 72,
      first: {
        type: 'split', id: uid(), axis: 'horizontal', ratio: 39,
        first: chat,
        second: {
          type: 'split', id: uid(), axis: 'horizontal', ratio: 62,
          first: editor, second: files,
        },
      },
      second: terminal,
    },
  }
}

/**
 * Presets de colunas do menu "Layout & Painéis", na mesma ordem do HTML:
 * duas colunas, três colunas, split 2D, grade 2x2 e foco no Chief.
 * Presets preservam abas de arquivo já abertas, para não perder trabalho.
 */
export function presetLayout(preset: LayoutPreset, previous?: DockLayoutState): DockLayoutState {
  const openTabs = previous ? groups(previous.root).flatMap(group => group.tabs) : []
  const fileTabs = openTabs.filter(tab => tab.kind === 'file')
  const editorTabs = fileTabs.length ? fileTabs : [toolTab('files')]
  const chat = newGroup([toolTab('chat')])
  const files = newGroup(editorTabs)
  const terminal = newGroup([toolTab('terminal')])
  const browser = newGroup([toolTab('web')])
  const split = (axis: 'horizontal' | 'vertical', ratio: number, first: DockNode, second: DockNode): DockSplit =>
    ({ type: 'split', id: uid(), axis, ratio, first, second })

  switch (preset) {
    case 'focus-chat':
      return { root: chat, activeGroup: chat.id }
    case 'three-cols':
      return { activeGroup: chat.id, root: split('horizontal', 34, chat, split('horizontal', 50, files, terminal)) }
    case 'ide-split':
      return { activeGroup: chat.id, root: split('vertical', 62, split('horizontal', 52, chat, files), terminal) }
    case 'quad-grid':
      return {
        activeGroup: chat.id,
        root: split('vertical', 50, split('horizontal', 50, chat, files), split('horizontal', 50, terminal, browser)),
      }
    case 'two-cols':
    default:
      return { activeGroup: chat.id, root: split('horizontal', 52, chat, files) }
  }
}

