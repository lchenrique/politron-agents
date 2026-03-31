import { createContext, useContext, ReactNode, useCallback, useEffect, useState } from "react";
import { atom, useAtom, useSetAtom, useAtomValue } from "jotai";
import { AGENT_CATALOG, type Workspace, type Team, type Project, type Agent, type ChatMessage, type PipelineTask } from "@/types/workspace";
import { workspaceAtom, activeTeamIdAtom, activeProjectIdAtom, activeAgentTabIdAtom, activeTeamAtom } from "./atoms";

// Backend Team type (from main/types/team.ts)
interface BackendTeam {
  id: string;
  name: string;
  projectPath: string;
  projectName?: string;
  projectColor?: string;
  techLeadAgentId: string;
  agents: BackendAgent[];
  status: "active" | "paused";
  pipeline: {
    tasks: BackendPipelineTask[];
    status: "idle" | "running" | "paused" | "done" | "failed";
    startedAt?: string;
    finishedAt?: string;
  };
  createdAt: string;
  templateId?: string;
}

interface BackendAgent {
  id: string;
  name: string;
  role: string;
  catalogSlug: string;
  systemPromptPath: string;
  status: "idle" | "running" | "waiting" | "blocked" | "done" | "error";
  color: string;
  currentFiles: string[];
  sessionId?: string;
  hiredAt: string;
  isTeamLead?: boolean;
}

interface BackendPipelineTask {
  id: string;
  teamId: string;
  agentId: string;
  description: string;
  files: string[];
  status: "pending" | "running" | "done" | "failed" | "blocked";
  dependsOn: string[];
  branchName?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

// Map backend Agent to frontend Agent
function mapBackendAgentToFrontend(backend: BackendAgent): Agent {
  const catalogEntry = AGENT_CATALOG.find(c => c.role === backend.role);
  return {
    id: backend.id,
    name: backend.name,
    role: backend.role,
    initials: backend.catalogSlug ? backend.catalogSlug.slice(0, 2).toUpperCase() : backend.name.slice(0, 2).toUpperCase(),
    status: backend.status,
    color: backend.color || catalogEntry?.color || "hsl(239 84% 67%)",
    bgColor: catalogEntry?.bgColor || "bg-ide-indigo/10",
    borderColor: catalogEntry?.borderColor || "border-ide-indigo/20",
    currentFiles: backend.currentFiles || [],
    isTeamLead: backend.isTeamLead,
  };
}

// Map backend PipelineTask to frontend PipelineTask
function mapBackendPipelineToFrontend(backend: BackendPipelineTask[]): PipelineTask[] {
  return backend.map(task => {
    const agent = { id: task.agentId };
    return {
      id: task.id,
      teamId: task.teamId,
      agentId: task.agentId,
      agentInitials: task.agentId.slice(0, 2).toUpperCase(),
      description: task.description,
      files: task.files,
      dependsOn: task.dependsOn,
      status: task.status,
    };
  });
}

// Map backend Team to frontend Team
function mapBackendTeamToFrontend(backend: BackendTeam): Team {
  return {
    id: backend.id,
    name: backend.name,
    color: backend.projectColor || "hsl(239 84% 67%)",
    projectPath: backend.projectPath,
    techLeadAgentId: backend.techLeadAgentId,
    agents: backend.agents.map(mapBackendAgentToFrontend),
    status: backend.status,
    pipeline: mapBackendPipelineToFrontend(backend.pipeline?.tasks || []),
  };
}

function mapBackendTeamsToProjects(teams: BackendTeam[]): Project[] {
  return teams.map((team) => {
    const projectName = team.projectName || team.name;
    return {
      id: team.id,
      initials: projectName.slice(0, 2).toUpperCase(),
      name: projectName,
      teamId: team.id,
      color: team.projectColor || "hsl(239 84% 67%)",
    };
  });
}

const defaultCeo: Agent = {
  id: "ceo-global",
  name: "Agents Orchestrator",
  catalogSlug: "agents-orchestrator",
  role: "ceo",
  initials: "AO",
  status: "running",
  color: "hsl(239 84% 67%)",
  bgColor: "bg-ide-indigo/10",
  borderColor: "border-ide-indigo/20",
  currentFiles: [],
};

function createEmptyWorkspace(): Workspace {
  return {
    globalCeoAgent: defaultCeo,
    teams: [],
    projects: [],
    activeProjectId: null,
    activeTeamId: null,
    activeAgentTabId: null,
    messages: {},
    agentActivities: {},
  };
}

interface WorkspaceContextType {
  workspace: Workspace;
  activeTeam: Team | null;
  setActiveProject: (id: string) => void;
  setActiveAgentTab: (id: string) => void;
  selectCeo: () => void;
  addProject: (name: string, teamName: string, color: string, projectPath: string) => Promise<void>;
  addAgentToTeam: (teamId: string, catalogIndex: number) => void;
  removeAgentFromTeam: (teamId: string, agentId: string) => void;
  toggleTeamStatus: (teamId: string) => void;
  sendMessage: (teamId: string, text: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return ctx;
};

let idCounter = 100;
const uid = () => `id-${++idCounter}`;

const setActiveProjectAtom = atom(
  null,
  (get, set, id: string) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    const proj = workspace.projects.find((p) => p.id === id);
    set(workspaceAtom, { ...workspace, activeProjectId: id, activeTeamId: proj?.teamId ?? workspace.activeTeamId });
    set(activeProjectIdAtom, id);
    set(activeTeamIdAtom, proj?.teamId ?? workspace.activeTeamId);
  }
);

const setActiveAgentTabAtom = atom(
  null,
  (get, set, id: string) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    set(workspaceAtom, { ...workspace, activeAgentTabId: id });
    set(activeAgentTabIdAtom, id);
  }
);

