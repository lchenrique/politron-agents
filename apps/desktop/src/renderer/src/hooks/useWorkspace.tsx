import { type ReactNode, useCallback, useEffect } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  AGENT_CATALOG,
  type Agent,
  type PipelineTask,
  type Project,
  type Team,
  type Workspace,
} from "@/types/workspace";
import {
  activeAgentTabIdAtom,
  activeProjectIdAtom,
  activeTeamAtom,
  activeTeamIdAtom,
  globalCeoAgentAtom,
  projectsAtom,
  sidebarViewAtom,
  teamsAtom,
  workspaceAtom,
} from "./atoms";

export const useWorkspaceDeleteProject = () => {
  const workspace = useWorkspaceState();
  const setWorkspace = useSetAtom(workspaceAtom);
  const setActiveProjectId = useSetAtom(activeProjectIdAtom);
  const setActiveTeamId = useSetAtom(activeTeamIdAtom);
  const setActiveAgentTabId = useSetAtom(activeAgentTabIdAtom);
  const setSidebarView = useSetAtom(sidebarViewAtom);

  return useCallback(
    (projectId: string) => {
      const project = workspace.projects.find((p) => p.id === projectId);
      if (!project) return;

      // If deleting the currently active project, go back to root
      if (workspace.activeProjectId === projectId) {
        setWorkspace({
          ...workspace,
          activeProjectId: null,
          activeTeamId: null,
          activeAgentTabId: null,
        });
        setActiveProjectId(null);
        setActiveTeamId(null);
        setActiveAgentTabId(null);
        setSidebarView('root');
      }

      // Delete via API
      window.vibeAPI.team.delete(project.teamId);
    },
    [workspace, setWorkspace, setActiveProjectId, setActiveTeamId, setActiveAgentTabId, setSidebarView]
  );
};

export interface AgentTemplate {
  slug: string;
  name: string;
  description: string;
  mode: string;
  color: string;
  initials: string;
  role: string;
  systemPromptPath: string;
}

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

function mapBackendAgentToFrontend(backend: BackendAgent): Agent {
  const catalogEntry = AGENT_CATALOG.find((entry) => entry.role === backend.role);
  return {
    id: backend.id,
    name: backend.name,
    role: backend.role,
    catalogSlug: backend.catalogSlug,
    initials: backend.catalogSlug
      ? backend.catalogSlug.slice(0, 2).toUpperCase()
      : backend.name.slice(0, 2).toUpperCase(),
    status: backend.status,
    color: backend.color || catalogEntry?.color || "hsl(239 84% 67%)",
    bgColor: catalogEntry?.bgColor || "bg-ide-indigo/10",
    borderColor: catalogEntry?.borderColor || "border-ide-indigo/20",
    currentFiles: backend.currentFiles || [],
    isTeamLead: backend.isTeamLead,
  };
}

function mapBackendPipelineToFrontend(backend: BackendPipelineTask[]): PipelineTask[] {
  return backend.map((task) => ({
    id: task.id,
    teamId: task.teamId,
    agentId: task.agentId,
    agentInitials: task.agentId.slice(0, 2).toUpperCase(),
    description: task.description,
    files: task.files,
    dependsOn: task.dependsOn,
    status: task.status,
  }));
}

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
  name: "CEO",
  catalogSlug: "ceo",
  role: "ceo",
  initials: "CEO",
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
  };
}

const EMPTY_WORKSPACE = createEmptyWorkspace();

export const useWorkspaceState = () => useAtomValue(workspaceAtom) ?? EMPTY_WORKSPACE;

export const useWorkspaceProjects = () => useAtomValue(projectsAtom);

export const useWorkspaceTeams = () => useAtomValue(teamsAtom);

export const useWorkspaceGlobalCeoAgent = () =>
  useAtomValue(globalCeoAgentAtom) ?? EMPTY_WORKSPACE.globalCeoAgent;

export const useWorkspaceActiveProjectId = () => useAtomValue(activeProjectIdAtom);

export const useWorkspaceActiveAgentTabId = () => {
  const workspace = useAtomValue(workspaceAtom);
  return workspace?.activeAgentTabId ?? null;
};

