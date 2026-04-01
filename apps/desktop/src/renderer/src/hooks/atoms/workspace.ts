import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Workspace } from '@/types/workspace'

export const themeAtom = atomWithStorage<string>('vibe-ide-theme', 'default')

export const workspaceAtom = atom<Workspace | null>(null)
export const activeTeamIdAtom = atom<string | null>(null)
export const activeProjectIdAtom = atom<string | null>(null)
export const activeAgentTabIdAtom = atom<string | null>(null)
export const sidebarViewAtom = atom<'root' | 'project'>('root')
export const activeViewGroupIdAtom = atom<'projects' | 'office' | 'tasks'>('projects')

export const teamsAtom = atom(
 (get) => get(workspaceAtom)?.teams ?? []
)

export const activeTeamAtom = atom(
 (get) => {
 const workspace = get(workspaceAtom)
 const activeTeamId = get(activeTeamIdAtom)
 if (!workspace || !activeTeamId) return null
 return workspace.teams.find((t) => t.id === activeTeamId) ?? null
 }
)

export const projectsAtom = atom(
 (get) => get(workspaceAtom)?.projects ?? []
)

export const messagesAtom = atom(
 (get) => get(workspaceAtom)?.messages ?? {}
)