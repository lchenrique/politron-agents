import {
  useWorkspaceActiveAgentTabId,
  useWorkspaceActiveTeam,
  useWorkspaceGlobalCeoAgent,
  useWorkspaceSelectCeo,
  useWorkspaceSetActiveAgentTab,
  useWorkspaceSetActiveProject,
  useWorkspaceTeams,
  useWorkspaceToggleTeamStatus,
} from "@/hooks/useWorkspace";
import { Plus } from "lucide-react";

const statusClasses: Record<string, string> = {
  running: "bg-ide-green shadow-[0_0_4px_hsl(var(--ide-green))]",
  waiting: "bg-ide-amber",
  idle: "bg-ide-text-dim/40",
  blocked: "bg-ide-indigo",
  done: "bg-ide-green",
  error: "bg-ide-red",
};

interface TeamsSidebarProps {
  onHireAgent: () => void;
}

const TeamsSidebar = ({ onHireAgent }: TeamsSidebarProps) => {
  const teams = useWorkspaceTeams();
  const activeTeam = useWorkspaceActiveTeam();
  const activeAgentTabId = useWorkspaceActiveAgentTabId();
  const globalCeoAgent = useWorkspaceGlobalCeoAgent();
  const toggleTeamStatus = useWorkspaceToggleTeamStatus();
  const setActiveAgentTab = useWorkspaceSetActiveAgentTab();
  const setActiveProject = useWorkspaceSetActiveProject();
  const selectCeo = useWorkspaceSelectCeo();

  return (
    <div className="w-[240px] flex flex-col shrink-0 overflow-hidden bg-transparent">
      <div className="p-4 border-b border-white/5 shrink-0">
        <div className="text-[10px] text-ide-text-dim/60 tracking-[0.2em] font-semibold uppercase mb-3 px-1">CEO</div>
        <div
          onClick={selectCeo}
          className={`flex items-center gap-3 rounded-xl p-2.5 cursor-pointer border ${
            activeAgentTabId === globalCeoAgent.id
              ? "bg-ide-indigo/10 border-ide-indigo/40 ring-1 ring-ide-indigo/20"
              : "bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10"
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-ide-indigo/10 border border-ide-indigo/30 flex items-center justify-center text-[12px] font-bold text-ide-indigo shrink-0">
            {globalCeoAgent.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ide-text/90">{globalCeoAgent.name}</div>
            <div className="text-[10px] text-ide-text-dim/80">Diretoria Executiva</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-ide-green shadow-[0_0_8px_hsl(var(--ide-green))] ml-auto shrink-0" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-none">
        <div className="text-[10px] text-ide-text-dim/60 tracking-[0.2em] font-semibold uppercase px-2 pb-3 mt-2">
          Nossas Equipes
        </div>
        {teams.map((team) => (
          <div key={team.id} className="mb-4">
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/3 mb-1 group "
              onClick={() => toggleTeamStatus(team.id)}
            >
              <div className="w-1 h-4 rounded-full shrink-0" style={{ background: team.color }} />
              <div className="text-[11px] font-semibold text-ide-text/80">{team.name}</div>
              {team.status === "active" && (
                <div className="w-1.5 h-1.5 rounded-full bg-ide-green/80 shrink-0 shadow-[0_0_4px_hsl(var(--ide-green-bright)/0.5)]" />
              )}
              {team.status === "paused" && (
                <div className="text-[9px] text-ide-text-dim/60 font-mono ml-auto">PAUSADO</div>
              )}
            </div>

            <div className="space-y-0.5">
              {team.status === "active" &&
                team.agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => {
                      setActiveAgentTab(agent.id);
                      setActiveProject(team.id);
                    }}
                    className={`flex items-center gap-2.5 py-2 px-2.5 pl-5 rounded-xl cursor-pointer border ${
                      activeAgentTabId === agent.id
                        ? "bg-white/5 border-white/10 translate-x-1"
                        : "hover:bg-white/3 border-transparent"
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0 border relative"
                      style={{
                        background: `hsla(${agent.color.match(/\d+/g)?.[0] || 0}, ${
                          agent.color.match(/\d+/g)?.[1] || 0
                        }%, ${agent.color.match(/\d+/g)?.[2] || 0}%, 0.1)`,
                        color: agent.color,
                        borderColor: `hsla(${agent.color.match(/\d+/g)?.[0] || 0}, ${
                          agent.color.match(/\d+/g)?.[1] || 0
                        }%, ${agent.color.match(/\d+/g)?.[2] || 0}%, 0.25)`,
                      }}
                    >
                      {agent.initials}
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-ide-bg ${
                          statusClasses[agent.status] || "bg-ide-text-dim"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-ide-text/90 truncate">{agent.name}</div>
                      <div className="text-[9px] text-ide-text-dim/70 truncate flex items-center gap-1">
                        {agent.isTeamLead && (
                          <span className="text-[8px] px-1 bg-ide-indigo/10 text-ide-indigo rounded-sm border border-ide-indigo/20">
                            LEAD
                          </span>
                        )}
                        {agent.currentFiles[0] || agent.role}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 pt-1 shrink-0 bg-transparent">
        <div className="text-[9px] text-ide-text-dim/40 mb-3 font-mono truncate px-1 opacity-60">
          {activeTeam?.projectPath || "~/workspace"}
        </div>
        <button
          onClick={onHireAgent}
          className="w-full py-2 bg-white/3 hover:bg-white/8 border border-white/5 rounded-xl text-ide-text/70 text-[11px] font-medium cursor-pointer flex items-center justify-center gap-2 group"
        >
          <Plus className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 " />
          Novo Agente
        </button>
      </div>
    </div>
  );
};

export default TeamsSidebar;