export const useWorkspaceSidebarView = () => useAtomValue(sidebarViewAtom);

export const useWorkspaceActiveTeam = () => useAtomValue(activeTeamAtom);

let idCounter = 100;
const uid = () => `id-${++idCounter}`;
let ceoHireCallback: (() => void) | null = null;

const setActiveProjectAtom = atom(null, (get, set, id: string) => {
  const workspace = get(workspaceAtom);
  if (!workspace) return;

  const project = workspace.projects.find((item) => item.id === id);
  set(workspaceAtom, {
    ...workspace,
    activeProjectId: id,
    activeTeamId: project?.teamId ?? workspace.activeTeamId,
  });
  set(activeProjectIdAtom, id);
  set(activeTeamIdAtom, project?.teamId ?? workspace.activeTeamId);
});

const setActiveAgentTabAtom = atom(null, (get, set, id: string | null) => {
  const workspace = get(workspaceAtom);
  if (!workspace) return;
  set(workspaceAtom, { ...workspace, activeAgentTabId: id });
  set(activeAgentTabIdAtom, id);
});

const addProjectAtom = atom(
  null,
  async (_get, _set, payload: { name: string; teamName: string; color: string; projectPath: string }) => {
    await window.vibeAPI.team.create({
      name: payload.teamName,
      projectPath: payload.projectPath,
      projectName: payload.name,
      projectColor: payload.color,
    });
  }
);

const addAgentToTeamAtom = atom(
  null,
  async (get, set, { teamId, template }: { teamId: string; template: AgentTemplate }) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;

    const optimisticAgent: Agent = {
      id: uid(),
      name: template.name,
      role: template.role,
      catalogSlug: template.slug,
      initials: template.initials,
      status: "idle",
      color: template.color,
      bgColor: "bg-ide-indigo/10",
      borderColor: "border-ide-indigo/20",
      currentFiles: [],
    };

    set(workspaceAtom, {
      ...workspace,
      teams: workspace.teams.map((team) =>
        team.id === teamId ? { ...team, agents: [...team.agents, optimisticAgent] } : team
      ),
    });

    try {
      await window.vibeAPI.team.hire({
        teamId,
        agent: {
          name: template.name,
          role: template.role,
          catalogSlug: template.slug,
          systemPromptPath: template.systemPromptPath,
        },
      });
    } catch (error) {
      console.error("Failed to hire agent:", error);
      set(workspaceAtom, {
        ...workspace,
        teams: workspace.teams.map((team) =>
          team.id === teamId
            ? { ...team, agents: team.agents.filter((agent) => agent.id !== optimisticAgent.id) }
            : team
        ),
      });
    }
  }
);

const toggleTeamStatusAtom = atom(null, async (get, set, teamId: string) => {
  const workspace = get(workspaceAtom);
  if (!workspace) return;

  const team = workspace.teams.find((item) => item.id === teamId);
  const isPaused = team?.status === "paused";

  set(workspaceAtom, {
    ...workspace,
    teams: workspace.teams.map((item) =>
      item.id === teamId ? { ...item, status: item.status === "active" ? "paused" : "active" } : item
    ),
  });

  try {
    if (isPaused) {
      await window.vibeAPI.team.resume(teamId);
    } else {
      await window.vibeAPI.team.pause(teamId);
    }
  } catch (error) {
    console.error("Failed to toggle team status:", error);
  }
});

export const useWorkspaceSetActiveProject = () => {
  const setActiveProject = useSetAtom(setActiveProjectAtom);
  return useCallback(
    (id: string) => {
      setActiveProject(id);
    },
    [setActiveProject]
  );
};

export const useWorkspaceSetActiveAgentTab = () => {
  const setActiveAgentTab = useSetAtom(setActiveAgentTabAtom);
  return useCallback(
    (id: string | null) => {
      setActiveAgentTab(id);
    },
    [setActiveAgentTab]
  );
};

export const useWorkspaceToggleTeamStatus = () => {
  const toggleTeamStatus = useSetAtom(toggleTeamStatusAtom);
  return useCallback(
    (teamId: string) => {
      toggleTeamStatus(teamId);
    },
    [toggleTeamStatus]
  );
};

