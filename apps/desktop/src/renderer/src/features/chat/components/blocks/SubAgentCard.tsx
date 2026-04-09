import { memo, useMemo } from 'react';
import clsx from 'clsx';
import { ArrowRight, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import type { SubAgentBlock } from '../../types/block.types';

interface SubAgentCardProps {
  blockId: string;
}

export const SubAgentCard = memo(({ blockId }: SubAgentCardProps) => {
  const block = useBlock(blockId) as SubAgentBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  const statusLabel = useMemo(() => {
    if (!block) return 'Pendente';
    if (block.status === 'error') return 'Erro';
    if (block.status === 'success') return 'Concluído';
    if (block.status === 'cancelled') return 'Cancelado';
    return block.isHandoffPlaceholder ? 'Aguardando retorno' : 'Em andamento';
  }, [block]);

  const statusTone = useMemo(() => {
    if (!block) return 'text-muted-foreground';
    if (block.status === 'error') return 'text-destructive';
    if (block.status === 'success') return 'text-emerald-600';
    return 'text-amber-600';
  }, [block]);

  if (!block || block.type !== 'sub-agent') {
    return null;
  }

  const summary = block.result?.trim() || block.handoffMessage || block.task;

  return (
    <div className=" flex w-full py-2 text-foreground">
      <div className="ml-12 flex-1 overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-muted-foreground/30">
        <div
          className="flex items-center justify-between gap-4 border-b border-border bg-muted/20 px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => toggleBlockExpanded(blockId)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <Sparkles className="h-3 w-3 text-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Comunicação de Agente
            </span>
          </div>

          <span className={clsx('text-[10px] font-bold uppercase tracking-wider', statusTone)}>
            {statusLabel}
          </span>
        </div>

        {isExpanded && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span className="text-muted-foreground">{block.fromAgentName || 'Agente'}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span>{block.agentName}</span>
            </div>

            <div className="mt-3 rounded-md border border-border bg-muted/10 px-4 py-3 text-[14px] leading-relaxed text-foreground/90">
              {summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SubAgentCard.displayName = 'SubAgentCard';
