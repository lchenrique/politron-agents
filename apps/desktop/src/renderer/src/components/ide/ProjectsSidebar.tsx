import { useWorkspace } from "@/hooks/useWorkspace";
import { Plus, Layout } from "lucide-react";

interface ProjectsSidebarProps {
 onAddProject: () => void;
}

const ProjectsSidebar = ({ onAddProject }: ProjectsSidebarProps) => {
 const { workspace, setActiveProject } = useWorkspace();

 return (
 <div className="w-[68px] flex flex-col shrink-0 overflow-hidden py-4 items-center bg-transparent">
 {/* Politron Logo / Main Icon */}
 <div className="mb-6">
 <div className="w-10 h-10 rounded-xl bg-ide-indigo/20 border border-ide-indigo/30 flex items-center justify-center text-ide-indigo ">
 <Layout className="w-5 h-5" />
 </div>
 </div>

 <div className="w-8 h-px bg-white/5 mb-6" />

 {/* Projects List */}
 <div className="flex-1 overflow-y-auto w-full px-2 flex flex-col items-center gap-3 scrollbar-none">
 <div className="w-full flex items-center justify-center">
 <button
 onClick={onAddProject}
 className="w-11 h-11 rounded-2xl bg-white/5 border border-dashed border-white/10 flex items-center justify-center text-ide-text-dim hover:border-ide-indigo/40 hover:text-ide-indigo hover:bg-ide-indigo/5 "
 title="Novo Projeto"
 >
 <Plus className="w-5 h-5" />
 </button>
 </div>

 {workspace.projects.map((p) => (
 <div key={p.id} className="group relative">
 <div
 onClick={() => setActiveProject(p.id)}
 className={`w-11 h-11 rounded-2xl flex items-center justify-center text-[13px] font-semibold cursor-pointer border ${
 workspace.activeProjectId === p.id
 ? "border-current bg-white/5 shadow-[0_0_15px_-5px_currentColor]"
 : "border-transparent hover:border-white/10 hover:bg-white/5"
 }`}
 style={{ color: p.color }}
 >
 {p.initials}
 </div>
 {/* Tooltip */}
 <div className="absolute left-[64px] top-1 bg-ide-surface-3 border border-ide-border rounded-lg px-3 py-2 text-[11px] shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none z-50 min-w-[200px] translate-x-[-10px] group-hover:translate-x-0">
 <div className="font-semibold text-ide-text mb-0.5">{p.name}</div>
 <div className="text-[10px] text-ide-text-dim">
 {workspace.teams.find((t) => t.id === p.teamId)?.name ?? "Sem time"}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
};

export default ProjectsSidebar;