export const useWorkspaceSelectCeo = () => {
  const ceoAgent = useWorkspaceGlobalCeoAgent();
  const setActiveAgentTab = useWorkspaceSetActiveAgentTab();
  return useCallback(() => {
    setActiveAgentTab(ceoAgent.id);
  }, [ceoAgent.id, setActiveAgentTab]);
};

export const useWorkspaceAddProject = () => {
  const addProject = useSetAtom(addProjectAtom);
  return useCallback(
    (name: string, teamName: string, color: string, projectPath: string) => {
      return addProject({ name, teamName, color, projectPath });
    },
    [addProject]
  );
};

export const useWorkspaceAddAgentToTeam = () => {
  const addAgentToTeam = useSetAtom(addAgentToTeamAtom);
  return useCallback(
    (teamId: string, template: AgentTemplate) => {
      addAgentToTeam({ teamId, template });
    },
    [addAgentToTeam]
  );
};

export const useWorkspaceRegisterCeoHireRequest = () => {
  return useCallback((callback: () => void) => {
    ceoHireCallback = callback;
  }, []);
};

export const useWorkspaceEnterProject = () => {
  const workspace = useWorkspaceState();
  const setWorkspace = useSetAtom(workspaceAtom);
  const setActiveProjectId = useSetAtom(activeProjectIdAtom);
  const setActiveTeamId = useSetAtom(activeTeamIdAtom);
  const setActiveAgentTabId = useSetAtom(activeAgentTabIdAtom);
  const setSidebarView = useSetAtom(sidebarViewAtom);

  return useCallback(
    (id: string) => {
      const project = workspace.projects.find((item) => item.id === id);
      if (!project) return;

      const team = workspace.teams.find((item) => item.id === project.teamId);

      const nextAgentTabId = team?.techLeadAgentId || team?.agents[0]?.id || workspace.globalCeoAgent.id;
      setWorkspace({
        ...workspace,
        activeProjectId: id,
        activeTeamId: project.teamId,
        activeAgentTabId: nextAgentTabId,
      });
      setActiveProjectId(id);
      setActiveTeamId(project.teamId);
      setActiveAgentTabId(nextAgentTabId);
      setSidebarView('project');
    },
    [workspace, setWorkspace, setActiveProjectId, setActiveTeamId, setActiveAgentTabId, setSidebarView]
  );
};

export const useWorkspaceBackToRoot = () => {
  const workspace = useWorkspaceState();
  const setWorkspace = useSetAtom(workspaceAtom);
  const setActiveProjectId = useSetAtom(activeProjectIdAtom);
  const setActiveTeamId = useSetAtom(activeTeamIdAtom);
  const setActiveAgentTabId = useSetAtom(activeAgentTabIdAtom);
  const setSidebarView = useSetAtom(sidebarViewAtom);

  return useCallback(() => {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      activeProjectId: null,
      activeTeamId: null,
      activeAgentTabId: null,
    });
    setActiveProjectId(null);
    setActiveTeamId(null);
    setActiveAgentTabId(null);
    setSidebarView('root');
  }, [workspace, setWorkspace, setActiveProjectId, setActiveTeamId, setActiveAgentTabId, setSidebarView]);
};

