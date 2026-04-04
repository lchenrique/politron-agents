import { memo, useMemo } from 'react';
import { ToolResultBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import { ChevronDown, CheckCircle2, XCircle, Loader2, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

interface ToolResultCardProps {
  blockId: string;
}

export const ToolResultCard = memo(({ blockId }: ToolResultCardProps) => {
  const block = useBlock(blockId) as ToolResultBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  if (!block || block.type !== 'tool-result') return null;

  const isRunning = block.status === 'running' || block.status === 'streaming';

  // Truncate preview for collapsed state
  const preview = useMemo(() => {
    if (!block.result) return '';
    const maxLen = 150;
    if (block.result.length <= maxLen) return block.result;
    return block.result.slice(0, maxLen) + '...';
  }, [block.result]);

  const isLongResult = block.result && block.result.length > 500;

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-border/60 bg-secondary/20">
        {/* Header - always clickable if result is long */}
        <div
          className={clsx(
            'flex items-start gap-3 px-4 py-3',
            isLongResult ? 'cursor-pointer hover:bg-secondary/30' : ''
          )}
          onClick={() => isLongResult && toggleBlockExpanded(blockId)}
        >
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            {isRunning ? (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
            ) : block.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : block.status === 'error' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground/60">
                {block.toolName}
              </span>
              <span className="text-xs text-muted-foreground/40">result</span>
            </div>

            <div className="font-mono text-sm text-foreground/80">
              {isLongResult && !isExpanded ? (
                <pre className="whitespace-pre-wrap break-all">{preview}</pre>
              ) : (
                <pre className="whitespace-pre-wrap break-all">{block.result}</pre>
              )}
            </div>

            {/* Expand indicator */}
            {isLongResult && (
              <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    <span>Show less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>Show more ({block.result.length} chars)</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ToolResultCard.displayName = 'ToolResultCard';
