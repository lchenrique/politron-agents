import { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, Search, Loader2, FolderOpen, Users, Plus } from "lucide-react";

interface AgentTemplate {
  slug: string;
  name: string;
  description: string;
  mode: string;
  color: string;
  initials: string;
  role: string;
  systemPromptPath: string;
}

export type AgentModalMode = "add-to-project" | "create-team";

interface HireAgentModalProps {
  open: boolean;
  mode: AgentModalMode;
  onClose: () => void;
  onHire: (agent: AgentTemplate, teamName?: string, projectPath?: string) => void;
  existingRoles: string[];
  availableTeams?: Array<{ id: string; name: string; projectName?: string }>;
}

const PROJECT_COLORS = [
  "hsl(239 84% 67%)", "hsl(38 92% 50%)", "hsl(174 62% 47%)",
  "hsl(330 81% 60%)", "hsl(142 71% 45%)", "hsl(280 67% 60%)",
  "hsl(200 80% 55%)", "hsl(0 72% 51%)",
];

const AgentItem = memo(({ 
  agent, 
  isAlreadyHired, 
  isDisabled, 
  mode, 
  onClick 
}: { 
  agent: AgentTemplate; 
  isAlreadyHired: boolean; 
  isDisabled: boolean; 
  mode: AgentModalMode; 
  onClick: () => void;
}) => {
  const bgColor = agent.color.includes('hsl') 
    ? agent.color.replace('hsl(', 'hsl(').replace(')', ' / 0.12)')
    : agent.color;
  
  const borderColor = agent.color.includes('hsl')
    ? agent.color.replace('hsl(', 'hsl(').replace(')', ' / 0.2)')
    : agent.color;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        isDisabled
        ? "border-border/50 opacity-40 cursor-not-allowed"
        : "border-border hover:border-primary/50 hover:bg-white/5 cursor-pointer"
      }`}
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border"
        style={{
          background: bgColor,
          color: agent.color,
          borderColor: borderColor,
        }}
      >
        {agent.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground font-semibold tracking-tight">{agent.name}</div>
        <div className="text-[10px] text-muted-foreground/70 truncate leading-relaxed">{agent.description}</div>
      </div>
      <div className="shrink-0 flex items-center px-2">
        {isAlreadyHired ? (
          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/40 bg-muted px-2 py-0.5 rounded-full">contratado</span>
        ) : (
          <span className="text-[9px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {mode === "create-team" ? "novo time" : "adicionar"}
          </span>
        )}
      </div>
    </div>
  );
});

AgentItem.displayName = "AgentItem";

const HireAgentModal = ({ 
  open, 
  mode, 
  onClose, 
  onHire, 
  existingRoles,
  availableTeams = [] 
}: HireAgentModalProps) => {
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Create team mode state
  const [teamName, setTeamName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  
  // Reset state when modal opens or mode changes
  useEffect(() => {
    if (open) {
      setTeamName("");
      setProjectPath("");
      setSelectedColor(PROJECT_COLORS[0]);
      setSelectedTeamId(mode === "add-to-project" && availableTeams.length > 0 ? availableTeams[0].id : null);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;

    const loadTemplates = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await window.vibeAPI.agentTemplate.list();
        setTemplates(list);
      } catch (err) {
        console.error("Failed to load agent templates:", err);
        setError("Falha ao carregar templates");
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, [open]);
  
  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    try {
      const selected = await window.vibeAPI.dialog.pickProjectFolder();
      if (!selected) return;
      setProjectPath(selected);
    } finally {
      setIsPickingFolder(false);
    }
  };
  
  const hiredSet = useMemo(() => new Set(existingRoles), [existingRoles]);
  const isHired = useCallback((agent: AgentTemplate) => hiredSet.has(agent.role), [hiredSet]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return templates;
    return templates.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.description.toLowerCase().includes(s) ||
        a.slug.toLowerCase().includes(s)
    );
  }, [templates, search]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76, // Slightly larger for better spacing
    overscan: 10,
  });

  const handleAgentSelect = useCallback((agent: AgentTemplate) => {
    if (isHired(agent)) return;
    if (mode === "create-team") {
      onHire(agent, teamName.trim(), projectPath.trim());
    } else {
      onHire(agent);
    }
    onClose();
  }, [isHired, mode, onHire, teamName, projectPath, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
    <div className="w-[520px] max-h-[620px] bg-card border border-border rounded-2xl shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 shrink-0">
    <div className="flex flex-col">
      <h2 className="text-base font-bold text-foreground">
        {mode === "create-team" ? "Novo Time" : "Mercado de Agentes"}
      </h2>
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold">
        {mode === "create-team" ? "Configuração Inicial" : "Expandir Capacidades"}
      </p>
    </div>
    <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
    <X className="w-5 h-5" />
    </button>
    </div>

    {/* Mode indicator badges */}
    <div className="px-6 pt-4 pb-2 shrink-0">
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold ${
          mode === "create-team" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/40"
        }`}>
          <Plus className="w-3 h-3" />
          <span>TIME COMPLETO</span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold ${
          mode === "add-to-project" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/40"
        }`}>
          <Users className="w-3 h-3" />
          <span>INDIVIDUAL</span>
        </div>
      </div>
    </div>

    <div className="overflow-y-auto custom-scrollbar flex-1">
      {/* Create team mode: show inputs */}
      {mode === "create-team" && (
        <div className="px-6 py-4 space-y-4 border-b border-border/40 bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 block">Nome do Time</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ex: MVP Startup..."
                className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 outline-hidden focus:border-primary/50 transition-colors"
                autoFocus={!projectPath}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 block">Cor da Equipe</label>
              <div className="flex gap-1.5 py-1">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      selectedColor === c ? "border-foreground" : "border-transparent opacity-60"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 block">Pasta do Projeto</label>
            <div className="flex gap-2">
              <input
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="Selecione a pasta root"
                className="flex-1 bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 outline-hidden focus:border-primary/50 transition-colors"
              />
              <button
                onClick={handlePickFolder}
                disabled={isPickingFolder}
                className="px-4 py-2.5 rounded-xl border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-all shadow-sm"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to project mode: show team selector */}
      {mode === "add-to-project" && availableTeams.length > 1 && (
        <div className="px-6 py-4 border-b border-border/40 bg-muted/30">
          <label className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 block">Destino da Contratação</label>
          <div className="flex flex-wrap gap-2">
            {availableTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border ${
                  selectedTeamId === team.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 sticky top-0 z-10 bg-card pt-4 pb-2">
        <div className="flex items-center gap-3 bg-muted border border-border rounded-xl px-4 py-2.5 focus-within:bg-background focus-within:border-primary/40">
          <Search className="w-4 h-4 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Qual habilidade você precisa?"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-hidden"
          />
        </div>
      </div>

      <div className="px-6 pb-6 pt-2 h-[380px]">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto custom-scrollbar"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Sincronizando Templates...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-destructive text-xs font-semibold">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs italic">Nenhum agente compatível encontrado</div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const agent = filtered[virtualRow.index];
                if (!agent) return null;
                const isAlreadyHired = isHired(agent);
                const isDisabled = isAlreadyHired || (mode === "create-team" && (!teamName.trim() || !projectPath.trim()));
                
                return (
                  <div
                    key={agent.slug}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full pt-2"
                    style={{ 
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)` 
                    }}
                  >
                    <AgentItem 
                      agent={agent}
                      isAlreadyHired={isAlreadyHired}
                      isDisabled={isDisabled}
                      mode={mode}
                      onClick={() => handleAgentSelect(agent)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    
    <div className="px-6 py-4 bg-muted/20 border-t border-border/40 rounded-b-2xl shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium">
          {filtered.length} {filtered.length === 1 ? 'Agente disponível' : 'Agentes disponíveis'}
        </span>
        <button 
          onClick={onClose}
          className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider"
        >
          Fechar Marketplace
        </button>
      </div>
    </div>
    </div>
    </div>
  );
};

export default HireAgentModal;
