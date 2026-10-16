import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Agent, Team, Workspace } from '@/types/workspace'

export const themeAtom = atomWithStorage<string>('vibe-ide-theme', 'default')

// NOTA (Fase 0 da limpeza): estas eram declaradas com uma anotação separada
// `WritableAtom<T, [T], void>`, incompatível com a versão instalada do
// jotai (o typecheck novo desta fase acusava "Property 'write' is missing").
// Usar o genérico direto em atom<T>(...) mantém o mesmo tipo exposto
// (átomo gravável) sem mudar nenhum comportamento.
export const workspaceAtom = atom<Workspace | null>(null)
export const activeTeamIdAtom = atom<string | null>(null)
export const activeProjectIdAtom = atom<string | null>(null)
export const activeAgentTabIdAtom = atom<string | null>(null)
export const sidebarViewAtom = atom<'root' | 'project' | 'settings'>('root')
export const settingsSectionAtom = atom<'defaults' | 'providers' | 'mcp' | 'permissions' | 'tools' | 'advanced'>('defaults')
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
