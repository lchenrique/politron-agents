import { useState, useEffect, memo, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import TitleBar from "@/components/ide/TitleBar";
import AppSidebar from "@/components/ide/AppSidebar";
import { AgentChatShell } from "@/features/chat/components/shell/AgentChatShell";
import { ActiveSessionProvider } from "@/features/chat/context/ActiveSessionContext";
import { useOpencodeTranscriptBridge } from "@/features/chat/hooks/useOpencodeTranscriptBridge";
import TerminalPanel from "@/components/ide/TerminalPanel";
import AddProjectModal from "@/components/ide/AddProjectModal";
import HireAgentModal, { AgentModalMode } from "@/components/ide/HireAgentModal";
import PipelineKanban from "@/components/ide/PipelineKanban";
import SettingsScreen from "@/components/ide/SettingsScreen";
import {
  WorkspaceProvider,
  useWorkspaceActiveTeam,
  useWorkspaceActiveProjectView,
  useWorkspaceTeams,
  useWorkspaceAddAgentToTeam,
  useWorkspaceAddProject,
  useWorkspaceRegisterCeoHireRequest,
  useWorkspaceCreateTeamWithAgent,
} from "@/hooks/useWorkspace";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Card } from "@/components/ui/card";

const IDELayout = memo(() => {
  const location = useLocation();
  const chatBridge = useOpencodeTranscriptBridge();
  const activeTeam = useWorkspaceActiveTeam();
  const teams = useWorkspaceTeams();
  const addProject = useWorkspaceAddProject();
  const addAgentToTeam = useWorkspaceAddAgentToTeam();
  const createTeamWithAgent = useWorkspaceCreateTeamWithAgent();
  const onCeoHireRequest = useWorkspaceRegisterCeoHireRequest();
  const activeProjectView = useWorkspaceActiveProjectView();
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceMode, setMarketplaceMode] = useState<AgentModalMode>("add-to-project");
  const showSettings = location.pathname === "/settings";

  const showTerminal = terminalOpen;

  // Available teams for add-to-project mode
  const availableTeams = useMemo(() => teams.map((t) => ({
    id: t.id,
    name: t.name,
    projectName: t.agents[0]?.name,
  })), [teams]);

  // Register CEO hire request callback
  useEffect(() => {
    onCeoHireRequest(() => {
      setMarketplaceMode("add-to-project");
      setShowMarketplace(true);
    });
  }, [onCeoHireRequest]);

  const openMarketplaceCreateTeam = () => {
    setMarketplaceMode("create-team");
    setShowMarketplace(true);
  };

  const openMarketplaceAddToProject = () => {
    setMarketplaceMode("add-to-project");
    setShowMarketplace(true);
  };

  const handleHireAgent = useCallback(async (template: any, teamName?: string, projectPath?: string) => {
    if (marketplaceMode === "create-team" && teamName && projectPath) {
      await createTeamWithAgent(template, teamName, projectPath, "hsl(239 84% 67%)");
    } else if (activeTeam) {
      addAgentToTeam(activeTeam.id, template);
    }
  }, [marketplaceMode, createTeamWithAgent, activeTeam, addAgentToTeam]);

  const existingRoles = useMemo(() => activeTeam?.agents.map((a) => a.role) ?? [], [activeTeam?.agents]);

  return (
    <div className="w-full h-dvh flex flex-col text-foreground overflow-hidden font-sans">
      <TitleBar
        terminalOpen={terminalOpen}
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
            className="h-full"
          >
            <AppSidebar
              onAddProject={() => setShowAddProject(true)}
              onOpenMarketplaceAddToProject={openMarketplaceAddToProject}
            />
          </ResizablePanel>

          <ResizableHandle className="bg-transparent w-2 hover:bg-primary/20 transition-colors" />

          {/* MAIN CHAT CONTENT */}
          <ResizablePanel defaultSize={54} className="h-full">
            {showSettings ? (
              <SettingsScreen />
            ) : (
              <div className="h-full overflow-hidden p-3 pt-1">
                <Card className="h-full rounded-3xl overflow-hidden shadow-2xl relative">
                  {activeProjectView === "board" ? (
                    <PipelineKanban fullView />
                  ) : (
                    <AgentChatShell
                      activeAgent={chatBridge.activeAgent}
                      header={chatBridge.header}
                      sendMessage={chatBridge.sendMessage}
                    />
                  )}
                </Card>
              </div>
            )}
          </ResizablePanel>

          {showTerminal && (
            <>
              <ResizableHandle className="bg-transparent w-2 hover:bg-primary/20 transition-colors" />

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
        open={showMarketplace}
        mode={marketplaceMode}
        onClose={() => setShowMarketplace(false)}
        onHire={handleHireAgent}
        existingRoles={existingRoles}
        availableTeams={availableTeams}
      />
    </div>
  );
});

IDELayout.displayName = "IDELayout";

const Index = () => (
  <WorkspaceProvider>
    <ActiveSessionProvider>
      <IDELayout />
    </ActiveSessionProvider>
  </WorkspaceProvider>
);

export default Index;
