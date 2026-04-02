/**
 * ToolCallCard - Displays an in-progress tool call
 *
 * Performance:
 * - Memoized component
 * - Subscribes only to specific block via useBlock hook
 * - Lazy loads tool result preview if needed
 */

import React, { memo } from 'react';
import { ToolCallBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react';
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
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/40 transition-colors">
        {/* Header */}
        <button
          onClick={() => toggleBlockExpanded(blockId)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          {/* Expand/Collapse icon */}
          <div className="flex-shrink-0 text-zinc-500">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>

          {/* Tool icon and status */}
          <div className="flex-shrink-0">
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            ) : (
              <Wrench className="w-5 h-5 text-zinc-500" />
            )}
          </div>

          {/* Tool name and args preview */}
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-zinc-200 font-medium">
              {block.toolName}
            </div>
            {!isExpanded && hasArgs && (
              <div className="text-xs text-zinc-500 truncate mt-0.5">
                {Object.keys(block.args || {}).join(', ')}
              </div>
            )}
          </div>

          {/* Status badge */}
          <div
            className={clsx(
              'px-2 py-1 rounded text-xs font-medium',
              isRunning
                ? 'bg-amber-500/10 text-amber-400'
                : block.status === 'success'
                ? 'bg-emerald-500/10 text-emerald-400'
                : block.status === 'error'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-zinc-700/50 text-zinc-400'
            )}
          >
            {isRunning ? 'Running' : block.status}
          </div>
        </button>

        {/* Expanded args view */}
        {isExpanded && hasArgs && (
          <div className="px-4 pb-4 border-t border-zinc-800/50 mt-0">
            <div className="font-mono text-xs text-zinc-400 bg-zinc-950/50 rounded-lg p-3 mt-3 overflow-x-auto">
              <pre className="whitespace-pre-wrap break-all">
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
