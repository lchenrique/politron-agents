import { useState } from "react";
import { FolderOpen, X } from "lucide-react";

const PROJECT_COLORS = [
 "hsl(239 84% 67%)", "hsl(38 92% 50%)", "hsl(174 62% 47%)",
 "hsl(330 81% 60%)", "hsl(142 71% 45%)", "hsl(280 67% 60%)",
 "hsl(200 80% 55%)", "hsl(0 72% 51%)",
];

interface AddProjectModalProps {
 open: boolean;
 onClose: () => void;
 onAdd: (name: string, teamName: string, color: string, projectPath: string) => void;
}

const AddProjectModal = ({ open, onClose, onAdd }: AddProjectModalProps) => {
 const [name, setName] = useState("");
 const [teamName, setTeamName] = useState("");
 const [color, setColor] = useState(PROJECT_COLORS[0]);
 const [projectPath, setProjectPath] = useState("");
 const [isPickingFolder, setIsPickingFolder] = useState(false);

 if (!open) return null;

 const inferProjectName = (folderPath: string) => {
 const normalized = folderPath.replace(/\\/g, "/").replace(/\/$/, "");
 return normalized.split("/").filter(Boolean).pop() ?? "";
 };

 const handlePickFolder = async () => {
 setIsPickingFolder(true);
 try {
 const selectedPath = await window.vibeAPI.dialog.pickProjectFolder();
 if (!selectedPath) return;
 setProjectPath(selectedPath);
 if (!name.trim()) {
 setName(inferProjectName(selectedPath));
 }
 } finally {
 setIsPickingFolder(false);
 }
 };

 const handleSubmit = () => {
 if (!name.trim() || !teamName.trim() || !projectPath.trim()) return;
 onAdd(name.trim(), teamName.trim(), color, projectPath.trim());
 setName("");
 setTeamName("");
 setColor(PROJECT_COLORS[0]);
 setProjectPath("");
 onClose();
 };

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs" onClick={onClose}>
  <div className="w-[420px] bg-card border border-border rounded-xl p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
  <h2 className="text-sm font-medium text-card-foreground">Novo Projeto</h2>
  <button onClick={onClose} className="text-muted-foreground hover:text-foreground ">
  <X className="w-4 h-4" />
  </button>
  </div>
  <div className="p-5 flex flex-col gap-4">
  <div>
  <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 block">Nome do projeto</label>
  <input
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="Ex: E-commerce, SaaS App..."
  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-hidden focus:border-primary/40 "
  autoFocus
  />
  </div>
  <div>
  <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 block">Nome do time</label>
  <input
  value={teamName}
  onChange={(e) => setTeamName(e.target.value)}
  placeholder="Ex: MVP Startup, Core Team..."
  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-hidden focus:border-primary/40 "
  />
  </div>
  <div>
  <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 block">Pasta do projeto</label>
  <div className="flex gap-2">
  <input
  value={projectPath}
  onChange={(e) => setProjectPath(e.target.value)}
  placeholder="Selecione a pasta do projeto"
  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-hidden focus:border-primary/40 "
  />
  <button
  onClick={handlePickFolder}
  disabled={isPickingFolder}
  className="px-3 py-2 rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/80 disabled:opacity-50 disabled:cursor-wait"
  title="Escolher pasta"
  >
  <FolderOpen className="w-4 h-4" />
  </button>
  </div>
  <div className="mt-1 text-[11px] text-muted-foreground truncate" title={projectPath || "Nenhuma pasta selecionada"}>
  {projectPath || "Nenhuma pasta selecionada"}
  </div>
  </div>
  <div>
  <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5 block">Cor</label>
  <div className="flex gap-2">
  {PROJECT_COLORS.map((c) => (
  <button
  key={c}
  onClick={() => setColor(c)}
  className={`w-7 h-7 rounded-full border-2 ${
    color === c ? "border-white/60 scale-110" : "border-transparent hover:border-white/20"
  }`}
  style={{ background: c }}
  />
  ))}
  </div>
  </div>
  </div>
  <div className="px-5 pb-5 flex gap-2 justify-end">
  <button onClick={onClose} className="px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-muted ">
  Cancelar
  </button>
  <button
  onClick={handleSubmit}
  disabled={!name.trim() || !teamName.trim() || !projectPath.trim()}
  className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
  >
  Criar projeto
  </button>
  </div>
  </div>
  </div>
  );
};

export default AddProjectModal;
