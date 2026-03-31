import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  status: "thinking" | "reading" | "editing" | "creating" | "idle";
  filename?: string;
}

const statusConfig = {
  thinking: {
    color: "bg-ide-indigo",
    label: "Pensando",
  },
  reading: {
    color: "bg-ide-amber",
    label: "Lendo",
  },
  editing: {
    color: "bg-ide-green",
    label: "Editando",
  },
  creating: {
    color: "bg-ide-green",
    label: "Criando",
  },
  idle: {
    color: "bg-ide-text-dim",
    label: "Ocioso",
  },
};

export function ThinkingIndicator({ status, filename }: ThinkingIndicatorProps) {
  if (status === "idle") {
    return null;
  }

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ide-surface-2 border border-ide-border">
      {/* Animated dots */}
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce-dot-1",
            config.color
          )}
          style={{ animationDelay: "0ms" }}
        />
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce-dot-2",
            config.color
          )}
          style={{ animationDelay: "150ms" }}
        />
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce-dot-3",
            config.color
          )}
          style={{ animationDelay: "300ms" }}
        />
      </div>

      {/* Status label */}
      <span className="text-[11px] text-ide-text-dim">
        {config.label}
        {filename && (
          <span className="text-ide-text-muted font-mono ml-1">{filename}</span>
        )}
      </span>
    </div>
  );
}

export default ThinkingIndicator;
