import React from "react";
import { 
 BarChart3, 
 Briefcase, 
 ChevronLeft, 
 LayoutDashboard, 
 Plus, 
 Search, 
 Settings, 
 Users, 
 Target,
 ShoppingBag,
 MessageSquare
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";

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
 className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm group ${
 active 
 ? "bg-ide-indigo/10 text-ide-indigo" 
 : "text-ide-text-dim hover:bg-white/5 hover:text-ide-text"
 } ${className}`}
 >
 <div className={`shrink-0 group-hover:scale-110 ${active ? "text-ide-indigo" : "text-ide-text-dim"}`} style={color ? { color } : {}}>
 {icon}
 </div>
 <span className="flex-1 text-left truncate font-medium">{label}</span>
 {badge !== undefined && (
 <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-ide-text-dim group-hover:bg-ide-indigo group-hover:text-white ">
 {badge}
 </span>
 )}
 </button>
 );
};

const SectionHeader = ({ label, onAction }: { label: string; onAction?: () => void }) => (
 <div className="flex items-center justify-between px-3 mt-6 mb-2">
 <span className="text-[10px] font-bold text-ide-text-dim/40 uppercase tracking-widest">{label}</span>
 {onAction && (
 <button 
 onClick={onAction}
 className="text-ide-text-dim/40 hover:text-ide-indigo "
 >
 <Plus size={14} />
 </button>
 )}
 </div>
);

export const AppSidebar = ({ onAddProject }: { onAddProject: () => void }) => {
  const { 
  workspace, 
  sidebarView, 
  enterProject, 
  backToRoot,
  setActiveAgentTab
  } = useWorkspace();

 if (!workspace) return null;

 return (
 <div className="w-[260px] h-full flex flex-col glass-sidebar border-r border-ide-border/10 z-20">
 {/* Header / Brand */}
 <div className="h-14 flex items-center px-4 gap-3">
 <div className="w-8 h-8 rounded-lg bg-ide-indigo flex items-center justify-center shadow-lg shadow-ide-indigo/20">
 <Target className="text-white" size={18} />
 </div>
 <div className="flex flex-col">
 <span className="text-sm font-bold text-ide-text tracking-tight">POLITRON</span>
 <span className="text-[10px] text-ide-text-dim font-medium uppercase tracking-tighter opacity-50">Enterprise AI</span>
 </div>
 </div>

  <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar">
  {sidebarView === "root" ? (
  <>
  {/* 1. Global AI Assistants Section */}
  <SectionHeader label="Global" />
  <div className="space-y-1">
  <NavItem 
  icon={<MessageSquare size={18} className="text-ide-indigo" />} 
  label="Conversar com CEO" 
  active={workspace.activeAgentTabId === workspace.globalCeoAgent.id}
  onClick={() => setActiveAgentTab(workspace.globalCeoAgent.id)}
  badge="Online"
  />
  <NavItem 
  icon={<ShoppingBag size={18} />} 
  label="Mercado de Agentes" 
  onClick={() => {}}
  />
  </div>
 
  {/* 2. Projects Section */}
  <SectionHeader label="Projetos" onAction={onAddProject} />
  <div className="space-y-1">
  {workspace.projects.map((project) => (
  <NavItem
  key={project.id}
  icon={<div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />}
  label={project.name}
  onClick={() => enterProject(project.id)}
  />
  ))}
  
  {workspace.projects.length === 0 && (
  <div className="px-3 py-4 text-center rounded-lg border border-dashed border-ide-border/50">
  <p className="text-[10px] text-ide-text-dim italic">Nenhum projeto ainda</p>
  <button 
  onClick={onAddProject}
  className="mt-2 text-[10px] text-ide-indigo font-bold hover:underline"
  >
  + Criar Primeiro
  </button>
  </div>
  )}
  </div>
 
  {/* 3. Settings */}
  <SectionHeader label="Sistema" />
  <div className="space-y-1">
  <NavItem icon={<Settings size={18} />} label="Configurações" onClick={() => {}} />
  </div>
  </>
  ) : (
  <>
  <button 
  onClick={backToRoot}
  className="flex items-center gap-2 mb-4 px-2 text-ide-text-dim hover:text-ide-indigo group"
  >
  <ChevronLeft size={16} className="group-hover:-translate-x-0.5" />
  <span className="text-[10px] font-bold uppercase tracking-wider">Voltar ao Início</span>
  </button>
 
  {/* Current Project Info */}
  {workspace.projects.find(p => p.id === workspace.activeProjectId) && (
  <div className="px-3 mb-6 bg-ide-indigo/5 p-3 rounded-lg border border-ide-indigo/10">
  <div className="flex items-center gap-2">
  <div 
  className="w-2.5 h-2.5 rounded-full shadow-sm" 
  style={{ backgroundColor: workspace.projects.find(p => p.id === workspace.activeProjectId)?.color }}
  />
  <h2 className="text-xs font-bold text-ide-text truncate">
  {workspace.projects.find(p => p.id === workspace.activeProjectId)?.name}
  </h2>
  </div>
  </div>
  )}
 
  <SectionHeader label="Time do Projeto" />
  <div className="space-y-1">
  {workspace.teams.find(t => t.id === workspace.activeTeamId)?.agents.map(agent => (
  <NavItem
  key={agent.id}
  icon={
  <div 
  className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
  style={{ backgroundColor: agent.color }}
  >
  {agent.initials}
  </div>
  }
  label={agent.name}
  active={workspace.activeAgentTabId === agent.id}
  onClick={() => setActiveAgentTab(agent.id)}
  badge={agent.status === "running" ? "Ativo" : undefined}
  />
  ))}
  </div>
  </>
  )}
  </div>

 {/* User / Settings Footer */}
 <div className="p-3 border-t border-ide-border/30 bg-transparent">
 <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group">
 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-ide-indigo to-ide-purple flex items-center justify-center">
 <span className="text-xs font-bold text-white">LC</span>
 </div>
 <div className="flex flex-1 flex-col overflow-hidden">
 <span className="text-xs font-bold text-ide-text truncate group-hover:text-ide-indigo ">Luis Henrique</span>
 <span className="text-[10px] text-ide-text-dim truncate">Product Owner</span>
 </div>
 <Settings size={14} className="text-ide-text-dim opacity-0 group-hover:opacity-100 " />
 </div>
 </div>
 </div>
 );
};

export default AppSidebar;
