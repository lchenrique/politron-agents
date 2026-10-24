import { useEffect, useState } from 'react'

/** Chaves de persistencia local do agrupamento de projetos. O agrupamento e organizacao de navegacao: nao altera workspace, sessao nem time padrao. */
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

export function useProjectGroups() {
  const [groups, setGroups] = useState<string[]>(() => readList(GROUP_KEYS.groups))
  const [workspaceGroup, setWorkspaceGroup] = useState<Record<string, string>>(() => readRecord(GROUP_KEYS.workspaceGroups))
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(readList(GROUP_KEYS.collapsed)))

  useEffect(() => { localStorage.setItem(GROUP_KEYS.groups, JSON.stringify(groups)) }, [groups])
  useEffect(() => { localStorage.setItem(GROUP_KEYS.workspaceGroups, JSON.stringify(workspaceGroup)) }, [workspaceGroup])
  useEffect(() => { localStorage.setItem(GROUP_KEYS.collapsed, JSON.stringify([...collapsedGroups])) }, [collapsedGroups])

  const moveWorkspaceToGroup = (workspaceId: string, group: string | null) => {
    setWorkspaceGroup(current => {
      const next = { ...current }
      if (group) next[workspaceId] = group
      else delete next[workspaceId]
      return next
    })
  }

  /** Cria a pasta e, quando informado, move o projeto para ela. Devolve true quando a pasta ja existia. */
  const addGroup = (name: string, workspaceId?: string) => {
    const clean = name.trim()
    if (!clean) return false
    const existed = groups.includes(clean)
    setGroups(current => existed ? current : [...current, clean])
    if (workspaceId) moveWorkspaceToGroup(workspaceId, clean)
    return existed
  }

  const renameGroup = (from: string, to: string) => {
    const clean = to.trim()
    if (!clean || clean === from) return
    setGroups(current => current.map(item => item === from ? clean : item))
    setWorkspaceGroup(current => Object.fromEntries(Object.entries(current).map(([id, group]) => [id, group === from ? clean : group])))
    setCollapsedGroups(current => { const updated = new Set(current); updated.delete(from); updated.add(clean); return updated })
  }

  const removeGroup = (name: string) => {
    setGroups(current => current.filter(item => item !== name))
    setWorkspaceGroup(current => Object.fromEntries(Object.entries(current).filter(([, group]) => group !== name)))
    setCollapsedGroups(current => { const updated = new Set(current); updated.delete(name); return updated })
  }

  const toggleGroup = (name: string) => setCollapsedGroups(current => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })

  const groupOf = (workspaceId: string) => workspaceGroup[workspaceId]

  return { groups, workspaceGroup, collapsedGroups, groupOf, moveWorkspaceToGroup, addGroup, renameGroup, removeGroup, toggleGroup }
}
