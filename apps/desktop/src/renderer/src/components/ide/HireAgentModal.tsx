import { useState, useEffect } from "react";
import { X, Search, Loader2 } from "lucide-react";

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

interface HireAgentModalProps {
 open: boolean;
 onClose: () => void;
 onHire: (agent: AgentTemplate) => void;
 existingRoles: string[];
}

const HireAgentModal = ({ open, onClose, onHire, existingRoles }: HireAgentModalProps) => {
 const [search, setSearch] = useState("");
 const [templates, setTemplates] = useState<AgentTemplate[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

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

 if (!open) return null;

 const filtered = templates.filter(
 (a) =>
 a.name.toLowerCase().includes(search.toLowerCase()) ||
 a.description.toLowerCase().includes(search.toLowerCase()) ||
 a.slug.toLowerCase().includes(search.toLowerCase())
 );

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs" onClick={onClose}>
 <div className="w-[480px] max-h-[520px] bg-ide-surface-2 border border-ide-border rounded-xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between px-5 py-4 border-b border-ide-border shrink-0">
 <h2 className="text-sm font-medium text-ide-text">Contratar Agente</h2>
 <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text ">
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
 className="flex-1 bg-transparent text-sm text-ide-text placeholder:text-ide-text-dim/40 outline-hidden"
 autoFocus
 />
 </div>
 </div>

 <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-thin">
 {loading && (
 <div className="flex items-center justify-center py-8 text-ide-text-dim">
 <Loader2 className="w-5 h-5 animate-spin mr-2" />
 <span className="text-xs">Carregando templates...</span>
 </div>
 )}

 {error && (
 <div className="text-center text-ide-red text-xs py-8">{error}</div>
 )}

 {!loading && !error && (
 <div className="flex flex-col gap-2 pt-2">
 {filtered.map((agent) => {
 const alreadyHired = existingRoles.includes(agent.role);
 return (
 <div
 key={agent.slug}
 className={`flex items-center gap-3 p-3 rounded-lg border ${
 alreadyHired
 ? "border-ide-border/50 opacity-40 cursor-not-allowed"
 : "border-ide-border hover:border-ide-indigo-border hover:bg-ide-surface cursor-pointer"
 }`}
 onClick={() => {
 if (alreadyHired) return;
 onHire(agent);
 onClose();
 }}
 >
 <div
 className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium shrink-0 border"
 style={{
 background: agent.color.includes('hsl') 
 ? agent.color.replace('hsl(', 'hsl(').replace(')', ' / 0.12)')
 : agent.color,
 color: agent.color,
 borderColor: agent.color.includes('hsl')
 ? agent.color.replace('hsl(', 'hsl(').replace(')', ' / 0.2)')
 : agent.color,
 }}
 >
 {agent.initials}
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-sm text-ide-text font-medium">{agent.name}</div>
 <div className="text-[10px] text-ide-text-dim truncate">{agent.description}</div>
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
 )}
 </div>
 </div>
 </div>
 );
};

export default HireAgentModal;
