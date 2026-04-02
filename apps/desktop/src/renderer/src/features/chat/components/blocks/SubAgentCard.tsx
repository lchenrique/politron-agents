/**
 * SubAgentCard - Displays a sub-agent or subtask
 *
 * Performance:
 * - Memoized
 * - Shows agent/task hierarchy
 * - Expandable for detailed result
 */

import React, { memo, useMemo } from 'react';
import { SubAgentBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import { ChevronDown, ChevronUp, Bot, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';

interface SubAgentCardProps {
  blockId: string;
}

export const SubAgentCard = memo(({ blockId }: SubAgentCardProps) => {
  const block = useBlock(blockId) as SubAgentBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  if (!block || block.type !== 'sub-agent') return null;

  const isRunning = block.status === 'running' || block.status === 'streaming';
  const isDone = block.status === 'success' || block.status === 'error' || block.status === 'cancelled';

  const statusIcon = useMemo(() => {
    if (isRunning) return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    if (block.status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (block.status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Bot className="w-4 h-4 text-zinc-500" />;
  }, [block.status, isRunning]);

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/40">
        {/* Header - always clickable */}
        <button
          onClick={() => block.result && toggleBlockExpanded(blockId)}
          className={clsx(
            'w-full flex items-center gap-3 px-4 py-3 text-left',
            block.result ? 'hover:bg-zinc-800/30 cursor-pointer' : '',
            'transition-colors'
          )}
          disabled={!block.result}
        >
          {/* Agent icon */}
          <div className="flex-shrink-0">{statusIcon}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              <span className="font-mono text-sm text-zinc-200 font-medium">
                {block.agentName}
              </span>
            </div>
            <div className="text-sm text-zinc-400 mt-1 truncate">
              {block.task}
            </div>
          </div>

          {/* Expand indicator */}
          {block.result && (
            <div className="flex-shrink-0 text-zinc-500">
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          )}
        </button>

        {/* Result */}
        {block.result && isExpanded && (
          <div className="px-4 pb-4 border-t border-zinc-800/50">
            <div className="mt-3 p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
              <div className="text-xs text-zinc-500 mb-2 font-medium">Result</div>
              <pre className="font-mono text-sm text-zinc-300 whitespace-pre-wrap">
                {block.result}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SubAgentCard.displayName = 'SubAgentCard';
