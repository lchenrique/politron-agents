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
  Loader2,
  Search
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
  onSend: (message: string, options?: { model?: { modelID: string, providerID: string } }) => void;
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
  const [modelSearchQuery, setModelSearchQuery] = useState("");
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
      onSend(text, {
        model: selectedModel ? { modelID: selectedModel.id, providerID: selectedModel.providerID } : undefined
      });
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [onSend, text, selectedModel]);

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

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    m.providerID.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );

  const grouped = groupByProvider(filteredModels);

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
            className="px-4 py-1.5 rounded-full bg-input/10 border border-input/20 text-[11px] font-medium text-foreground/60 hover:bg-input/20 hover:border-input/30 hover:text-foreground transition-all backdrop-blur-md"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Main Container */}
      <div
        className={cn(
          "relative w-full transition-all duration-500 ease-in-out  overflow-hidden rounded-[28px]",
          "field-sizing-content  border bg-transparent  dark:bg-input/30",
          isExpanded
            ? "border-input/50 dark:border-input/40 ring-1 ring-input/20"
            : "border-input/30 dark:border-input/20"
        )}
      >
        {/* Input Area */}
        <div className="flex items-center px-5 py-3.5">
          {/* Attach Button */}
          <button
            onClick={onAttach}
            className={cn(
              "p-2 rounded-full hover:bg-input/20 text-foreground/40 hover:text-foreground/70 transition-all shrink-0",
              !isExpanded && "hidden"
            )}
          >
            <Paperclip size={18} />
          </button>

          {/* Simple Plus Icon (Simple mode) */}
          <button
            className={cn(
              "p-2 rounded-full text-foreground/30 hover:text-foreground/50 transition-all shrink-0",
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
              "flex-1 bg-transparent border-none focus:ring-0 outline-none resize-none py-2 px-3 text-[15px]",
              "text-foreground placeholder:text-foreground/40 transition-colors",
              "focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
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
                ? "bg-foreground text-background scale-100 hover:scale-105"
                : "bg-foreground/10 text-foreground/30 scale-95"
            )}
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Toolbar (Visible only when expanded) */}
        <div
          className={cn(
            "flex items-center justify-between px-5 pb-4 transition-all duration-300 border-t border-input/10 pt-3",
            isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none h-0 p-0 overflow-hidden"
          )}
        >
          <div className="flex items-center gap-2">
            {/* LLM Model Selector */}
            <DropdownMenu
              open={isModelDropdownOpen}
              onOpenChange={(open) => {
                setIsModelDropdownOpen(open);
                if (!open) setModelSearchQuery("");
              }}
            >
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-input/20 border border-input/30 hover:bg-input/30 hover:border-input/40 transition-all group">
                  {isLoadingModels ? (
                    <Loader2 size={14} className="text-foreground/50 animate-spin" />
                  ) : (
                    <ModelIcon size={14} className={modelColor} />
                  )}
                  <span className="text-[11px] font-semibold text-foreground/70 group-hover:text-foreground/90 max-w-[120px] truncate">
                    {isLoadingModels ? "Carregando..." : (selectedModel?.name ?? "Selecionar Modelo")}
                  </span>
                  <ChevronDown size={12} className="text-foreground/30 group-hover:text-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="bg-popover border-input text-popover-foreground min-w-64 max-h-80 overflow-y-auto rounded-2xl shadow-2xl backdrop-blur-xl p-1.5"
              >
                <div className="p-2 border-b border-input/20 sticky top-0 bg-popover/95 backdrop-blur-sm z-10 -mx-1.5 -mt-1.5 mb-1.5 rounded-t-2xl">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/50" />
                    <input
                      autoFocus
                      type="text"
                      value={modelSearchQuery}
                      onChange={e => setModelSearchQuery(e.target.value)}
                      placeholder="Buscar modelo..."
                      className="w-full bg-input/20 border border-input/30 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-input/40 transition-all"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                </div>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-foreground/40 px-3 py-2">
                  Modelos Disponíveis
                </DropdownMenuLabel>
                {models.length === 0 && !isLoadingModels && (
                  <div className="px-3 py-4 text-center text-xs text-foreground/40">
                    Nenhum modelo disponível
                  </div>
                )}
                {Object.entries(grouped).map(([providerID, providerModels], idx) => (
                  <React.Fragment key={providerID}>
                    {idx > 0 && <DropdownMenuSeparator className="bg-input/20 my-1" />}
                    <DropdownMenuLabel className="text-[9px] uppercase tracking-widest text-foreground/30 px-3 py-1.5">
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
                            "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-input/20 transition-colors group",
                            isActive && "bg-input/30"
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
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-input/20 border border-input/30 hover:bg-input/30 hover:border-input/40 transition-all group">
                  <Users size={14} className="text-indigo-400" />
                  <span className="text-[11px] font-semibold text-foreground/70 group-hover:text-foreground/90">
                    {activeAgent?.name || "CEO Global"}
                  </span>
                  <ChevronDown size={12} className="text-foreground/30 group-hover:text-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover border-input text-popover-foreground min-w-64 rounded-2xl shadow-2xl backdrop-blur-xl p-1.5">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-foreground/40 px-3 py-2">Agentes do Time</DropdownMenuLabel>
                {activeTeam?.agents.map(agent => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => setActiveAgentId(agent.id)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-input/20 transition-colors group",
                      activeAgent?.id === agent.id && "bg-input/20"
                    )}
                  >
                    <div className="w-2.5 h-2.5 rounded-full ring-2 ring-input/30 shrink-0" style={{ backgroundColor: agent.color }} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium truncate">{agent.name}</span>
                      <span className="text-[10px] text-foreground/50 truncate">{agent.role}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-input/20 my-1.5" />
                <DropdownMenuItem
                  onClick={() => setActiveAgentId("ceo-global")}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-input/20 transition-colors group",
                    activeAgent?.id === "ceo-global" && "bg-input/20"
                  )}
                >
                  <Sparkles size={16} className="text-amber-400 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">CEO Global</span>
                    <span className="text-[10px] text-foreground/50">Visão sistêmica e orquestração</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Utility Icons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleMentionClick}
              className="p-2 rounded-lg hover:bg-input/20 text-foreground/40 hover:text-foreground/70 transition-all"
              title="Mencionar (@)"
            >
              <AtSign size={16} />
            </button>
            <button
              onClick={handleSlashClick}
              className="p-2 rounded-lg hover:bg-input/20 text-foreground/40 hover:text-foreground/70 transition-all"
              title="Comandos (/)"
            >
              <Terminal size={16} />
            </button>
            <div className="w-px h-4 bg-input/20 mx-1" />
            <button
              className="p-2 rounded-full hover:bg-input/20 text-foreground/30 hover:text-foreground/70 transition-all"
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
