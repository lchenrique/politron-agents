import { useState, useRef, useEffect } from "react";
import { Send, Plus, Globe } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";

const ChatArea = () => {
  const { workspace, activeTeam, setActiveAgentTab, sendMessage } = useWorkspace();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCeoActive = workspace.activeAgentTabId === workspace.globalCeoAgent.id;
  const messageKey = isCeoActive ? workspace.globalCeoAgent.id : activeTeam?.id;
  const teamMessages = messageKey ? (workspace.messages[messageKey] ?? []) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [teamMessages.length]);

  const handleSend = () => {
    if (!message.trim() || !messageKey) return;
    sendMessage(messageKey, message.trim());
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
    <div className="flex-1 flex flex-col overflow-hidden min-w-[300px]">
      <div className="flex items-center border-b border-ide-border px-3 gap-0.5 bg-ide-surface h-[38px] shrink-0">
        {agentTabs.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setActiveAgentTab(agent.id)}
            className={`relative px-3 h-[38px] flex items-center gap-1.5 text-xs cursor-pointer border-b-2 transition-colors whitespace-nowrap ${
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

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-thin">
        {teamMessages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.isUser ? "flex-row-reverse" : ""}`}>
            <div
              className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5 border"
              style={{
                background: msg.agentColor.replace(")", " / 0.1)").replace("hsl(", "hsl("),
                color: msg.agentColor,
                borderColor: msg.agentColor.replace(")", " / 0.2)").replace("hsl(", "hsl("),
              }}
            >
              {msg.agentInitials}
            </div>
            <div className="max-w-[75%]">
              <div className={`text-[10px] text-ide-text-dim mb-0.5 ${msg.isUser ? "text-right" : ""}`}>
                {msg.agentName}
              </div>
              <div className={`text-[13px] leading-relaxed rounded-lg px-3 py-2 ${
                msg.isUser
                  ? "bg-[hsl(240,30%,12%)] border border-ide-indigo/15 text-ide-text/90"
                  : "bg-ide-surface-2 border border-ide-border text-ide-text/80"
              }`}>
                {msg.text}
              </div>
              {msg.diff && (
                <div className="mt-2 border border-ide-border rounded-md overflow-hidden">
                  <div className="bg-ide-surface-2 px-2.5 py-1.5 flex items-center gap-2 border-b border-ide-border">
                    <span className="text-[11px] font-mono text-ide-text-muted">{msg.diff.filename}</span>
                    <span className="ml-auto text-[10px] font-mono">
                      <span className="text-ide-green-bright">+{msg.diff.additions}</span>{" "}
                      <span className="text-ide-red-bright">-{msg.diff.deletions}</span>
                    </span>
                  </div>
                  <div className="text-[11px] font-mono">
                    {msg.diff.lines.map((line, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 px-2.5 py-px ${
                          line.type === "add" ? "bg-[hsl(145,60%,8%)] text-ide-green-bright" :
                          line.type === "rem" ? "bg-[hsl(0,60%,10%)] text-ide-red-bright" :
                          "text-ide-text-dim"
                        }`}
                      >
                        <span className="opacity-50 select-none w-2.5 shrink-0">
                          {line.type === "add" ? "+" : line.type === "rem" ? "-" : " "}
                        </span>
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isCeoActive && activeTeam && activeTeam.pipeline.length > 0 && (
        <div className="border-t border-ide-border px-4 py-2 flex items-center gap-2 bg-ide-surface shrink-0">
          <div className="text-[10px] text-ide-text-dim tracking-wider uppercase whitespace-nowrap">pipeline</div>
          <div className="flex gap-1 flex-1 overflow-hidden">
            {activeTeam.pipeline.map((task) => {
              const statusMap: Record<string, string> = {
                running: "border-ide-green/20 bg-ide-green/5 text-ide-green-bright",
                done: "border-ide-indigo/20 bg-ide-indigo/5 text-ide-indigo",
                waiting: "border-ide-amber/20 bg-ide-amber/5 text-ide-amber-bright",
                pending: "border-ide-text-dim/20 bg-ide-text-dim/5 text-ide-text-dim",
                failed: "border-ide-red/20 bg-ide-red/5 text-ide-red-bright",
                blocked: "border-ide-indigo/20 bg-ide-indigo/5 text-ide-indigo",
              };
              const dotMap: Record<string, string> = {
                running: "bg-ide-green",
                done: "bg-ide-indigo",
                waiting: "bg-ide-amber",
                pending: "bg-ide-text-dim",
                failed: "bg-ide-red",
                blocked: "bg-ide-indigo",
              };

              return (
                <div key={task.id} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] whitespace-nowrap border ${statusMap[task.status]}`}>
                  <div className={`w-[5px] h-[5px] rounded-full ${dotMap[task.status]}`} />
                  {task.agentInitials} · {task.description}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-4 bg-ide-bg shrink-0">
        <div className="bg-ide-surface-2 border border-ide-text-dim/20 rounded-2xl flex flex-col p-4 gap-3 transition-all focus-within:border-ide-text-dim/30 focus-within:shadow-[0_0_0_4px_hsl(239_84%_67%/0.06)]">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isCeoActive ? "Converse com o CEO global..." : "O que você quer construir hoje?"}
            rows={1}
            className="w-full text-[15px] text-ide-text bg-transparent border-none outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px] placeholder:text-ide-text-dim/50 font-sans"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2 items-center">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ide-surface-3 border border-ide-text-dim/15 text-xs text-ide-text-muted cursor-pointer hover:bg-ide-surface-2 hover:border-ide-text-dim/25 hover:text-ide-text/70 transition-all">
                <Plus className="w-3.5 h-3.5 opacity-60" /> Arquivo
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ide-surface-3 border border-ide-text-dim/15 text-xs text-ide-text-muted cursor-pointer hover:bg-ide-surface-2 hover:border-ide-text-dim/25 hover:text-ide-text/70 transition-all">
                <Globe className="w-3.5 h-3.5 opacity-60" /> URL
              </button>
            </div>
            <button
              onClick={handleSend}
              className="w-8 h-8 rounded-lg bg-ide-indigo flex items-center justify-center cursor-pointer shrink-0 hover:opacity-90 hover:scale-105 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
