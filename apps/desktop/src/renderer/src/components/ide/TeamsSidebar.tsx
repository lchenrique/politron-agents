import { useWorkspace } from "@/hooks/useWorkspace";

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
  const { workspace, activeTeam, toggleTeamStatus, setActiveAgentTab, selectCeo } = useWorkspace();

  return (
    <div className="w-[220px] bg-ide-surface border-r border-ide-border flex flex-col shrink-0 overflow-hidden">
      {/* CEO Block */}
      <div className="p-3 border-b border-ide-border shrink-0">
        <div className="text-[10px] text-ide-text-dim tracking-widest uppercase mb-1.5">CEO</div>
        <div
          onClick={selectCeo}
          className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-colors border ${
            workspace.activeAgentTabId === workspace.globalCeoAgent.id
              ? "bg-ide-indigo/10 border-ide-indigo"
              : "bg-ide-surface-2 border-ide-indigo-border hover:bg-ide-surface-3"
          }`}
        >
          <div className="w-7 h-7 rounded-md bg-ide-indigo/10 border border-ide-indigo/30 flex items-center justify-center text-[11px] font-medium text-ide-indigo shrink-0">
            {workspace.globalCeoAgent.initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-ide-text">{workspace.globalCeoAgent.name}</div>
            <div className="text-[10px] text-ide-text-dim">empresa inteira</div>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-ide-green shadow-[0_0_5px_hsl(var(--ide-green))] ml-auto shrink-0" />
        </div>
      </div>

      {/* Teams */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        <div className="text-[10px] text-ide-text-dim tracking-widest uppercase px-1 pb-1.5">Times</div>
        {workspace.teams.map((team) => (
          <div key={team.id} className="mb-2">
            <div
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-ide-surface-2 mb-0.5 group"
              onClick={() => toggleTeamStatus(team.id)}
            >
              <div className="w-[3px] h-3.5 rounded-sm shrink-0" style={{ background: team.color }} />
              <div className="text-xs font-medium text-ide-text/75">{team.name}</div>
              {team.status === "active" && <div className="w-[5px] h-[5px] rounded-full bg-ide-green shrink-0" />}
              {team.status === "paused" && <div className="text-[10px] text-ide-text-dim ml-auto">pausado</div>}
            </div>
            {team.status === "active" && team.agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setActiveAgentTab(agent.id)}
                className={`flex items-center gap-1.5 py-1.5 px-1.5 pl-4 rounded-md cursor-pointer mb-px transition-colors ${
                  workspace.activeAgentTabId === agent.id
                    ? "bg-ide-surface-2 border border-ide-border"
                    : "hover:bg-ide-surface-2 border border-transparent"
                }`}
              >
                <div
                  className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-[10px] font-medium shrink-0 border"
                  style={{
                    background: agent.color.replace(")", " / 0.1)").replace("hsl(", "hsl("),
                    color: agent.color,
                    borderColor: agent.color.replace(")", " / 0.2)").replace("hsl(", "hsl("),
                  }}
                >
                  {agent.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ide-text/80 truncate">{agent.name}</div>
                  <div className="text-[10px] text-ide-text-dim truncate">
                    {agent.isTeamLead ? "líder do time" : agent.currentFiles[0] ?? agent.role}
                  </div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusClasses[agent.status] ?? ""}`} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-ide-border p-3 shrink-0">
        <div className="text-[10px] text-ide-text-dim mb-1.5 font-mono">
          {activeTeam?.projectPath ?? "~/projects"}
        </div>
        <button
          onClick={onHireAgent}
          className="w-full py-1.5 bg-transparent border border-ide-border rounded-md text-ide-text-dim text-[11px] cursor-pointer hover:border-ide-indigo-border hover:text-ide-indigo hover:bg-ide-indigo/5 transition-all"
        >
          + contratar agente
        </button>
      </div>
    </div>
  );
};

export default TeamsSidebar;
