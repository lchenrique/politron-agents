import { memo, useMemo } from 'react';
import clsx from 'clsx';
import { ArrowRight, Bot, CheckCircle2, FileText, Loader2, Sparkles, XCircle } from 'lucide-react';
import { useBlock } from '../../store/chatStore';
import type { SubAgentBlock } from '../../types/block.types';

interface SubAgentCardProps {
  blockId: string;
}

export const SubAgentCard = memo(({ blockId }: SubAgentCardProps) => {
  const block = useBlock(blockId) as SubAgentBlock | undefined;

  const statusLabel = useMemo(() => {
    if (!block) return 'Pendente';
    if (block.status === 'error') return 'Erro';
    if (block.status === 'success') return 'Concluído';
    if (block.status === 'cancelled') return 'Cancelado';
    return 'Em execução';
  }, [block]);

  const statusIcon = useMemo(() => {
    if (!block) return <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />;
    if (block.status === 'error') return <div className="w-1.5 h-1.5 rounded-full bg-destructive" />;
    if (block.status === 'success') return <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />;
    return <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse outline outline-2 outline-amber-500/20" />;
  }, [block]);

  if (!block || block.type !== 'sub-agent') {
    return null;
  }

  const isRunning = block.status === 'running' || block.status === 'streaming' || Boolean(block.isHandoffPlaceholder);
  const showResult = Boolean(block.result && block.result.trim() && block.result.trim() !== (block.handoffMessage || block.task).trim());

  return (
    <div className="group flex w-full py-2 animate-fade-in text-foreground">
      <div className="ml-12 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all hover:border-muted-foreground/30">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Handoff de Agente</span>
          </div>
          
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className={clsx(
              "text-[10px] font-bold uppercase tracking-wider",
              block.status === 'error' ? "text-destructive" : block.status === 'success' ? "text-emerald-600" : "text-amber-600"
            )}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="px-4 py-4">
          {/* Transfer Info */}
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <span className="text-muted-foreground">{block.fromAgentName || 'Agente'}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>{block.agentName}</span>
          </div>

          {/* Task Box */}
          <div className="mt-3 whitespace-pre-wrap rounded-md bg-muted/10 border border-border px-4 py-3 text-[14px] leading-relaxed text-foreground/90 shadow-inner">
            {block.handoffMessage || block.task}
          </div>

          {/* Result Box (if any) */}
          {showResult && (
            <div className="mt-2 rounded-md bg-muted/5 border border-border/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground italic">
              {block.result}
            </div>
          )}

          {/* Footer details */}
          {(block.teamName || block.files?.length || block.branchName) && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {block.teamName && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                   <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                   {block.teamName}
                </div>
              )}
              {block.branchName && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-l border-border pl-3">
                   <FileText className="h-3 w-3 opacity-60" />
                   {block.branchName}
                </div>
              )}
              {block.files?.length ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-l border-border pl-3">
                   {block.files.length} arquivos
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

SubAgentCard.displayName = 'SubAgentCard';
