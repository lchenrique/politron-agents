import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { 
  Plus, 
  Mic, 
  ArrowUp, 
  Zap, 
  Sparkles, 
  ChevronDown, 
  AtSign,
  Terminal,
  Paperclip,
  Users,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { activeAgentTeamAtom, activeAgentAtom, activeAgentTabIdAtom } from "@/hooks/atoms";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { MentionMenu } from "./MentionMenu";

interface PromptInputProps {
  onSend: (message: string) => void;
  onAttach?: () => void;
  onMention?: () => void;
  onSlashCommand?: () => void;
}

interface ModelOption {
  id: string;
  providerID: string;
  name: string;
}

const SUGGESTIONS = [
  "Explique este código",
  "Implemente testes unitários",
  "Refatore para SOLID",
  "Adicione documentação JSDoc",
];

// Provider display metadata
const PROVIDER_META: Record<string, { color: string; icon: React.ComponentType<any> }> = {
  anthropic: { color: "text-orange-400", icon: Sparkles },
  openai: { color: "text-green-400", icon: Sparkles },
  google: { color: "text-blue-400", icon: Zap },
  deepseek: { color: "text-purple-400", icon: Sparkles },
  mistral: { color: "text-amber-400", icon: Zap },
};

function getProviderColor(providerID: string): string {
  return PROVIDER_META[providerID]?.color ?? "text-white/50";
}

function getProviderIcon(providerID: string): React.ComponentType<any> {
  return PROVIDER_META[providerID]?.icon ?? Sparkles;
}

function groupByProvider(models: ModelOption[]): Record<string, ModelOption[]> {
  return models.reduce<Record<string, ModelOption[]>>((acc, model) => {
    if (!acc[model.providerID]) acc[model.providerID] = [];
    acc[model.providerID].push(model);
    return acc;
  }, {});
}

export const PromptInput: React.FC<PromptInputProps> = ({ 
  onSend,
  onAttach,
  onMention,
  onSlashCommand 
}) => {
  const [text, setText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Menu states
  const [slashMenu, setSlashMenu] = useState({ isOpen: false, query: "", pos: { x: 0, y: 0 } });
  const [mentionMenu, setMentionMenu] = useState({ isOpen: false, query: "", pos: { x: 0, y: 0 } });

  const activeTeam = useAtomValue(activeAgentTeamAtom);
  const activeAgent = useAtomValue(activeAgentAtom);
  const setActiveAgentId = useSetAtom(activeAgentTabIdAtom);

  // Expanded state — keep expanded while any dropdown is open
  const isExpanded = isFocused || text.length > 0 || isModelDropdownOpen || isAgentDropdownOpen;

  // Load models from OpenCode
  useEffect(() => {
    const api = (window as any).vibeAPI;
    if (!api?.opencode?.listModels) return;

    setIsLoadingModels(true);
    api.opencode.listModels()
      .then((result: ModelOption[]) => {
        setModels(result);
        // Initialize selection: prefer activeAgent's saved model, else first available
        if (result.length > 0) {
          const agentModel = activeAgent?.llmModel
            ? result.find(m => m.id === (activeAgent as any).llmModel?.modelID)
            : null;
          setSelectedModel(agentModel ?? result[0]);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingModels(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When active agent changes, sync model selection
  useEffect(() => {
    if (!activeAgent || models.length === 0) return;
    const agentModel = (activeAgent as any).llmModel;
    if (agentModel?.modelID) {
      const match = models.find(m => m.id === agentModel.modelID);
      if (match) setSelectedModel(match);
    }
  }, [activeAgent, models]);

  const handleModelSelect = useCallback((model: ModelOption) => {
    setSelectedModel(model);

    // Persist the selection to agent config
    const api = (window as any).vibeAPI;
    if (!api?.team?.updateAgent || !activeTeam?.id || !activeAgent?.id) return;

    api.team.updateAgent(activeTeam.id, activeAgent.id, {
      llmModel: { modelID: model.id, providerID: model.providerID }
    }).catch(console.error);
  }, [activeTeam, activeAgent]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    
    // Check menu triggers
    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const words = textBeforeCursor.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('/')) {
      const rect = e.target.getBoundingClientRect();
      setSlashMenu({ isOpen: true, query: lastWord.slice(1), pos: { x: rect.left, y: rect.top } });
      setMentionMenu(prev => ({ ...prev, isOpen: false }));
    } else if (lastWord.startsWith('@')) {
      const rect = e.target.getBoundingClientRect();
      setMentionMenu({ isOpen: true, query: lastWord.slice(1), pos: { x: rect.left, y: rect.top } });
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
    } else {
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      setMentionMenu(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleSend = useCallback(() => {
    if (text.trim()) {
      onSend(text);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [onSend, text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenu.isOpen || mentionMenu.isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertMenuText = (prefix: string, replacement: string) => {
    const cursor = textareaRef.current?.selectionStart || text.length;
    const textBeforeCursor = text.slice(0, cursor);
    const words = textBeforeCursor.split(/\s/);
    const lastWord = words[words.length - 1];
    
    if (lastWord.startsWith(prefix)) {
      const startOfWord = cursor - lastWord.length;
      const before = text.slice(0, startOfWord);
      const after = text.slice(cursor);
      setText(before + replacement + " " + after);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursor = startOfWord + replacement.length + 1;
          textareaRef.current.selectionStart = newCursor;
          textareaRef.current.selectionEnd = newCursor;
        }
      }, 0);
    }
  };

  const handleSelectSlash = (item: any) => {
    insertMenuText('/', item.name);
    setSlashMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleSelectMention = (item: any) => {
    insertMenuText('@', `@${item.name}`);
    setMentionMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleMentionClick = () => {
    if (onMention) onMention();
    setText(prev => prev + (prev && !prev.endsWith(' ') ? ' @' : '@'));
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        const rect = textareaRef.current?.getBoundingClientRect();
        if (rect) setMentionMenu({ isOpen: true, query: "", pos: { x: rect.left, y: rect.top } });
      }, 50);
    }
  };

  const handleSlashClick = () => {
    if (onSlashCommand) onSlashCommand();
    setText(prev => prev + (prev && !prev.endsWith(' ') ? ' /' : '/'));
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        const rect = textareaRef.current?.getBoundingClientRect();
        if (rect) setSlashMenu({ isOpen: true, query: "", pos: { x: rect.left, y: rect.top } });
      }, 50);
    }
  };

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [text]);

  const grouped = groupByProvider(models);

  const ModelIcon = selectedModel ? getProviderIcon(selectedModel.providerID) : Sparkles;
  const modelColor = selectedModel ? getProviderColor(selectedModel.providerID) : "text-white/50";

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-4">
      {/* Suggestions Chips (Visible only when expanded) */}
      <div 
        className={cn(
          "flex flex-wrap justify-center gap-2 transition-all duration-500",
          isExpanded ? "opacity-100 transform translate-y-0" : "opacity-0 pointer-events-none transform translate-y-4 max-h-0"
        )}
      >
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setText(suggestion)}
            className="px-4 py-1.5 rounded-full bg-white/3 border border-white/5 text-[11px] font-medium text-white/50 hover:bg-white/8 hover:border-white/10 hover:text-white transition-all backdrop-blur-md"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Main Container */}
      <div 
        className={cn(
          "relative w-full transition-all duration-500 ease-in-out bg-zinc-950/40 border backdrop-blur-2xl overflow-hidden rounded-[28px]",
          isExpanded 
            ? "border-white/10 ring-1 ring-white/5" 
            : "border-white/5"
        )}
      >
        {/* Input Area */}
        <div className="flex items-center px-5 py-3.5">
          {/* Attach Button */}
          <button 
            onClick={onAttach}
            className={cn(
              "p-2 rounded-full hover:bg-white/5 text-white/30 hover:text-white/60 transition-all shrink-0",
              !isExpanded && "hidden"
            )}
          >
            <Paperclip size={18} />
          </button>

          {/* Simple Plus Icon (Simple mode) */}
          <button 
            className={cn(
              "p-2 rounded-full text-white/20 hover:text-white/40 transition-all shrink-0",
              isExpanded && "hidden"
            )}
            onClick={() => setIsFocused(true)}
          >
            <Plus size={20} />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={isExpanded ? "O que você precisa fazer?" : "Como posso ajudar?"}
            className={cn(
              "flex-1 bg-transparent border-none focus:ring-0 outline-none resize-none py-2 px-3 text-[15px] text-white placeholder:text-white/20 scrollbar-none transition-all",
              isExpanded ? "min-h-[48px]" : "min-h-[24px]"
            )}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className={cn(
              "p-2.5 rounded-full transition-all shrink-0",
              text.trim()
                ? "bg-white text-black scale-100 hover:scale-105"
                : "bg-white/5 text-white/10 scale-95"
            )}
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Toolbar (Visible only when expanded) */}
        <div 
          className={cn(
            "flex items-center justify-between px-5 pb-4 transition-all duration-300 border-t border-white/3 pt-3",
            isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none h-0 p-0 overflow-hidden"
          )}
        >
          <div className="flex items-center gap-2">
            {/* LLM Model Selector */}
            <DropdownMenu open={isModelDropdownOpen} onOpenChange={setIsModelDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/3 border border-white/5 hover:bg-white/8 hover:border-white/10 transition-all group">
                  {isLoadingModels ? (
                    <Loader2 size={14} className="text-white/40 animate-spin" />
                  ) : (
                    <ModelIcon size={14} className={modelColor} />
                  )}
                  <span className="text-[11px] font-semibold text-white/60 group-hover:text-white/90 max-w-[120px] truncate">
                    {isLoadingModels ? "Carregando..." : (selectedModel?.name ?? "Selecionar Modelo")}
                  </span>
                  <ChevronDown size={12} className="text-white/20 group-hover:text-white/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="start" 
                className="bg-zinc-900 border-white/10 text-white min-w-64 max-h-80 overflow-y-auto rounded-2xl shadow-2xl backdrop-blur-xl p-1.5"
              >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-2">
                  Modelos Disponíveis
                </DropdownMenuLabel>
                {models.length === 0 && !isLoadingModels && (
                  <div className="px-3 py-4 text-center text-xs text-white/30">
                    Nenhum modelo disponível
                  </div>
                )}
                {Object.entries(grouped).map(([providerID, providerModels], idx) => (
                  <React.Fragment key={providerID}>
                    {idx > 0 && <DropdownMenuSeparator className="bg-white/5 my-1" />}
                    <DropdownMenuLabel className="text-[9px] uppercase tracking-widest text-white/20 px-3 py-1.5">
                      {providerID}
                    </DropdownMenuLabel>
                    {providerModels.map(m => {
                      const Icon = getProviderIcon(m.providerID);
                      const color = getProviderColor(m.providerID);
                      const isActive = selectedModel?.id === m.id;
                      return (
                        <DropdownMenuItem 
                          key={m.id}
                          onClick={() => handleModelSelect(m)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group",
                            isActive && "bg-white/8"
                          )}
                        >
                          <Icon size={14} className={cn(color, "shrink-0")} />
                          <span className="text-xs font-medium truncate">{m.name}</span>
                          {isActive && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Agent Selector */}
            <DropdownMenu open={isAgentDropdownOpen} onOpenChange={setIsAgentDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/3 border border-white/5 hover:bg-white/8 hover:border-white/10 transition-all group">
                  <Users size={14} className="text-indigo-400" />
                  <span className="text-[11px] font-semibold text-white/60 group-hover:text-white/90">
                    {activeAgent?.name || "CEO Global"}
                  </span>
                  <ChevronDown size={12} className="text-white/20 group-hover:text-white/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-zinc-900 border-white/10 text-white min-w-64 rounded-2xl shadow-2xl backdrop-blur-xl p-1.5">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-white/30 px-3 py-2">Agentes do Time</DropdownMenuLabel>
                {activeTeam?.agents.map(agent => (
                  <DropdownMenuItem 
                    key={agent.id}
                    onClick={() => setActiveAgentId(agent.id)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group",
                      activeAgent?.id === agent.id && "bg-white/5"
                    )}
                  >
                    <div className="w-2.5 h-2.5 rounded-full ring-2 ring-white/5 shrink-0" style={{ backgroundColor: agent.color }} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium truncate">{agent.name}</span>
                      <span className="text-[10px] text-white/40 truncate">{agent.role}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/5 my-1.5" />
                <DropdownMenuItem 
                  onClick={() => setActiveAgentId("ceo-global")}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors group",
                    activeAgent?.id === "ceo-global" && "bg-white/5"
                  )}
                >
                  <Sparkles size={16} className="text-amber-400 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">CEO Global</span>
                    <span className="text-[10px] text-white/40">Visão sistêmica e orquestração</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Utility Icons */}
          <div className="flex items-center gap-1.5">
            <button 
              onClick={handleMentionClick}
              className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-all"
              title="Mencionar (@)"
            >
              <AtSign size={16} />
            </button>
            <button 
              onClick={handleSlashClick}
              className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-all"
              title="Comandos (/)"
            >
              <Terminal size={16} />
            </button>
            <div className="w-px h-4 bg-white/5 mx-1" />
            <button 
              className="p-2 rounded-full hover:bg-white/8 text-white/20 hover:text-white/60 transition-all"
              title="Voice Input"
            >
              <Mic size={18} />
            </button>
          </div>
        </div>
      </div>

      <SlashCommandMenu
        isOpen={slashMenu.isOpen}
        position={slashMenu.pos}
        searchQuery={slashMenu.query}
        onSelect={handleSelectSlash}
        onClose={() => setSlashMenu(prev => ({ ...prev, isOpen: false }))}
      />
      
      <MentionMenu
        isOpen={mentionMenu.isOpen}
        position={mentionMenu.pos}
        searchQuery={mentionMenu.query}
        onSelect={handleSelectMention}
        onClose={() => setMentionMenu(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

PromptInput.displayName = "PromptInput";
