import { useState, useCallback } from "react";
import { useWorkspaceActiveTeam } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import { GripVertical, FileText, Play, CheckCircle2, AlertCircle, Clock, Ban } from "lucide-react";

const COLUMNS = [
  { id: "pending", label: "A Fazer", icon: Clock, color: "text-ide-text-dim" },
  { id: "waiting", label: "Esperando", icon: Clock, color: "text-ide-amber" },
  { id: "running", label: "Rodando", icon: Play, color: "text-ide-green shadow-[0_0_8px_rgba(34,197,94,0.3)]" },
  { id: "blocked", label: "Bloqueado", icon: Ban, color: "text-ide-indigo" },
  { id: "done", label: "Feito", icon: CheckCircle2, color: "text-ide-green-bright" },
  { id: "failed", label: "Falhou", icon: AlertCircle, color: "text-ide-red" },
] as const;

type TaskStatus = typeof COLUMNS[number]["id"];

interface KanbanTask {
  id: string;
  description: string;
  agentId: string;
  agentInitials: string;
  files: string[];
  status: TaskStatus;
}

interface KanbanColumnProps {
  column: typeof COLUMNS[number];
  tasks: KanbanTask[];
  onDropTask: (taskId: string, newStatus: TaskStatus) => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
}

const KanbanColumn = ({ column, tasks, onDropTask, isDragOver, onDragOver, onDragLeave }: KanbanColumnProps) => {
  const Icon = column.icon;

  return (
    <div
      className={cn(
        "flex flex-col min-w-[220px] max-w-[280px] rounded-2xl bg-ide-surface/30 backdrop-blur-sm border ",
        isDragOver ? "border-ide-indigo ring-1 ring-ide-indigo/20 scale-[1.02]" : "border-ide-border/30 hover:border-ide-border/60"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        if (taskId) onDropTask(taskId, column.id);
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ide-border/20">
        <Icon className={cn("w-3.5 h-3.5", column.color)} />
        <span className={cn("text-xs font-semibold tracking-tight", column.color)}>{column.label}</span>
        <span className="ml-auto text-[10px] text-ide-text-dim/60 bg-white/5 px-2 py-0.5 rounded-full font-mono">
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto scrollbar-none">
        {tasks.map((task) => (
          <KanbanTaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && !isDragOver && (
          <div className="text-[10px] text-ide-text-dim/30 text-center py-6 border-2 border-dashed border-white/5 rounded-xl">
            Vazio
          </div>
        )}
      </div>
    </div>
  );
};

interface KanbanTaskCardProps {
  task: KanbanTask;
}

const KanbanTaskCard = ({ task }: KanbanTaskCardProps) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task.id);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      className={cn(
        "group relative flex items-start gap-3 p-3 rounded-xl border bg-ide-surface-2/80 cursor-grab active:cursor-grabbing ",
        "border-ide-border/40 hover:border-ide-indigo/40 hover:bg-ide-surface-3 hover:translate-y-[-2px] hover:shadow-xl",
        isDragging && "opacity-50 scale-95"
      )}
    >
      <div className="w-1 absolute left-0 top-3 bottom-3 rounded-full bg-ide-indigo/0 group-hover:bg-ide-indigo " />

      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ide-text/90 leading-relaxed line-clamp-3 font-medium">{task.description}</p>
        <div className="flex items-center gap-2 mt-3">
          <div className="px-1.5 py-0.5 rounded-md bg-ide-indigo/10 border border-ide-indigo/20 text-[9px] text-ide-indigo font-bold tracking-tighter">
            {task.agentInitials}
          </div>
          {task.files.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-ide-text-dim/60">
              <FileText className="w-2.5 h-2.5" />
              {task.files.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface PipelineBoardProps {
  fullView?: boolean;
}

export default function PipelineKanban({ fullView = false }: PipelineBoardProps) {
  const activeTeam = useWorkspaceActiveTeam();
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  if (!activeTeam) return null;

  const tasks: KanbanTask[] = activeTeam.pipeline.map((task) => ({
    id: task.id,
    description: task.description,
    agentId: task.agentId,
    agentInitials: task.agentInitials,
    files: task.files,
    status: task.status as TaskStatus,
  }));

  const tasksByColumn = COLUMNS.reduce((acc, column) => {
    acc[column.id] = tasks.filter((task) => task.status === column.id);
    return acc;
  }, {} as Record<TaskStatus, KanbanTask[]>);

  const handleDropTask = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setDragOverColumn(null);
    if (newStatus === "running") {
      try {
        await window.vibeAPI.pipeline.start(taskId);
      } catch (err) {
        console.error("Failed to start task:", err);
      }
    }
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 ",
        fullView ? "bg-ide-bg p-8" : "border-t border-ide-border/50 bg-ide-surface/30 px-4 py-3"
      )}
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ide-indigo/20 border border-ide-indigo/30 flex items-center justify-center text-ide-indigo">
            <GripVertical className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Board de Pipeline</h2>
            <p className="text-[10px] text-ide-text-dim">
              {activeTeam.name} • {tasks.length} tarefas
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] text-ide-text-dim font-medium">
            Auto-sync ON
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-x-auto overflow-y-hidden pb-4 no-scrollbar">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn[column.id]}
            onDropTask={handleDropTask}
            isDragOver={dragOverColumn === column.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(column.id);
            }}
            onDragLeave={() => setDragOverColumn(null)}
          />
        ))}
      </div>
    </div>
  );
}
