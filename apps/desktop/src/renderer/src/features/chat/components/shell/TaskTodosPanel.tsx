import { memo, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, ListTodo } from 'lucide-react';
import { useAgentTodos } from '../../store/chatStore';

interface TaskTodosPanelProps {
  agentId?: string | null;
}

export const TaskTodosPanel = memo(({ agentId }: TaskTodosPanelProps) => {
  const todoState = useAgentTodos(agentId);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const items = todoState?.items ?? [];

  const counts = useMemo(() => {
    const completed = items.filter((item) => (item.status || '').toLowerCase() === 'completed' || (item.status || '').toLowerCase() === 'done').length;
    const running = items.filter((item) => ['in_progress', 'in-progress', 'running', 'doing'].includes((item.status || '').toLowerCase())).length;
    return {
      completed,
      running,
    };
  }, [items]);

  if (!agentId) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  const renderStatusIcon = (status?: string) => {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'completed' || normalized === 'done') {
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    }

    if (normalized === 'in_progress' || normalized === 'in-progress' || normalized === 'running' || normalized === 'doing') {
      return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
    }

    return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  };

  return (
    <div className="mb-4 w-full rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setIsCollapsed((value) => !value)}
        className={clsx(
          'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/20',
          isCollapsed && 'border-b-0'
        )}
      >
        <ListTodo className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Todos</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {items.length}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {counts.completed > 0 || counts.running > 0
              ? `${counts.completed} concluídos${counts.running ? ` • ${counts.running} em andamento` : ''}`
              : 'Lista de tarefas atual do agente'}
          </div>
        </div>

        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-2 px-4 py-4">
          {items.map((item, index) => {
            const priority = item.priority?.trim();
            const status = item.status?.trim();

            return (
              <div key={`${item.content}-${index}`} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
                <div className="mt-0.5 shrink-0">
                  {renderStatusIcon(status)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-relaxed text-foreground/90">{item.content}</div>
                  {(priority || status) && (
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {priority && <span className="rounded-full border border-border/60 px-2 py-0.5">{priority}</span>}
                      {status && <span className="rounded-full border border-border/60 px-2 py-0.5">{status}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

TaskTodosPanel.displayName = 'TaskTodosPanel';
