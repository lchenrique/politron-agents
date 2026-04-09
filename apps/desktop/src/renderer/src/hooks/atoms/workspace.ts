import { atom, type WritableAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Agent, Team, Workspace } from '@/types/workspace'

export const themeAtom = atomWithStorage<string>('vibe-ide-theme', 'default')

export const workspaceAtom: WritableAtom<Workspace | null, [Workspace | null], void> = atom(null)
export const activeTeamIdAtom: WritableAtom<string | null, [string | null], void> = atom(null)
export const activeProjectIdAtom: WritableAtom<string | null, [string | null], void> = atom(null)
export const activeAgentTabIdAtom: WritableAtom<string | null, [string | null], void> = atom(null)
export const sidebarViewAtom: WritableAtom<'root' | 'project' | 'settings', ['root' | 'project' | 'settings'], void> = atom('root')
export const settingsSectionAtom: WritableAtom<'defaults' | 'providers' | 'mcp' | 'permissions' | 'tools' | 'advanced', ['defaults' | 'providers' | 'mcp' | 'permissions' | 'tools' | 'advanced'], void> = atom('defaults')
export const activeViewGroupIdAtom: WritableAtom<'projects' | 'office' | 'tasks', ['projects' | 'office' | 'tasks'], void> = atom('projects')

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

export const activeProjectViewAtom = atom(
    (get) => {
        const workspace = get(workspaceAtom)
        const activeProjectId = get(activeProjectIdAtom)
        if (!workspace || !activeProjectId) return "chat" as const
        return workspace.projectViews?.[activeProjectId] ?? "chat"
    }
)

export const globalAgentsAtom = atom<Agent[]>(
    (get) => get(workspaceAtom)?.globalAgents ?? []
)

export const globalCeoAgentAtom = atom<Agent | null>(
    (get) => get(workspaceAtom)?.globalCeoAgent ?? null
)

// Stable selectors to avoid unnecessary re-renders from object reference changes
const selectGlobalCeo = (workspace: Workspace | null) => workspace?.globalCeoAgent ?? null
const selectGlobalAgents = (workspace: Workspace | null) => workspace?.globalAgents ?? []
const selectActiveAgent = (workspace: Workspace | null) => {
    if (!workspace) return null
    const activeAgentTabId = workspace.activeAgentTabId
    if (!activeAgentTabId) return null
    const globalAgent = workspace.globalAgents.find((agent) => agent.id === activeAgentTabId)
    if (globalAgent) {
        return globalAgent
    }
    for (const team of workspace.teams) {
        const agent = team.agents.find((a) => a.id === activeAgentTabId)
        if (agent) {
            return agent
        }
    }
    return null
}
const selectActiveAgentTeam = (workspace: Workspace | null) => {
    if (!workspace) return null
    const activeAgentTabId = workspace.activeAgentTabId
    if (!activeAgentTabId || workspace.globalAgents.some((agent) => agent.id === activeAgentTabId)) {
        return null
    }
    // Always search all teams to find the agent's team
    return workspace.teams.find((team) => team.agents.some((agent) => agent.id === activeAgentTabId)) ?? null
}

export const globalAgentsAtomStable = atom((get) => selectGlobalAgents(get(workspaceAtom)))
export const globalCeoAgentAtomStable = atom((get) => selectGlobalCeo(get(workspaceAtom)))
export const activeAgentAtom = atom<Agent | null>((get) => selectActiveAgent(get(workspaceAtom)))
export const activeAgentTeamAtom = atom<Team | null>((get) => selectActiveAgentTeam(get(workspaceAtom)))
