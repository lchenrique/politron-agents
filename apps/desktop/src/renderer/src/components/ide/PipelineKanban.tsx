import { useEffect, useMemo, useState } from "react";
import { useWorkspaceActiveTeam } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Clock3,
  GitPullRequest,
  LayoutGrid,
  ListTodo,
  Play,
  ShieldAlert,
  Loader2,
  Check,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

const COLUMNS = [
  { id: "backlog", label: "Backlog", icon: ListTodo, color: "text-slate-400", bgColor: "bg-slate-400/10", borderColor: "border-slate-500/20" },
  { id: "triage", label: "Triage", icon: Clock3, color: "text-amber-500", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
  { id: "ready", label: "Ready", icon: GitPullRequest, color: "text-cyan-500", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
  { id: "in_progress", label: "Em Progresso", icon: Play, color: "text-emerald-500", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  { id: "blocked", label: "Bloqueado", icon: ShieldAlert, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20" },
  { id: "in_review", label: "Revisão", icon: ArrowRight, color: "text-indigo-500", bgColor: "bg-indigo-500/10", borderColor: "border-indigo-500/20" },
  { id: "done", label: "Concluído", icon: BadgeCheck, color: "text-emerald-500", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  { id: "cancelled", label: "Cancelado", icon: Ban, color: "text-zinc-500", bgColor: "bg-zinc-500/10", borderColor: "border-zinc-500/20" },
] as const;

type TaskStatus = (typeof COLUMNS)[number]["id"];

const STATUS_OPTIONS = COLUMNS.map((column) => ({
  value: column.id,
  label: column.label,
}));

interface KanbanTask {
  id: string;
  title?: string;
  description: string;
  requesterAgentName?: string;
  createdByAgentName?: string;
  responsibleAgentRole?: string;
  priority?: string;
  context?: string;
  acceptanceCriteria?: string[];
  files: string[];
  status: TaskStatus;
  result?: string;
  observations?: string;
  blockedReason?: string;
  history?: Array<{
    id: string;
    timestamp: string;
    status: TaskStatus;
    actorAgentName?: string;
    note?: string;
  }>;
}

interface KanbanColumnProps {
  column: (typeof COLUMNS)[number];
  tasks: KanbanTask[];
}

const TaskCard = ({ task }: { task: KanbanTask }) => {
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task.status);
  const [isSaving, setIsSaving] = useState(false);
  const criteriaCount = task.acceptanceCriteria?.length ?? 0;
  const latestHistory = task.history?.[task.history.length - 1];

  useEffect(() => {
    setSelectedStatus(task.status);
  }, [task.status]);

  const handleSaveStatus = async () => {
    if (selectedStatus === task.status || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await window.vibeAPI.pipeline.updateTaskStatus({
        taskId: task.id,
        status: selectedStatus,
        note: "Atualização manual pelo board",
      });
    } catch (error) {
      console.error("Failed to update task status:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isStatusChanged = selectedStatus !== task.status;
  
  const priorityInfo = task.priority?.toLowerCase() === "high" || task.priority?.toLowerCase() === "alta" 
    ? { className: "text-red-400 bg-red-400/10 border-red-400/20", label: "ALTA" } 
    : { className: "text-primary bg-primary/10 border-primary/20", label: "NORMAL" };

  return (
    <Card className="w-full flex-col overflow-hidden bg-card/80 border border-border/40 hover:border-primary/40 transition-colors shadow-xs">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 border-b border-border/20 bg-muted/10">
        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-primary/15 text-primary text-[9px] font-bold shrink-0">
          {task.responsibleAgentRole?.slice(0, 2)?.toUpperCase() || "TL"}
        </div>
        
        <div className="min-w-0 w-full flex items-center">
            <h3 className="text-[11px] font-semibold text-foreground truncate block w-full">
                {task.title || task.description}
            </h3>
        </div>
        
        {task.priority && (
            <Badge variant="outline" className={cn("text-[8px] px-1.5 py-0 h-4 border leading-none tracking-widest shrink-0 rounded-sm font-bold uppercase", priorityInfo.className)}>
                {priorityInfo.label}
            </Badge>
        )}
      </div>

      <div className="p-3 flex flex-col gap-3">
        <div className="text-[11px] leading-relaxed text-muted-foreground/90 line-clamp-3 w-full wrap-break-word">
            {task.description}
        </div>

        {(task.context || task.blockedReason || task.observations || task.result || latestHistory?.note) && (
          <div className="w-full p-2 bg-muted/40 rounded-lg border border-border/40 text-[10px] text-muted-foreground leading-tight wrap-break-word overflow-hidden">
            {task.context && <div className="line-clamp-2 italic">{task.context}</div>}
            {!task.context && task.blockedReason && <div className="text-orange-400 font-bold line-clamp-2 truncate">{task.blockedReason}</div>}
            {!task.context && !task.blockedReason && (task.observations || task.result || latestHistory?.note) && (
              <div className="line-clamp-2">
                {task.observations || task.result || latestHistory?.note}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1 w-full">
            <div className="flex-1 min-w-0 overflow-hidden">
                <Select value={selectedStatus} onValueChange={(val) => setSelectedStatus(val as TaskStatus)}>
                    <SelectTrigger className="w-full h-8 text-[10px] uppercase font-bold tracking-tight bg-background/50 border-border/40 hover:bg-muted/60 transition-colors focus:ring-0 focus:ring-offset-0 px-2.5">
                      <div className="truncate w-full text-left">
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-[10px] uppercase font-bold tracking-tight">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                </Select>
            </div>
            
            <Button
                size="icon"
                className={cn(
                    "h-8 w-8 rounded-md transition-all shrink-0",
                    isStatusChanged ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:scale-105 active:scale-95" : "bg-muted/50 text-muted-foreground opacity-30 cursor-not-allowed border outline-none"
                )}
                onClick={handleSaveStatus}
                disabled={isSaving || !isStatusChanged}
            >
                {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                <Check className="h-4 w-4" />
                )}
            </Button>
        </div>
        
        <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground/60 font-semibold border-t border-border/20 pt-2.5">
            <div className="flex items-center gap-3">
                {criteriaCount > 0 && <span className="flex items-center gap-1.5 hover:text-foreground/80 transition-colors"><ListTodo className="h-3 w-3" /> {criteriaCount}</span>}
                {task.files.length > 0 && <span className="flex items-center gap-1.5 hover:text-foreground/80 transition-colors"><LayoutGrid className="h-3 w-3" /> {task.files.length}</span>}
            </div>
            <span className="font-mono tracking-tighter uppercase opacity-60">#{task.id.slice(-4)}</span>
        </div>
      </div>
    </Card>
  );
};

const KanbanColumn = ({ column, tasks }: KanbanColumnProps) => {
  const Icon = column.icon;

  return (
    <div className={cn("flex flex-col w-[280px] shrink-0 bg-muted/10 border rounded-2xl overflow-hidden h-full shadow-sm", column.borderColor)}>
      <div className={cn("px-4 py-3 flex items-center justify-between border-b bg-card/40 backdrop-blur-md shrink-0", column.borderColor)}>
        <div className="flex items-center gap-2.5">
          <div className={cn("p-1.5 rounded-md", column.bgColor)}>
            <Icon className={cn("h-3.5 w-3.5", column.color)} />
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80">{column.label}</span>
        </div>
        <Badge variant="outline" className="h-5 px-1.5 min-w-[20px] flex justify-center text-[10px] font-mono border-border/40 bg-muted/30 text-muted-foreground font-bold">
          {tasks.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1 h-0 w-full px-2">
        <div className="flex flex-col gap-3 py-3 w-full">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          
          {tasks.length === 0 && (
            <div className={cn("flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 gap-3 border-2 border-dashed rounded-xl my-4 opacity-50", column.borderColor)}>
              <Icon className="h-5 w-5 opacity-40" />
              <span className="text-[10px] font-bold tracking-widest uppercase">Sem tarefas</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

interface PipelineBoardProps {
  fullView?: boolean;
}

export default function PipelineKanban({ fullView = false }: PipelineBoardProps) {
  const activeTeam = useWorkspaceActiveTeam();

  const tasks = useMemo<KanbanTask[]>(() => {
    if (!activeTeam) {
      return [];
    }

    return activeTeam.pipeline.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      requesterAgentName: task.requesterAgentName,
      createdByAgentName: task.createdByAgentName,
      responsibleAgentRole: task.responsibleAgentRole,
      priority: task.priority,
      context: task.context,
      acceptanceCriteria: task.acceptanceCriteria || [],
      files: task.files || [],
      status: task.status as TaskStatus,
      result: task.result,
      observations: task.observations,
      blockedReason: task.blockedReason,
      history: task.history,
    }));
  }, [activeTeam]);

  const tasksByColumn = useMemo(() => {
    return COLUMNS.reduce((acc, column) => {
      acc[column.id] = tasks.filter((task) => task.status === column.id);
      return acc;
    }, {} as Record<TaskStatus, KanbanTask[]>);
  }, [tasks]);

  if (!activeTeam) {
    return (
      <div className="flex h-full items-center justify-center bg-background/50 backdrop-blur-sm rounded-3xl border border-border/20 mx-4 my-3 text-sm font-medium text-muted-foreground/60 animate-pulse">
        Nenhum time ativo para exibir o board.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col animate-in fade-in slide-in-from-bottom-2 duration-500 bg-background",
        fullView ? "p-8" : "border-t border-border/20 p-5"
      )}
    >
      <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative group flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all duration-300 hover:rotate-6 hover:scale-110">
            <LayoutGrid className="h-5 w-5" />
            <div className="absolute inset-0 bg-primary/20 blur-lg opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-black tracking-tight flex items-center gap-2">
              Board de Issues
              <Badge variant="outline" className="text-[10px] py-0 h-4 border-primary/30 text-primary bg-primary/5 uppercase font-black tracking-widest rounded-sm">Beta</Badge>
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">
              <span className="text-primary">{activeTeam.name}</span>
              <span className="opacity-20">/</span>
              <span>{tasks.length} issues registradas</span>
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="h-8 rounded-full bg-muted/30 border border-border/40 px-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">Sincronizado</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 w-full border border-border/30 rounded-2xl bg-muted/5 shadow-inner">
        <div className="flex gap-4 p-4 h-full min-h-[500px]">
          {COLUMNS.map((column) => (
            <KanbanColumn key={column.id} column={column} tasks={tasksByColumn[column.id] || []} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="bg-muted/30" />
      </ScrollArea>
    </div>
  );
}