const addProjectAtom = atom(
  null,
  async (_get, _set, { name, teamName, color, projectPath }: { name: string; teamName: string; color: string; projectPath: string }) => {
    await window.vibeAPI.team.create({
      name: teamName,
      projectPath,
      projectName: name,
      projectColor: color,
    });
  }
);

function buildWorkspaceFromBackendTeams(backendTeams: BackendTeam[]): Workspace {
  const teams = backendTeams.map(mapBackendTeamToFrontend);
  const projects = mapBackendTeamsToProjects(backendTeams);
  const newWorkspace = createEmptyWorkspace();
  newWorkspace.teams = teams;
  newWorkspace.projects = projects;

  if (teams.length > 0) {
    newWorkspace.activeTeamId = teams[0].id;
    newWorkspace.activeProjectId = projects[0]?.id ?? teams[0].id;
    newWorkspace.activeAgentTabId = teams[0].techLeadAgentId || teams[0].agents[0]?.id || null;
  }

  return newWorkspace;
}

const addAgentToTeamAtom = atom(
  null,
  async (get, set, { teamId, catalogIndex }: { teamId: string; catalogIndex: number }) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    const cat = AGENT_CATALOG[catalogIndex];
    if (!cat) return;
    const agentId = uid();
    const agent: Agent = {
      id: agentId, name: cat.name, role: cat.role, initials: cat.initials, status: "idle",
      color: cat.color, bgColor: cat.bgColor, borderColor: cat.borderColor, currentFiles: [],
    };
    set(workspaceAtom, {
      ...workspace,
      teams: workspace.teams.map((t) => t.id === teamId ? { ...t, agents: [...t.agents, agent] } : t),
    });
    try {
      await window.vibeAPI.team.hire({
        teamId,
        agent: { name: cat.name, role: cat.role, catalogSlug: cat.slug, systemPromptPath: cat.systemPromptPath || "" },
      });
    } catch (err) {
      console.error("Failed to hire agent:", err);
      set(workspaceAtom, {
        ...workspace,
        teams: workspace.teams.map((t) => t.id === teamId ? { ...t, agents: t.agents.filter(a => a.id !== agentId) } : t),
      });
    }
  }
);

