import React from "react";
import {
  ChevronLeft,
  MessageSquare,
  Plus,
  Settings,
  ShoppingBag,
  Target,
  Trash2,
} from "lucide-react";
import {
  useWorkspaceActiveAgentTabId,
  useWorkspaceActiveProjectId,
  useWorkspaceBackToRoot,
  useWorkspaceDeleteProject,
  useWorkspaceEnterProject,
  useWorkspaceSetActiveAgentTab,
  useWorkspaceSidebarView,
  useWorkspaceState,
} from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
  color?: string;
  className?: string;
}

const NavItem = ({ icon, label, active, onClick, badge, color, className }: NavItemProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm group transition-colors",
        active
          ? "bg-primary text-primary-foreground font-medium"
          : "hover:bg-accent/50 text-foreground",
        className
      )}
    >
      <div
        className={cn("shrink-0 group-hover:scale-110 transition-colors", active ? "text-primary-foreground" : "text-muted-foreground")}
        style={color ? { color } : {}}
      >
        {icon}
      </div>
      <span className={cn("flex-1 text-left truncate", className)}>{label}</span>
      {badge !== undefined && (
        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground")}>
          {badge}
        </span>
      )}
    </button>
  );
};

const SectionHeader = ({ label, onAction }: { label: string; onAction?: () => void }) => (
  <div className="flex items-center justify-between px-3 mr-1 mt-6 mb-2">
    <span className="text-[10px] font-bold text-foreground/70 uppercase tracking-widest">{label}</span>
    {onAction && (
      <button onClick={onAction} className="text-foreground/50 hover:text-primary transition-colors p-1 -mr-1">
        <Plus size={14} />
      </button>
    )}
  </div>
);

export const AppSidebar = ({
  onAddProject,
  onOpenMarketplaceAddToProject,
}: {
  onAddProject: () => void;
  onOpenMarketplaceAddToProject?: () => void;
}) => {
  const workspace = useWorkspaceState();
  const sidebarView = useWorkspaceSidebarView();
  const activeAgentTabId = useWorkspaceActiveAgentTabId();
  const activeProjectId = useWorkspaceActiveProjectId();
  const enterProject = useWorkspaceEnterProject();
  const backToRoot = useWorkspaceBackToRoot();
  const setActiveAgentTab = useWorkspaceSetActiveAgentTab();
  const deleteProject = useWorkspaceDeleteProject();

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId) ?? null;
  const activeTeam = workspace.teams.find((team) => team.id === workspace.activeTeamId) ?? null;

  return (
    <div className="w-full h-full flex flex-col z-20">

      <div className="flex-1 overflow-y-auto overflow-x-hidden pl-3 pr-0 py-3 custom-scrollbar">
        {sidebarView === "root" ? (
          <>
            <SectionHeader label="Global" />
            <div className="space-y-1">
              <NavItem
                icon={<MessageSquare size={18} />}
                label="Conversar com CEO"
                active={activeAgentTabId === workspace.globalCeoAgent.id}
                onClick={() => setActiveAgentTab(workspace.globalCeoAgent.id)}
                badge="Online"
              />
            </div>

            <SectionHeader label="Projetos" onAction={onAddProject} />
            <div className="space-y-1">
              {workspace.projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => enterProject(project.id)}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                  <span className="flex-1 text-sm text-foreground truncate">{project.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent/60 text-muted-foreground hover:text-destructive transition-all"
                    title="Deletar projeto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {workspace.projects.length === 0 && (
                <div className="px-3 py-4 text-center rounded-lg border border-dashed border-border/50">
                  <p className="text-[10px] text-muted-foreground italic">Nenhum projeto ainda</p>
                  <button onClick={onAddProject} className="mt-2 text-[10px] text-primary font-bold hover:underline">
                    + Criar Primeiro
                  </button>
                </div>
              )}
            </div>

            <SectionHeader label="Sistema" />
            <div className="space-y-1">
              <NavItem icon={<Settings size={18} />} label="Configurações" onClick={() => { }} />
            </div>
          </>
        ) : (
          <>
            <button
              onClick={backToRoot}
              className="flex items-center gap-2 mb-4 px-2 text-muted-foreground hover:text-primary group"
            >
              <ChevronLeft size={16} className="group-hover:-translate-x-0.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Voltar ao Início</span>
            </button>

            {activeProject && (
              <div className="px-3 mb-6 bg-primary/5 p-3 rounded-lg border border-primary/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ backgroundColor: activeProject.color }} />
                  <h2 className="text-xs font-bold text-foreground truncate">{activeProject.name}</h2>
                </div>
                {activeTeam?.projectPath && (
                  <div className="text-[10px] text-muted-foreground truncate font-mono bg-foreground/10 px-2 py-1 rounded" title={activeTeam.projectPath}>
                    {activeTeam.projectPath}
                  </div>
                )}
              </div>
            )}

            <SectionHeader label="Global" />
            <div className="space-y-1 mb-4">
              <NavItem
                icon={<MessageSquare size={18} />}
                label="CEO Global"
                active={activeAgentTabId === workspace.globalCeoAgent.id}
                onClick={() => setActiveAgentTab(workspace.globalCeoAgent.id)}
                badge="Online"
              />
            </div>

            <SectionHeader label="Time do Projeto" />
            <div className="space-y-1">
              {activeTeam?.agents.map((agent) => (
                <NavItem
                  key={agent.id}
                  icon={
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-xs"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.initials}
                    </div>
                  }
                  label={agent.name}
                  active={activeAgentTabId === agent.id}
                  onClick={() => setActiveAgentTab(agent.id)}
                  badge={agent.status === "running" ? "Ativo" : undefined}
                />
              ))}
              <NavItem
                icon={<ShoppingBag size={18} />}
                label="Mercado de Agentes"
                onClick={onOpenMarketplaceAddToProject}
              />
            </div>
          </>
        )}
      </div>


    </div>
  );
};

export default AppSidebar;
