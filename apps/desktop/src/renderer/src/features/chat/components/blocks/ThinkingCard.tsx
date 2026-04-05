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
      <div className="flex w-full group py-2 animate-fade-in">
        <div className="flex-1 ml-12 px-4 py-3 rounded-xl bg-secondary/20 border border-border/40 text-sm">
          <div className="flex items-center mb-2">
            <div className="agent-loader text-primary shrink-0 mr-4">
              <div className="square" id="sq1"></div>
              <div className="square" id="sq2"></div>
              <div className="square" id="sq3"></div>
              <div className="square" id="sq4"></div>
              <div className="square" id="sq5"></div>
              <div className="square" id="sq6"></div>
              <div className="square" id="sq7"></div>
              <div className="square" id="sq8"></div>
              <div className="square" id="sq9"></div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
              Pensando...
            </span>
          </div>
          <div className="text-muted-foreground/60 italic whitespace-pre-wrap mt-1">
            {block.content || "Processando resposta do agente..."}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex w-full group py-2 animate-fade-in opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex-1 ml-12 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm flex gap-3 items-start">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 overflow-hidden">
            <span className="text-[10px] font-black uppercase tracking-widest text-destructive mb-1 block">
               Erro de Execução
            </span>
            <div className="text-destructive/80 italic whitespace-pre-wrap transition-all break-words text-xs">
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
