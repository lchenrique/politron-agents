import { memo } from 'react';
import { ThinkingBlock } from '../../types/block.types';
import { CheckCircle2 } from 'lucide-react';

export const ThinkingCard = memo(({ block }: { block: ThinkingBlock }) => {
  const isDone = block.status === 'success';

  // Don't show thinking block at all during streaming - only show when done
  if (!isDone) return null;

  return (
    <div className="flex w-full group py-2 animate-fade-in opacity-80 hover:opacity-100 transition-opacity">
      <div className="flex-1 ml-12 px-4 py-3 rounded-xl bg-secondary/20 border border-border/40 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
             Pensamento Concluído
          </span>
        </div>
        <div className="text-muted-foreground/80 italic whitespace-pre-wrap transition-all line-clamp-2 max-h-12 overflow-hidden text-clip hover:line-clamp-none hover:max-h-[500px]">
          {block.content}
        </div>
      </div>
    </div>
  );
});

ThinkingCard.displayName = 'ThinkingCard';