const removeAgentFromTeamAtom = atom(
  null,
  async (get, set, { teamId, agentId }: { teamId: string; agentId: string }) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    set(workspaceAtom, {
      ...workspace,
      teams: workspace.teams.map((t) =>
        t.id === teamId ? { ...t, agents: t.agents.filter((a) => a.id !== agentId && !a.isTeamLead) } : t
      ),
    });
    try {
      await window.vibeAPI.team.fire({ teamId, agentId });
    } catch (err) {
      console.error("Failed to fire agent:", err);
    }
  }
);

const toggleTeamStatusAtom = atom(
  null,
  async (get, set, teamId: string) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    const team = workspace.teams.find(t => t.id === teamId);
    const isPaused = team?.status === "paused";
    set(workspaceAtom, {
      ...workspace,
      teams: workspace.teams.map((t) =>
        t.id === teamId ? { ...t, status: t.status === "active" ? "paused" : "active" } : t
      ),
    });
    try {
      if (isPaused) {
        await window.vibeAPI.team.resume(teamId);
      } else {
        await window.vibeAPI.team.pause(teamId);
      }
    } catch (err) {
      console.error("Failed to toggle team status:", err);
    }
  }
);

const sendMessageAtom = atom(
  null,
  (get, set, { teamId, text }: { teamId: string; text: string }) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;
    const isCeoMessage = teamId === workspace.globalCeoAgent.id;
    const msg: ChatMessage = {
      id: uid(), agentId: "user", agentInitials: "VC", agentName: "você",
      agentColor: "hsl(239 84% 67%)", isUser: true, text, parts: [], timestamp: Date.now(),
    };
    set(workspaceAtom, {
      ...workspace,
      messages: { ...workspace.messages, [teamId]: [...(workspace.messages[teamId] ?? []), msg] },
      agentActivities: {
        ...workspace.agentActivities,
        [isCeoMessage ? workspace.globalCeoAgent.id : teamId]: { activity: "thinking" }
      }
    });

    if (isCeoMessage) {
      void (async () => {
        try {
          await window.vibeAPI.ceo.ensure({
            agentId: workspace.globalCeoAgent.id,
            agentSlug: workspace.globalCeoAgent.catalogSlug,
            // CEO uses the app's root (handled by backend if null)
            workspaceDirectory: "" 
          });
          await window.vibeAPI.ceo.subscribe();
          await window.vibeAPI.ceo.send({
            agentId: workspace.globalCeoAgent.id,
            message: text,
          });
        } catch (err) {
          const errorText = err instanceof Error ? err.message : "Falha ao conversar com o CEO";
          set(workspaceAtom, (current => {
            if (!current) return current;
            return {
              ...current,
              messages: {
                ...current.messages,
                [teamId]: [
                  ...(current.messages[teamId] ?? []),
                  {
                    id: uid(),
                    agentId: current.globalCeoAgent.id,
                    agentInitials: current.globalCeoAgent.initials,
                    agentName: current.globalCeoAgent.name,
                    agentColor: current.globalCeoAgent.color,
                    isUser: false,
                    text: `Erro: ${errorText}`,
                    timestamp: Date.now(),
                  },
                ],
              },
            };
          }) as any);
        }
      })();
    } else {
      const team = workspace.teams.find(t => t.id === teamId);
      const activeAgent = team?.agents.find(a => a.id === workspace.activeAgentTabId);
      if (team && activeAgent) {
        void (async () => {
          try {
            await window.vibeAPI.agent.ensure({
              agentId: activeAgent.id,
              teamId: team.id,
              role: activeAgent.role,
              agentSlug: activeAgent.catalogSlug,
              workspaceDirectory: team.projectPath
            });
            await window.vibeAPI.agent.send({
              agentId: activeAgent.id,
              message: text,
            });
          } catch (err) {
            console.error("Failed to send message to agent:", err);
          }
        })();
      }
    }
  }
);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      try {
        const backendTeams = await window.vibeAPI.team.list();
        
        if (cancelled) return;

        setWorkspace(buildWorkspaceFromBackendTeams(backendTeams as BackendTeam[]));
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load teams:", err);
        setWorkspace(createEmptyWorkspace());
      }
    }

    function handleTeamCreated(_data: { team: BackendTeam }) {
      void loadTeams();
    }

    function handleTeamUpdated(_data: { team: BackendTeam }) {
      void loadTeams();
    }

    function handleTeamDeleted(_data: { teamId: string }) {
      void loadTeams();
    }

    function handleTeamAgentAdded(data: { teamId: string; agent: BackendAgent }) {
      const agent = mapBackendAgentToFrontend(data.agent);
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === data.teamId ? { ...t, agents: [...t.agents, agent] } : t
          ),
        };
      });
    }

    function handleTeamAgentRemoved(data: { teamId: string; agentId: string }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === data.teamId
              ? { ...t, agents: t.agents.filter(a => a.id !== data.agentId) }
              : t
          ),
        };
      });
    }

    function handleTeamPaused(data: { teamId: string }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === data.teamId ? { ...t, status: "paused" } : t
          ),
        };
      });
    }

    function handleTeamResumed(data: { teamId: string }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === data.teamId ? { ...t, status: "active" } : t
          ),
        };
      });
    }

    function handlePipelineStatusChanged(data: { teamId: string; status: string; tasks?: BackendPipelineTask[] }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === data.teamId
              ? { ...t, pipeline: mapBackendPipelineToFrontend(data.tasks || []) }
              : t
          ),
        };
      });
    }

    function handleAgentChunk(data: { agentId: string; sessionId?: string; message?: { content?: { text?: string } } }) {
      const text = data.message?.content?.text;
      if (!text) return;

      setWorkspace(prev => {
        if (!prev) return prev;

        const targetKey = data.agentId === prev.globalCeoAgent.id
          ? prev.globalCeoAgent.id
          : prev.activeTeamId ?? prev.globalCeoAgent.id;

        const existingMessages = prev.messages[targetKey] ?? [];
        const lastMessage = existingMessages[existingMessages.length - 1];

        if (
          lastMessage &&
          !lastMessage.isUser &&
          lastMessage.agentId === data.agentId &&
          lastMessage.streamId === data.sessionId
        ) {
          // Update the text part inside parts array
          const parts = lastMessage.parts ?? [];
          const lastPartIdx = parts.findLastIndex(p => p.type === "text");
          let newParts;
          if (lastPartIdx >= 0) {
            newParts = parts.map((p, i) => i === lastPartIdx ? { ...p, text } : p);
          } else {
            newParts = [...parts, { type: "text" as const, text }];
          }
          
          // CRITICAL: If we are receiving text, ensure any reasoning parts are marked as finished
          newParts = newParts.map(p => p.type === "reasoning" ? { ...p, isOngoing: false } : p);
          
          return {
            ...prev,
            messages: {
              ...prev.messages,
              [targetKey]: [
                ...existingMessages.slice(0, -1),
                { ...lastMessage, text, parts: newParts, timestamp: Date.now() },
              ],
            },
          };
        }

        const teamAgent = prev.teams.flatMap((team) => team.agents).find((agent) => agent.id === data.agentId);
        const agentMeta = data.agentId === prev.globalCeoAgent.id ? prev.globalCeoAgent : teamAgent;

        return {
          ...prev,
          messages: {
            ...prev.messages,
            [targetKey]: [
              ...existingMessages,
              {
                id: uid(),
                streamId: data.sessionId,
                agentId: data.agentId,
                agentInitials: agentMeta?.initials ?? "AI",
                agentName: agentMeta?.name ?? "Agente",
                agentColor: agentMeta?.color ?? "hsl(239 84% 67%)",
                isUser: false,
                text,
                parts: [{ type: "text" as const, text }],
                timestamp: Date.now(),
              },
            ],
          },
        };
      });
    }

    function handleAgentStatus(data: { agentId: string; status: Agent["status"] }) {
      setWorkspace(prev => {
        if (!prev) return prev;

        let nextActivities = prev.agentActivities;
        if (data.status === "idle") {
          nextActivities = {
            ...prev.agentActivities,
            [data.agentId]: {
              activity: "idle",
            },
          };
        }

        if (data.agentId === prev.globalCeoAgent.id) {
          return {
            ...prev,
            globalCeoAgent: { ...prev.globalCeoAgent, status: data.status },
            agentActivities: nextActivities,
          };
        }

        return {
          ...prev,
          teams: prev.teams.map((team) => ({
            ...team,
            agents: team.agents.map((agent) =>
              agent.id === data.agentId ? { ...agent, status: data.status } : agent
            ),
          })),
          agentActivities: nextActivities,
        };
      });
    }

    function handleCeoAskHuman(data: { question: string }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        const key = prev.globalCeoAgent.id;
        return {
          ...prev,
          messages: {
            ...prev.messages,
            [key]: [
              ...(prev.messages[key] ?? []),
              {
                id: uid(),
                agentId: prev.globalCeoAgent.id,
                agentInitials: prev.globalCeoAgent.initials,
                agentName: prev.globalCeoAgent.name,
                agentColor: prev.globalCeoAgent.color,
                isUser: false,
                text: data.question,
                parts: [],
                timestamp: Date.now(),
              },
            ],
          },
        };
      });
    }

    function handleAgentReasoning(data: { agentId: string; sessionId?: string; text?: string; isOngoing?: boolean }) {
      setWorkspace(prev => {
        if (!prev) return prev;

        const targetKey = data.agentId === prev.globalCeoAgent.id
          ? prev.globalCeoAgent.id
          : prev.activeTeamId ?? prev.globalCeoAgent.id;

        const existingMessages = prev.messages[targetKey] ?? [];
        const lastMsg = existingMessages[existingMessages.length - 1];

        // If there's an active AI message for this session, upsert the reasoning part
        if (lastMsg && !lastMsg.isUser && lastMsg.agentId === data.agentId) {
          const parts = lastMsg.parts ?? [];
          const rIdx = parts.findLastIndex(p => p.type === "reasoning");
          let newParts;
          if (rIdx >= 0) {
            newParts = parts.map((p, i) => i === rIdx ? { ...p, text: data.text ?? "", isOngoing: !!data.isOngoing } : p);
          } else {
            // Insert reasoning before the last text part
            const textIdx = parts.findLastIndex(p => p.type === "text");
            newParts = textIdx >= 0
              ? [...parts.slice(0, textIdx), { type: "reasoning" as const, text: data.text ?? "", isOngoing: !!data.isOngoing }, ...parts.slice(textIdx)]
              : [...parts, { type: "reasoning" as const, text: data.text ?? "", isOngoing: !!data.isOngoing }];
          }

          // If this reasoning is NOT ongoing, ensure all other parts in this message are also checked
          if (data.isOngoing === false) {
             newParts = newParts.map(p => p.type === "reasoning" && p !== newParts[rIdx >= 0 ? rIdx : newParts.length-1] ? { ...p, isOngoing: false } : p);
          }
          return {
            ...prev,
            messages: {
              ...prev.messages,
              [targetKey]: [...existingMessages.slice(0, -1), { ...lastMsg, parts: newParts }],
            },
            agentActivities: {
              ...prev.agentActivities,
              [data.agentId]: { activity: data.isOngoing ? "thinking" as const : prev.agentActivities[data.agentId]?.activity ?? "idle" as const },
            },
          };
        }

        // No active message yet — just update activity
        if (data.isOngoing) {
          return {
            ...prev,
            agentActivities: {
              ...prev.agentActivities,
              [data.agentId]: { activity: "thinking" },
            },
          };
        }
        return prev;
      });
    }

    function handleAgentActivity(data: { agentId: string; activity: "idle" | "reading" | "editing" | "creating" | "thinking"; toolName?: string; title?: string }) {
      setWorkspace(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          agentActivities: {
            ...prev.agentActivities,
            [data.agentId]: {
              activity: data.activity,
              toolName: data.toolName,
              filename: data.title,
            },
          },
        };
      });
    }

    const unsubscribers = [
      window.vibeAPI.onTeamCreated(handleTeamCreated),
      window.vibeAPI.onTeamUpdated(handleTeamUpdated),
      window.vibeAPI.onTeamDeleted(handleTeamDeleted),
      window.vibeAPI.onTeamAgentAdded(handleTeamAgentAdded),
      window.vibeAPI.onTeamAgentRemoved(handleTeamAgentRemoved),
      window.vibeAPI.onTeamPaused(handleTeamPaused),
      window.vibeAPI.onTeamResumed(handleTeamResumed),
      window.vibeAPI.onPipelineStatusChanged(handlePipelineStatusChanged),
      window.vibeAPI.onAgentChunk(handleAgentChunk),
      window.vibeAPI.onAgentStatus(handleAgentStatus),
      window.vibeAPI.onCeoAskHuman(handleCeoAskHuman),
      (window.vibeAPI as any).onAgentReasoning?.(handleAgentReasoning),
      (window.vibeAPI as any).onAgentActivity?.(handleAgentActivity),
    ];

    loadTeams();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      }
    };
  }, [setWorkspace]);

  const activeTeam = useAtomValue(activeTeamAtom);
  const setActiveProject = useSetAtom(setActiveProjectAtom);
  const setActiveAgentTab = useSetAtom(setActiveAgentTabAtom);
  const addProject = useSetAtom(addProjectAtom);
  const addAgentToTeam = useSetAtom(addAgentToTeamAtom);
  const removeAgentFromTeam = useSetAtom(removeAgentFromTeamAtom);
  const toggleTeamStatus = useSetAtom(toggleTeamStatusAtom);
  const sendMessage = useSetAtom(sendMessageAtom);

  const handleSetActiveProject = useCallback((id: string) => {
    setActiveProject(id);
  }, [setActiveProject]);

  const handleSetActiveAgentTab = useCallback((id: string) => {
    setActiveAgentTab(id);
  }, [setActiveAgentTab]);

  const handleSelectCeo = useCallback(() => {
    setActiveAgentTab(workspace?.globalCeoAgent.id ?? "ceo-global");
  }, [setActiveAgentTab, workspace?.globalCeoAgent.id]);

  const handleAddProject = useCallback((name: string, teamName: string, color: string, projectPath: string) => {
    addProject({ name, teamName, color, projectPath });
  }, [addProject]);

  const handleAddAgentToTeam = useCallback((teamId: string, catalogIndex: number) => {
    addAgentToTeam({ teamId, catalogIndex });
  }, [addAgentToTeam]);

  const handleRemoveAgentFromTeam = useCallback((teamId: string, agentId: string) => {
    removeAgentFromTeam({ teamId, agentId });
  }, [removeAgentFromTeam]);

  const handleToggleTeamStatus = useCallback((teamId: string) => {
    toggleTeamStatus(teamId);
  }, [toggleTeamStatus]);

  const handleSendMessage = useCallback((teamId: string, text: string) => {
    sendMessage({ teamId, text });
  }, [sendMessage]);

  const contextValue = workspace ?? createEmptyWorkspace();

  return (
    <WorkspaceContext.Provider value={{
      workspace: contextValue,
      activeTeam,
      setActiveProject: handleSetActiveProject,
      setActiveAgentTab: handleSetActiveAgentTab,
      selectCeo: handleSelectCeo,
      addProject: handleAddProject,
      addAgentToTeam: handleAddAgentToTeam,
      removeAgentFromTeam: handleRemoveAgentFromTeam,
      toggleTeamStatus: handleToggleTeamStatus,
      sendMessage: handleSendMessage,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
