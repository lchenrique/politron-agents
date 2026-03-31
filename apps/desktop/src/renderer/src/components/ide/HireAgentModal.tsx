import { useState } from "react";
import { X, Search } from "lucide-react";
import { AGENT_CATALOG } from "@/types/workspace";

interface HireAgentModalProps {
  open: boolean;
  onClose: () => void;
  onHire: (catalogIndex: number) => void;
  existingRoles: string[];
}

const HireAgentModal = ({ open, onClose, onHire, existingRoles }: HireAgentModalProps) => {
  const [search, setSearch] = useState("");

  if (!open) return null;

  const filtered = AGENT_CATALOG.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] max-h-[520px] bg-ide-surface-2 border border-ide-border rounded-xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ide-border shrink-0">
          <h2 className="text-sm font-medium text-ide-text">Contratar Agente</h2>
          <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 bg-ide-surface border border-ide-border rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-ide-text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agente..."
              className="flex-1 bg-transparent text-sm text-ide-text placeholder:text-ide-text-dim/40 outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-thin">
          <div className="flex flex-col gap-2 pt-2">
            {filtered.map((agent, idx) => {
              const realIdx = AGENT_CATALOG.indexOf(agent);
              const alreadyHired = existingRoles.includes(agent.role);
              return (
                <div
                  key={agent.role}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    alreadyHired
                      ? "border-ide-border/50 opacity-40 cursor-not-allowed"
                      : "border-ide-border hover:border-ide-indigo-border hover:bg-ide-surface cursor-pointer"
                  }`}
                  onClick={() => {
                    if (alreadyHired) return;
                    onHire(realIdx);
                    onClose();
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium shrink-0 border"
                    style={{
                      background: agent.color.replace(")", " / 0.12)").replace("hsl(", "hsl("),
                      color: agent.color,
                      borderColor: agent.color.replace(")", " / 0.2)").replace("hsl(", "hsl("),
                    }}
                  >
                    {agent.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ide-text font-medium">{agent.name}</div>
                    <div className="text-[10px] text-ide-text-dim">{agent.role}</div>
                  </div>
                  {alreadyHired ? (
                    <span className="text-[10px] text-ide-text-dim">já contratado</span>
                  ) : (
                    <span className="text-[10px] text-ide-indigo opacity-0 group-hover:opacity-100">+ contratar</span>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-ide-text-dim text-xs py-8">Nenhum agente encontrado</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HireAgentModal;
