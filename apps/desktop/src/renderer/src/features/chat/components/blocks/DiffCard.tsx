import { Suspense, lazy, memo, useMemo, useCallback } from 'react';
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
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-border/80 bg-secondary/40 transition-shadow hover:shadow-lg">
        <button
          onClick={handleToggle}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="shrink-0 text-primary">
            <FileDiff className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-foreground font-medium truncate">
               {block.filePath}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground/60 uppercase tracking-wider font-bold">
                {stats.originalLines} → {stats.modifiedLines} LINHAS
              </span>
              {stats.added > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full uppercase">
                  <Plus className="w-2.5 h-2.5" />
                  {stats.added} novas
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-muted-foreground">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isExpanded && (
          <Suspense
            fallback={
              <div className="px-4 pb-4">
                <div className="animate-pulse space-y-2 opacity-50">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-5/6" />
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
