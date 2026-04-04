import { useState, useEffect, memo } from "react";
import TitleBar from "@/components/ide/TitleBar";
import AppSidebar from "@/components/ide/AppSidebar";
import { AgentChatShell } from "@/features/chat/components/shell/AgentChatShell";
import { ActiveSessionProvider } from "@/features/chat/context/ActiveSessionContext";
import TerminalPanel from "@/components/ide/TerminalPanel";
import AddProjectModal from "@/components/ide/AddProjectModal";
import HireAgentModal from "@/components/ide/HireAgentModal";
import {
  WorkspaceProvider,
  useWorkspaceActiveTeam,
  useWorkspaceAddAgentToTeam,
  useWorkspaceAddProject,
  useWorkspaceRegisterCeoHireRequest,
} from "@/hooks/useWorkspace";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const IDELayout = memo(() => {
  const activeTeam = useWorkspaceActiveTeam();
  const addProject = useWorkspaceAddProject();
  const addAgentToTeam = useWorkspaceAddAgentToTeam();
  const onCeoHireRequest = useWorkspaceRegisterCeoHireRequest();
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "board">("chat");
  const [showAddProject, setShowAddProject] = useState(false);
  const [showHireAgent, setShowHireAgent] = useState(false);

  const showTerminal = terminalOpen;

  // Register CEO hire request callback
  useEffect(() => {
    onCeoHireRequest(() => {
      setShowHireAgent(true);
    });
  }, [onCeoHireRequest]);

  return (
    <div className="w-full h-dvh flex flex-col bg-background text-foreground overflow-hidden font-sans">
      <TitleBar
        terminalOpen={terminalOpen}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
        className="glass-surface border-b border-border/10"
      />
      
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* SIDEBAR PANEL */}
          <ResizablePanel 
            defaultSize={18} 
            minSize={12} 
            maxSize={25}
            className="h-full border-r border-border/10"
          >
            <AppSidebar onAddProject={() => setShowAddProject(true)} />
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border/10 hover:bg-primary/20 transition-colors" />

          {/* MAIN CHAT CONTENT */}
          <ResizablePanel defaultSize={54} className="h-full">
            <div className="h-full overflow-hidden p-3 pt-1">
              <div className="h-full border border-border/20 rounded-3xl overflow-hidden shadow-2xl relative">
                <ActiveSessionProvider>
                  <AgentChatShell />
                </ActiveSessionProvider>
              </div>
            </div>
          </ResizablePanel>

          {showTerminal && (
            <>
              <ResizableHandle withHandle className="bg-border/10 hover:bg-primary/20 transition-colors" />
              
              {/* TERMINAL PANEL */}
              <ResizablePanel 
                defaultSize={28} 
                minSize={15} 
                maxSize={45}
                className="h-full"
              >
                <div className="h-full pl-0 p-3 pt-1">
                   <TerminalPanel />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>

      {/* MODALS */}
      <AddProjectModal
        open={showAddProject}
        onClose={() => setShowAddProject(false)}
        onAdd={addProject}
      />
      <HireAgentModal
        open={showHireAgent}
        onClose={() => setShowHireAgent(false)}
        onHire={(template) => activeTeam && addAgentToTeam(activeTeam.id, template)}
        existingRoles={activeTeam?.agents.map((a) => a.role) ?? []}
      />
    </div>
  );
});

IDELayout.displayName = "IDELayout";

const Index = () => (
  <WorkspaceProvider>
    <IDELayout />
  </WorkspaceProvider>
);

export default Index;
