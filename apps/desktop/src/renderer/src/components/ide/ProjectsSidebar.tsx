import { useWorkspace } from "@/hooks/useWorkspace";

interface ProjectsSidebarProps {
  onAddProject: () => void;
}

const ProjectsSidebar = ({ onAddProject }: ProjectsSidebarProps) => {
  const { workspace, setActiveProject } = useWorkspace();

  return (
    <div className="w-[60px] bg-ide-bg border-r border-ide-border flex flex-col shrink-0 overflow-hidden">
      <div className="h-[38px] flex items-center justify-center border-b border-ide-border shrink-0">
        <button
          onClick={onAddProject}
          className="w-9 h-9 rounded-lg bg-ide-surface border border-dashed border-ide-text-dim/30 flex items-center justify-center text-ide-text-dim text-lg font-light hover:border-ide-indigo hover:text-ide-indigo hover:bg-ide-surface-2 transition-all cursor-pointer"
        >
          +
        </button>
      </div>
      <div className="p-2 flex flex-col gap-1.5">
        {workspace.projects.map((p) => (
          <div key={p.id} className="group relative">
            <div
              onClick={() => setActiveProject(p.id)}
              className={`w-11 h-11 rounded-[10px] flex items-center justify-center text-[13px] font-medium cursor-pointer border transition-all ${
                workspace.activeProjectId === p.id
                  ? "border-current bg-current/5"
                  : "border-transparent hover:border-ide-text-dim/20"
              }`}
              style={{ color: p.color }}
            >
              {p.initials}
            </div>
            <div className="absolute left-[54px] top-0 bg-ide-surface-3 border border-ide-border rounded-md px-2.5 py-2 text-[11px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 min-w-[220px] max-w-[320px]">
              <div className="font-medium text-ide-text">{p.name}</div>
              <div className="text-[10px] text-ide-text-dim">
                {workspace.teams.find((t) => t.id === p.teamId)?.name ?? ""}
              </div>
              <div className="mt-1 text-[10px] text-ide-text-dim/80 break-all">
                {workspace.teams.find((t) => t.id === p.teamId)?.projectPath ?? ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectsSidebar;
