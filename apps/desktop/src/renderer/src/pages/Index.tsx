import { useState, useRef, useCallback } from "react";
import TitleBar from "@/components/ide/TitleBar";
import ProjectsSidebar from "@/components/ide/ProjectsSidebar";
import TeamsSidebar from "@/components/ide/TeamsSidebar";
import ChatArea from "@/components/ide/ChatArea";
import TerminalPanel from "@/components/ide/TerminalPanel";
import AddProjectModal from "@/components/ide/AddProjectModal";
import HireAgentModal from "@/components/ide/HireAgentModal";
import { WorkspaceProvider, useWorkspace } from "@/hooks/useWorkspace";

const IDELayout = () => {
  const { workspace, activeTeam, addProject, addAgentToTeam } = useWorkspace();
  const isWindows = window.vibeAPI.platform === "win32";
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalWidth, setTerminalWidth] = useState(320);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showHireAgent, setShowHireAgent] = useState(false);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startW.current = terminalWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - ev.clientX;
      setTerminalWidth(Math.min(600, Math.max(200, startW.current + delta)));
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [terminalWidth]);

  return (
    <>
      <div
        className={`w-full h-dvh flex flex-col bg-ide-bg overflow-hidden min-h-[640px] border border-ide-border ${
          isWindows ? "rounded-none" : "rounded-[10px]"
        }`}
      >
        <TitleBar terminalOpen={terminalOpen} onToggleTerminal={() => setTerminalOpen(!terminalOpen)} />
        <div className="flex flex-1 overflow-hidden">
          <ProjectsSidebar onAddProject={() => setShowAddProject(true)} />
          <TeamsSidebar onHireAgent={() => setShowHireAgent(true)} />
          <div className="flex-1 flex flex-col bg-ide-bg overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              <ChatArea />
              {terminalOpen && (
                <>
                  <div
                    onMouseDown={handleMouseDown}
                    className="w-1.5 bg-ide-border cursor-col-resize shrink-0 hover:bg-ide-indigo transition-colors"
                  />
                  <div
                    className="bg-ide-surface border-l border-ide-border flex flex-col overflow-hidden"
                    style={{ width: terminalWidth, minWidth: 200, maxWidth: 600 }}
                  >
                    <TerminalPanel />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddProjectModal
        open={showAddProject}
        onClose={() => setShowAddProject(false)}
        onAdd={addProject}
      />
      <HireAgentModal
        open={showHireAgent}
        onClose={() => setShowHireAgent(false)}
        onHire={(idx) => activeTeam && addAgentToTeam(activeTeam.id, idx)}
        existingRoles={activeTeam?.agents.map((a) => a.role) ?? []}
      />
    </>
  );
};

const Index = () => (
  <WorkspaceProvider>
    <IDELayout />
  </WorkspaceProvider>
);

export default Index;
