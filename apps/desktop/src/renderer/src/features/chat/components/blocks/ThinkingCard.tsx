import { memo } from 'react';
import { ThinkingBlock } from '../../types/block.types';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const ThinkingCard = memo(({ block }: { block: ThinkingBlock }) => {
  const isDone = block.status === 'success';
  const isError = block.status === 'error';
  const isActive = block.status === 'streaming' || block.status === 'running' || block.status === 'idle';

  // Show thinking indicator during active processing
  if (isActive) {
    return (
      <div className="flex w-full group py-1 animate-fade-in">
        <div className="flex-1 ml-12 px-4 py-2.5 rounded-[4px_16px_16px_16px] bg-muted/30 border border-border/50 text-sm transition-all shadow-xs">
          <div className="flex items-center gap-2.5 text-muted-foreground">
             <div className="flex gap-1 items-center">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce"></span>
             </div>
            <span className="text-[11px] font-semibold tracking-wide">
              {block.content || "Pensando..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex w-full group py-1 animate-fade-in">
        <div className="flex-1 ml-12 px-4 py-2.5 rounded-[4px_16px_16px_16px] bg-destructive/10 border border-destructive/20 text-sm flex gap-3 items-center">
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <div className="flex-1 overflow-hidden">
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider block mb-0.5">
               Falha no processamento
            </span>
            <div className="text-destructive/70 italic text-xs truncate">
              {block.content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Only show completed thinking blocks
  if (!isDone) return null;

  return (
    <div className="flex w-full group py-1 animate-fade-in opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex-1 ml-12 px-4 py-2.5 rounded-[4px_16px_16px_16px] bg-muted/10 border border-border/30 text-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
             Passo concluído
          </span>
        </div>
        <div className="text-muted-foreground italic text-xs mt-0.5 line-clamp-1 hover:line-clamp-none transition-all">
          {block.content}
        </div>
      </div>
    </div>
  );
});

ThinkingCard.displayName = 'ThinkingCard';
