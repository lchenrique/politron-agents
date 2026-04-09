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
  activeProjectViewAtom,
  activeProjectIdAtom,
  activeTeamAtom,
  activeTeamIdAtom,
  globalAgentsAtom,
  globalCeoAgentAtom,
  projectsAtom,
  settingsSectionAtom,
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
          projectViews: Object.fromEntries(
            Object.entries(workspace.projectViews).filter(([key]) => key !== projectId)
          ),
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
  title?: string;
  description: string;
  requesterAgentId?: string;
  requesterAgentName?: string;
  createdByAgentId?: string;
  createdByAgentName?: string;
  responsibleAgentRole?: string;
  priority?: string;
  context?: string;
  acceptanceCriteria?: string[];
  files: string[];
  status: "backlog" | "triage" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
  dependsOn: string[];
  branchName?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: string;
  observations?: string;
  blockedReason?: string;
  artifacts?: string[];
  history?: Array<{
    id: string;
    timestamp: string;
    status: "backlog" | "triage" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
    actorAgentId?: string;
    actorAgentName?: string;
    note?: string;
  }>;
}

function mapBackendAgentToFrontend(backend: BackendAgent): Agent {
  const catalogEntry = AGENT_CATALOG.find((entry) => entry.role === backend.role);
  return {
    id: backend.id,
    name: backend.name,
    role: backend.role,
    catalogSlug: backend.catalogSlug,
    systemPromptPath: backend.systemPromptPath,
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
    title: task.title || task.description,
    description: task.description,
    requesterAgentId: task.requesterAgentId,
    requesterAgentName: task.requesterAgentName,
    createdByAgentId: task.createdByAgentId,
    createdByAgentName: task.createdByAgentName,
    responsibleAgentRole: task.responsibleAgentRole,
    priority: task.priority,
    context: task.context,
    acceptanceCriteria: task.acceptanceCriteria || [],
    files: task.files,
    dependsOn: task.dependsOn,
    status: task.status,
    branchName: task.branchName,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    error: task.error,
    result: task.result,
    observations: task.observations,
    blockedReason: task.blockedReason,
    artifacts: task.artifacts || [],
    history: task.history,
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
  name: "CEO Global",
  catalogSlug: "ceo",
  systemPromptPath: ".opencode/agents/ceo.md",
  role: "ceo",
  initials: "CEO",
  status: "running",
  color: "hsl(239 84% 67%)",
  bgColor: "bg-ide-indigo/10",
  borderColor: "border-ide-indigo/20",
  currentFiles: [],
};

const defaultHrGlobal: Agent = {
  id: "hr-global",
  name: "RH Global",
  catalogSlug: "hr-global",
  systemPromptPath: ".opencode/agents/hr-global.md",
  role: "hr",
  initials: "RH",
  status: "running",
  color: "hsl(198 89% 48%)",
  bgColor: "bg-sky-500/10",
  borderColor: "border-sky-500/20",
  currentFiles: [],
};

const defaultGlobalAgents: Agent[] = [defaultCeo, defaultHrGlobal];

function createEmptyWorkspace(): Workspace {
  return {
    globalAgents: defaultGlobalAgents,
    globalCeoAgent: defaultCeo,
    teams: [],
    projects: [],
    activeProjectId: null,
    activeTeamId: null,
    activeAgentTabId: null,
    projectViews: {},
  };
}

const EMPTY_WORKSPACE = createEmptyWorkspace();

export const useWorkspaceState = () => useAtomValue(workspaceAtom) ?? EMPTY_WORKSPACE;

export const useWorkspaceProjects = () => useAtomValue(projectsAtom);

export const useWorkspaceTeams = () => useAtomValue(teamsAtom);

export const useWorkspaceGlobalAgents = () =>
  useAtomValue(globalAgentsAtom) ?? EMPTY_WORKSPACE.globalAgents;

export const useWorkspaceGlobalCeoAgent = () =>
  useAtomValue(globalCeoAgentAtom) ?? EMPTY_WORKSPACE.globalCeoAgent;

export const useWorkspaceActiveProjectId = () => useAtomValue(activeProjectIdAtom);

export const useWorkspaceActiveProjectView = () => useAtomValue(activeProjectViewAtom);

export const useWorkspaceActiveAgentTabId = () => {
  const workspace = useAtomValue(workspaceAtom);
  return workspace?.activeAgentTabId ?? null;
};

export const useWorkspaceSidebarView = () => useAtomValue(sidebarViewAtom);

export const useWorkspaceSettingsSection = () => useAtomValue(settingsSectionAtom);

export const useWorkspaceSetSidebarView = () => {
  const setSidebarView = useSetAtom(sidebarViewAtom);
  return useCallback(
    (view: "root" | "project" | "settings") => {
      setSidebarView(view);
    },
    [setSidebarView]
  );
};

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

const setActiveProjectViewAtom = atom(
  null,
  (get, set, payload: { projectId?: string | null; view: "chat" | "board" }) => {
    const workspace = get(workspaceAtom);
    if (!workspace) return;

    const projectId = payload.projectId ?? workspace.activeProjectId;
    if (!projectId) return;

    set(workspaceAtom, {
      ...workspace,
      projectViews: {
        ...workspace.projectViews,
        [projectId]: payload.view,
      },
    });
  }
);

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
    // Não fazer update otimístico - o evento team:agent-added vai atualizar o workspace
    try {
      await window.vibeAPI.team.hire({
        teamId,
        agent: {
          name: template.name,
          role: template.role,
          catalogSlug: template.slug,
          systemPromptPath: template.systemPromptPath,
          color: template.color,
          initials: template.initials,
        },
      });
      // O evento team:agent-added do backend vai disparar e atualizar o workspace
    } catch (error) {
      console.error("Failed to hire agent:", error);
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

export const useWorkspaceSetActiveProjectView = () => {
  const setActiveProjectView = useSetAtom(setActiveProjectViewAtom);
  return useCallback(
    (view: "chat" | "board", projectId?: string | null) => {
      setActiveProjectView({ view, projectId });
    },
    [setActiveProjectView]
  );
};

export const useWorkspaceSetSettingsSection = () => {
  const setSettingsSection = useSetAtom(settingsSectionAtom);
  return useCallback(
    (section: "defaults" | "providers" | "mcp" | "permissions" | "tools" | "advanced") => {
      setSettingsSection(section);
    },
    [setSettingsSection]
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

export const useWorkspaceCreateTeamWithAgent = () => {
  const setWorkspace = useSetAtom(workspaceAtom);
  const addAgentToTeam = useSetAtom(addAgentToTeamAtom);
  
  return useCallback(
    async (template: AgentTemplate, teamName: string, projectPath: string, color: string) => {
      // Create team via API
      const teamResult = await window.vibeAPI.team.create({
        name: teamName,
        projectPath: projectPath,
        projectName: teamName,
        projectColor: color,
      });
      
      // The team.create will emit an event that updates workspace
      // For now, we need to hire the agent after team creation
      // Wait a bit for the team to be created and fetched
      return new Promise<void>((resolve) => {
        setTimeout(async () => {
          const teams = await window.vibeAPI.team.list();
          const createdTeam = (teams as BackendTeam[]).find((t) => t.name === teamName);
          if (createdTeam) {
            addAgentToTeam({ teamId: createdTeam.id, template });
          }
          resolve();
        }, 500);
      });
    },
    [setWorkspace, addAgentToTeam]
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
      const nextProjectViews = {
        ...workspace.projectViews,
        [id]: workspace.projectViews[id] ?? "chat",
      };
      setWorkspace({
        ...workspace,
        activeProjectId: id,
        activeTeamId: project.teamId,
        activeAgentTabId: nextAgentTabId,
        projectViews: nextProjectViews,
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

  workspace.projectViews = Object.fromEntries(
    Object.entries(previousWorkspace?.projectViews ?? {}).filter(([projectId]) =>
      projects.some((project) => project.id === projectId)
    )
  ) as Record<string, "chat" | "board">;

  const previousAgentStillExists =
    previousActiveAgentTabId &&
    (workspace.globalAgents.some((agent) => agent.id === previousActiveAgentTabId) ||
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

        if (prev.globalAgents.some((agent) => agent.id === data.agentId)) {
          const globalAgents = prev.globalAgents.map((agent) =>
            agent.id === data.agentId ? { ...agent, status: data.status } : agent
          );
          const globalCeoAgent = globalAgents.find((agent) => agent.id === prev.globalCeoAgent.id) ?? prev.globalCeoAgent;
          return {
            ...prev,
            globalAgents,
            globalCeoAgent,
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
