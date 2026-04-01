import { useState, useRef, useCallback, useEffect } from "react";
import TitleBar from "@/components/ide/TitleBar";
import AppSidebar from "@/components/ide/AppSidebar";
import ChatArea from "@/components/ide/ChatArea";
import TerminalPanel from "@/components/ide/TerminalPanel";
import AddProjectModal from "@/components/ide/AddProjectModal";
import HireAgentModal from "@/components/ide/HireAgentModal";
import { WorkspaceProvider, useWorkspace } from "@/hooks/useWorkspace";

const IDELayout = () => {
 const { 
 workspace, 
 activeTeam, 
 addProject, 
 addAgentToTeam, 
 onCeoHireRequest,
 enterProject 
 } = useWorkspace();
 const isWindows = window.vibeAPI.platform === "win32";
 const [terminalOpen, setTerminalOpen] = useState(true);
 const [terminalWidth, setTerminalWidth] = useState(320);
 const [activeTab, setActiveTab] = useState<"chat" | "board">("chat");
 const [showAddProject, setShowAddProject] = useState(false);
 const [showHireAgent, setShowHireAgent] = useState(false);
 const isResizing = useRef(false);
 const startX = useRef(0);
 const startW = useRef(0);

 // Register CEO hire request callback
 useEffect(() => {
 onCeoHireRequest(() => {
 setShowHireAgent(true);
 });
 }, [onCeoHireRequest]);

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
 className={`w-full h-dvh flex flex-col bg-transparent overflow-hidden min-h-[640px] border border-ide-border ${
 isWindows ? "rounded-none" : "rounded-[10px]"
 }`}
 >
 <TitleBar
 terminalOpen={terminalOpen}
 activeTab={activeTab}
 onTabChange={setActiveTab}
 onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
 className="glass-surface"
 />
 <div className="flex flex-1 overflow-hidden glass-surface">
 <div className="w-[260px] h-full shrink-0">
 <AppSidebar onAddProject={() => setShowAddProject(true)} />
 </div>
 <div className="flex-1 flex flex-col overflow-hidden p-3 pt-1">
 <div className="flex flex-1 overflow-hidden">
 <div className="flex-1 flex flex-col solid-chat-area overflow-hidden relative" style={{ borderRadius: '16px' }}>
 <ChatArea activeView={activeTab} />
 </div>
 {terminalOpen && (
 <>
 <div
 onMouseDown={handleMouseDown}
 className="w-1.5 bg-ide-border/30 cursor-col-resize shrink-0 hover:bg-ide-indigo "
 />
 <div
 className="glass-panel border-l border-ide-border/50 flex flex-col overflow-hidden"
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
 onHire={(template) => activeTeam && addAgentToTeam(activeTeam.id, template)}
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
