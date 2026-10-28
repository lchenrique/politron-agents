import { useEffect, useMemo, useRef, useState } from 'react'
import type { SidebarLayout } from '../../../../shared/v9'

/** Chaves antigas do agrupamento no navegador: lidas só para migrar e como reserva enquanto o banco estiver vazio. */
const GROUP_KEYS = {
  groups: 'politron.sidebar.groups',
  workspaceGroups: 'politron.sidebar.workspace-groups',
  collapsed: 'politron.sidebar.collapsed-groups'
} as const

function readList(key: string): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] }
}

function readRecord(key: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const out: Record<string, string> = {}
    for (const [entry, item] of Object.entries(value)) if (typeof item === 'string') out[entry] = item
    return out
  } catch { return {} }
}

/** Layout montado a partir dos grupos antigos do localStorage. */
export function legacySidebarLayout(): SidebarLayout {
  const names = readList(GROUP_KEYS.groups)
  const membership = Object.entries(readRecord(GROUP_KEYS.workspaceGroups))
  return { projectOrder: [], agentOrder: [], sessionOrder: {}, groups: names.map(name => ({ name, workspaceIds: membership.filter(([, group]) => group === name).map(([id]) => id) })) }
}

/**
 * Ordem e pastas do sidebar, salvas no banco (valem também na PWA). Na primeira leitura com banco vazio,
 * os grupos antigos do localStorage são migrados; se o host não responder, o localStorage segue como reserva.
 * O estado recolhido das pastas é preferência do aparelho e continua no localStorage.
 */
export function useSidebarLayout(onError: (message: string) => void) {
  const [layout, setLayout] = useState<SidebarLayout>(legacySidebarLayout)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(readList(GROUP_KEYS.collapsed)))
  const latest = useRef(layout)
  latest.current = layout
  const errorRef = useRef(onError)
  errorRef.current = onError
  useEffect(() => { localStorage.setItem(GROUP_KEYS.collapsed, JSON.stringify([...collapsedGroups])) }, [collapsedGroups])
  useEffect(() => {
    let alive = true
    void window.appAPI?.sidebarLayout?.().then(saved => {
      if (!alive) return
      if (saved) { setLayout(saved); return }
      const legacy = legacySidebarLayout()
      if (legacy.groups.length) void window.appAPI.saveSidebarLayout(legacy).catch(() => undefined)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  const save = (partial: Partial<SidebarLayout>) => {
    const next = { ...latest.current, ...partial, sessionOrder: { ...latest.current.sessionOrder, ...partial.sessionOrder } }
    latest.current = next
    setLayout(next)
    void window.appAPI?.saveSidebarLayout?.(partial).catch(() => errorRef.current('Não foi possível salvar a ordem do sidebar.'))
  }

  const workspaceGroup = useMemo(() => {
    const map: Record<string, string> = {}
    for (const group of layout.groups) for (const id of group.workspaceIds) map[id] ??= group.name
    return map
  }, [layout.groups])
  const groups = useMemo(() => layout.groups.map(group => group.name), [layout.groups])

  /** Move o projeto para o topo da pasta (ou da lista sem pasta). */
  const moveWorkspaceToGroup = (workspaceId: string, group: string | null) => {
    const current = latest.current
    save({
      groups: current.groups.map(item => ({ ...item, workspaceIds: [...(item.name === group ? [workspaceId] : []), ...item.workspaceIds.filter(id => id !== workspaceId)] })),
      projectOrder: [...(group ? [] : [workspaceId]), ...current.projectOrder.filter(id => id !== workspaceId)]
    })
  }

  /** Cria a pasta e, quando informado, move o projeto para ela. Devolve true quando a pasta ja existia. */
  const addGroup = (name: string, workspaceId?: string) => {
    const clean = name.trim()
    if (!clean) return false
    const existed = groups.includes(clean)
    if (!existed) save({ groups: [...latest.current.groups, { name: clean, workspaceIds: [] }] })
    if (workspaceId) moveWorkspaceToGroup(workspaceId, clean)
    return existed
  }

  const renameGroup = (from: string, to: string) => {
    const clean = to.trim()
    if (!clean || clean === from || groups.includes(clean)) return
    save({ groups: latest.current.groups.map(item => item.name === from ? { ...item, name: clean } : item) })
    setCollapsedGroups(current => { const updated = new Set(current); updated.delete(from); updated.add(clean); return updated })
  }

  const removeGroup = (name: string) => {
    save({ groups: latest.current.groups.filter(item => item.name !== name) })
    setCollapsedGroups(current => { const updated = new Set(current); updated.delete(name); return updated })
  }

  const toggleGroup = (name: string) => setCollapsedGroups(current => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })

  return { layout, save, groups, workspaceGroup, collapsedGroups, moveWorkspaceToGroup, addGroup, renameGroup, removeGroup, toggleGroup }
}
