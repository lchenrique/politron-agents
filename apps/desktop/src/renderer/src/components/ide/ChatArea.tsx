import AssistantChatThread from "./AssistantChatThread";
import PipelineKanban from "./PipelineKanban";
import { useWorkspace } from "@/hooks/useWorkspace";

interface ChatAreaProps {
 activeView: "chat" | "board";
}

const ChatArea = ({ activeView }: ChatAreaProps) => {
 const { workspace, activeTeam, setActiveAgentTab, sendMessage } = useWorkspace();

 const isCeoActive = workspace.activeAgentTabId === workspace.globalCeoAgent.id;
 const currentAgentId = workspace.activeAgentTabId;
 const chatMessages = currentAgentId ? (workspace.messages[currentAgentId] ?? []) : [];

 // Get agent activity for current tab
 const agentActivity = currentAgentId ? workspace.agentActivities[currentAgentId] : undefined;

 if (!activeTeam && !isCeoActive) {
 return (
 <div className="flex-1 flex items-center justify-center text-ide-text-dim text-sm">
 Selecione um projeto para começar
 </div>
 );
 }

 const agentTabs = isCeoActive
 ? [workspace.globalCeoAgent, ...(activeTeam?.agents ?? [])]
 : activeTeam?.agents ?? [];

 return (
 <div className="flex-1 flex flex-col overflow-hidden min-w-[300px] h-full">
 {/* 
 Only show agent tabs in Chat mode. 
 Board mode is a global pipeline view for the team.
 */}
 {activeView === "chat" && (
 <div className="flex items-center border-b border-ide-border/50 px-3 gap-0.5 bg-background h-[38px] shrink-0 sticky top-0 z-10">
 {agentTabs.map((agent) => (
 <button
 key={agent.id}
 onClick={() => setActiveAgentTab(agent.id)}
 className={`relative px-3 h-[38px] flex items-center gap-1.5 text-xs cursor-pointer border-b-2 whitespace-nowrap ${
 workspace.activeAgentTabId === agent.id
 ? "text-ide-text"
 : "text-ide-text-dim border-b-transparent hover:text-ide-text-muted"
 }`}
 style={workspace.activeAgentTabId === agent.id ? { borderBottomColor: agent.color } : { borderBottomColor: "transparent" }}
 >
 {agent.status === "waiting" && (
 <div className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-ide-amber" />
 )}
 <div
 className="w-4 h-4 rounded-[3px] flex items-center justify-center text-[9px] font-medium"
 style={{
 background: agent.color.replace(")", " / 0.12)").replace("hsl(", "hsl("),
 color: agent.color,
 }}
 >
 {agent.initials}
 </div>
 {agent.id === workspace.globalCeoAgent.id
 ? "CEO"
 : agent.isTeamLead
 ? "Líder"
 : agent.name.split(" ")[0]}
 </button>
 ))}
 <span className="text-ide-text-dim/40 cursor-pointer px-2 ml-1 text-base hover:text-ide-text-dim">+</span>
 </div>
 )}

 <div className="flex-1 relative overflow-hidden flex flex-col">
 {activeView === "chat" ? (
 currentAgentId && (
 <AssistantChatThread
 messageKey={currentAgentId}
 messages={chatMessages}
 activeAgentId={currentAgentId}
 activeAgentInitials={workspace.activeAgentTabId === workspace.globalCeoAgent.id ? "AO" : "AI"}
 isRunning={!!agentActivity && agentActivity.activity !== "idle"}
 activity={agentActivity}
 placeholder={isCeoActive ? "Converse com o CEO global..." : "O que você quer construir hoje?"}
 onSendMessage={sendMessage}
 />
 )
 ) : (
 <div className="flex-1 overflow-auto bg-background animate-in fade-in zoom-in-95 ">
 <PipelineKanban fullView />
 </div>
 )}
 </div>

 {/* Mini-Pipeline strip only in Chat mode and if not CEO view */}
 {activeView === "chat" && !isCeoActive && activeTeam && activeTeam.pipeline.length > 0 && (
 <div className="h-12 shrink-0 border-t border-ide-border/50 bg-transparent px-4 flex items-center gap-2">
 <span className="text-[9px] text-ide-text-dim uppercase tracking-widest font-bold">Pipeline</span>
 <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
 {activeTeam.pipeline.slice(0, 5).map(task => (
 <div key={task.id} className="px-2 py-1 rounded bg-ide-surface-2 border border-ide-border text-[10px] text-ide-text-dim whitespace-nowrap">
 {task.description.slice(0, 20)}...
 </div>
 ))}
 </div>
 <button 
 onClick={() => { /* Handled via parent tab change if we had state here, but for now just visual */ }}
 className="text-[10px] text-ide-indigo hover:underline px-2"
 >
 Ver Board
 </button>
 </div>
 )}
 </div>
 );
};

export default ChatArea;
