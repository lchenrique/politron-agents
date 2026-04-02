/**
 * DiffCard - Displays file diff with syntax highlighting
 *
 * Performance:
 * - Lazy loaded component (heavy syntax highlighting)
 * - Collapsed by default for large diffs
 * - Uses React.memo to prevent re-renders
 * - Line-by-line rendering only when expanded
 */

import React, { Suspense, lazy, memo, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, FileDiff, Plus } from 'lucide-react';
import { useBlock, useChatStore, useIsBlockExpanded } from '../../store/chatStore';
import { DiffBlock } from '../../types/block.types';

const DiffViewer = lazy(() => import('./DiffViewer'));

interface DiffCardProps {
  blockId: string;
}

export const DiffCard = memo(({ blockId }: DiffCardProps) => {
  const block = useBlock(blockId) as DiffBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  const handleToggle = useCallback(() => {
    toggleBlockExpanded(blockId);
  }, [blockId, toggleBlockExpanded]);

  if (!block || block.type !== 'diff') return null;

  const stats = useMemo(() => {
    const originalLines = (block.originalContent || '').split('\n').length;
    const modifiedLines = (block.modifiedContent || '').split('\n').length;
    const added = modifiedLines - originalLines;
    return { originalLines, modifiedLines, added };
  }, [block.modifiedContent, block.originalContent]);

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/40">
        <button
          onClick={handleToggle}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex-shrink-0 text-indigo-400">
            <FileDiff className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-zinc-200 font-medium truncate">
              {block.filePath}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-zinc-500">
                {stats.originalLines} → {stats.modifiedLines} lines
              </span>
              {stats.added > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Plus className="w-3 h-3" />
                  {stats.added}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 text-zinc-500">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isExpanded && (
          <Suspense
            fallback={
              <div className="px-4 pb-4">
                <div className="stream-pulse space-y-2" style={{ animationDuration: '1.8s' }}>
                  <div className="h-4 bg-zinc-800 rounded w-3/4" />
                  <div className="h-4 bg-zinc-800 rounded w-1/2" />
                  <div className="h-4 bg-zinc-800 rounded w-5/6" />
                </div>
              </div>
            }
          >
            <DiffViewer
              originalContent={block.originalContent}
              modifiedContent={block.modifiedContent}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
});

DiffCard.displayName = 'DiffCard';

export default DiffCard;