function buildWorkspaceFromBackendTeams(backendTeams: BackendTeam[], previousWorkspace?: Workspace | null): Workspace {
  const teams = backendTeams.map(mapBackendTeamToFrontend);
  const projects = mapBackendTeamsToProjects(backendTeams);
  const workspace = createEmptyWorkspace();
  workspace.teams = teams;
  workspace.projects = projects;

  const previousActiveTeamId = previousWorkspace?.activeTeamId;
  const previousActiveProjectId = previousWorkspace?.activeProjectId;
  const previousActiveAgentTabId = previousWorkspace?.activeAgentTabId;

  workspace.activeTeamId =
    previousActiveTeamId && teams.some((team) => team.id === previousActiveTeamId)
      ? previousActiveTeamId
      : null;

  workspace.activeProjectId =
    previousActiveProjectId && projects.some((project) => project.id === previousActiveProjectId)
      ? previousActiveProjectId
      : null;

  const previousAgentStillExists =
    previousActiveAgentTabId &&
    (previousActiveAgentTabId === workspace.globalCeoAgent.id ||
      teams.some((team) => team.agents.some((agent) => agent.id === previousActiveAgentTabId)));

  if (previousAgentStillExists) {
    workspace.activeAgentTabId = previousActiveAgentTabId;
  } else {
    workspace.activeAgentTabId = null;
  }

  return workspace;
}

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const setWorkspace = useSetAtom(workspaceAtom);
  const setActiveProjectId = useSetAtom(activeProjectIdAtom);
  const setActiveTeamId = useSetAtom(activeTeamIdAtom);
  const setActiveAgentTabId = useSetAtom(activeAgentTabIdAtom);

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      try {
        const backendTeams = await window.vibeAPI.team.list();
        if (cancelled) return;
        setWorkspace((prev: Workspace | null) => {
          const nextWorkspace = buildWorkspaceFromBackendTeams(backendTeams as BackendTeam[], prev);
          setActiveProjectId(nextWorkspace.activeProjectId);
          setActiveTeamId(nextWorkspace.activeTeamId);
          setActiveAgentTabId(nextWorkspace.activeAgentTabId);
          return nextWorkspace;
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load teams:", error);
        setWorkspace(createEmptyWorkspace());
        setActiveProjectId(null);
        setActiveTeamId(null);
        setActiveAgentTabId(null);
      }
    }

    function handleTeamCreated() {
      void loadTeams();
    }

    function handleTeamUpdated() {
      void loadTeams();
    }

    function handleTeamDeleted() {
      void loadTeams();
    }

    function handleTeamAgentAdded(data: { teamId: string; agent: BackendAgent }) {
      const agent = mapBackendAgentToFrontend(data.agent);
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) =>
            team.id === data.teamId ? { ...team, agents: [...team.agents, agent] } : team
          ),
        };
      });
    }

    function handleTeamAgentRemoved(data: { teamId: string; agentId: string }) {
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) =>
            team.id === data.teamId
              ? { ...team, agents: team.agents.filter((agent) => agent.id !== data.agentId) }
              : team
          ),
        };
      });
    }

    function handleTeamPaused(data: { teamId: string }) {
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) => (team.id === data.teamId ? { ...team, status: "paused" } : team)),
        };
      });
    }

    function handleTeamResumed(data: { teamId: string }) {
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) => (team.id === data.teamId ? { ...team, status: "active" } : team)),
        };
      });
    }

    function handlePipelineStatusChanged(data: { teamId: string; tasks?: BackendPipelineTask[] }) {
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) =>
            team.id === data.teamId ? { ...team, pipeline: mapBackendPipelineToFrontend(data.tasks || []) } : team
          ),
        };
      });
    }

    function handleAgentStatus(data: { agentId: string; status: Agent["status"] }) {
      setWorkspace((prev: Workspace | null) => {
        if (!prev) return prev;

        if (data.agentId === prev.globalCeoAgent.id) {
          return {
            ...prev,
            globalCeoAgent: { ...prev.globalCeoAgent, status: data.status },
          };
        }

        return {
          ...prev,
          teams: prev.teams.map((team) => ({
            ...team,
            agents: team.agents.map((agent) => (agent.id === data.agentId ? { ...agent, status: data.status } : agent)),
          })),
        };
      });
    }

    function handleCeoAskHuman(data: { question: string }) {
      const hireKeywords = ["hire", "contratar", "agente", "equipe", "time", "membro", "contratação", "novo", "nova"];
      const isHireRequest = hireKeywords.some((keyword) => data.question.toLowerCase().includes(keyword));

      if (isHireRequest && ceoHireCallback) {
        ceoHireCallback();
      }
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
      window.vibeAPI.onAgentStatus(handleAgentStatus),
      window.vibeAPI.onCeoAskHuman(handleCeoAskHuman),
    ];

    void loadTeams();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      }
    };
  }, [setWorkspace, setActiveProjectId, setActiveTeamId, setActiveAgentTabId]);

  return <>{children}</>;
};
