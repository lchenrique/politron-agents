import { memo } from 'react';
import { ToolCallBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import { ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface ToolCallCardProps {
  blockId: string;
}

export const ToolCallCard = memo(({ blockId }: ToolCallCardProps) => {
  const block = useBlock(blockId) as ToolCallBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  if (!block || block.type !== 'tool-call') return null;

  const isRunning = block.status === 'running' || block.status === 'streaming';
  const hasArgs = block.args && Object.keys(block.args).length > 0;

  return (
    <div className="flex w-full group py-1 animate-fade-in">
      <div className="flex-1 ml-12 rounded-lg bg-card border border-border shadow-xs overflow-hidden transition-all hover:bg-muted/10">
        {/* Header */}
        <button
          onClick={() => toggleBlockExpanded(blockId)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
        >
          {/* Chevron */}
          <div className="text-muted-foreground/60 shrink-0">
             {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          <div className="flex items-center gap-3 flex-1 overflow-hidden">
            {/* Status icon */}
            <div className="shrink-0">
              {isRunning ? (
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse outline outline-2 outline-amber-500/20" />
              ) : block.status === 'success' ? (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
              )}
            </div>

            {/* Tool name */}
            <div className="font-mono text-[13px] text-foreground font-medium tracking-tight truncate">
              {block.toolName}
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <span className={clsx(
              "text-[10px] font-bold uppercase tracking-wider",
              isRunning ? "text-amber-600" : block.status === 'success' ? "text-emerald-600" : "text-muted-foreground/60"
            )}>
              {isRunning ? 'running' : block.status}
            </span>
          </div>
        </button>

        {/* Expanded args view */}
        {isExpanded && hasArgs && (
          <div className="px-4 pb-4 border-t border-border bg-muted/5">
            <div className="font-mono text-xs text-muted-foreground mt-3 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/40">
              <pre className="whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(block.args, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ToolCallCard.displayName = 'ToolCallCard';
