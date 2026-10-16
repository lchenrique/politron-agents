import { Suspense, lazy, memo, useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileDiff, Plus } from 'lucide-react';
import type { DiffBlock } from './types';

const DiffViewer = lazy(() => import('./DiffViewer'));

interface DiffCardProps {
  block: DiffBlock;
  defaultExpanded?: boolean;
}

// NOTA (Fase 0 da limpeza): este componente vinha do chat legado e lia o bloco
// de um store global de transcript que foi removido. Por ora ele recebe o
// bloco direto por prop e controla a expansão localmente; a Fase 3
// ("Diff no chat") é quem vai ligá-lo ao registro real de FileChange.
export const DiffCard = memo(({ block, defaultExpanded = false }: DiffCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const stats = useMemo(() => {
    const originalLines = (block.originalContent || '').split('\n').length;
    const modifiedLines = (block.modifiedContent || '').split('\n').length;
    const added = modifiedLines - originalLines;
    return { originalLines, modifiedLines, added };
  }, [block]);

  const handleToggle = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);

  return (
    <div className="flex w-full group py-1 animate-fade-in text-foreground">
      <div className="flex-1 ml-12 rounded-lg overflow-hidden border border-border bg-card shadow-xs transition-all hover:bg-muted/10">
        <button
          onClick={handleToggle}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors bg-muted/5 border-b border-border"
        >
          <div className="shrink-0 text-foreground">
            <FileDiff className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-mono text-[13px] text-foreground font-medium truncate">
               {block.filePath}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                {stats.originalLines} → {stats.modifiedLines} linhas
              </span>
              {stats.added > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-tight">
                  <Plus className="w-2 h-2" />
                  {stats.added} novas
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-muted-foreground/40">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isExpanded && (
          <div className="p-4">
            <Suspense
              fallback={
                <div className="animate-pulse space-y-2 opacity-50">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              }
            >
              <DiffViewer
                filePath={block.filePath}
                originalContent={block.originalContent}
                modifiedContent={block.modifiedContent}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
});

DiffCard.displayName = 'DiffCard';

export default DiffCard;
