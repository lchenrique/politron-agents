import { memo, useMemo } from 'react';
import clsx from 'clsx';
import { ArrowRight, Bot, CheckCircle2, FileText, FolderGit2, Loader2, Sparkles, XCircle } from 'lucide-react';
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
    if (!block) return <Bot className="h-3 w-3" />;
    if (block.status === 'error') return <XCircle className="h-3 w-3" />;
    if (block.status === 'success') return <CheckCircle2 className="h-3 w-3" />;
    return <Loader2 className="h-3 w-3 animate-spin" />;
  }, [block]);

  if (!block || block.type !== 'sub-agent') {
    return null;
  }

  const routeLabel = block.fromAgentName ? `${block.fromAgentName} -> ${block.agentName}` : block.agentName;
  const isRunning = block.status === 'running' || block.status === 'streaming' || Boolean(block.isHandoffPlaceholder);
  const showResult = Boolean(block.result && block.result.trim() && block.result.trim() !== (block.handoffMessage || block.task).trim());

  return (
    <div className="group flex w-full py-2">
      <div className="ml-12 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-secondary/15 shadow-sm shadow-black/5">
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/35 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Handoff do time</span>
          </div>

          {(block.teamName || block.branchName) && (
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {block.teamName && (
                <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1">
                  {block.teamName}
                </span>
              )}
              {block.branchName && (
                <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1">
                  {block.branchName}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              <ArrowRight className="h-3 w-3" />
              {routeLabel}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/45 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <FolderGit2 className="h-3 w-3" />
              {block.teamName || block.teamId || 'time'}
            </span>

            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                block.status === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                  : block.status === 'success'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
              )}
            >
              {statusIcon}
              {statusLabel}
            </span>
          </div>

          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border/50 bg-background/30 px-4 py-3 text-sm leading-relaxed text-zinc-100/90">
            {block.handoffMessage || block.task}
          </div>

          {showResult && (
            <div className="mt-3 rounded-xl border border-border/50 bg-background/20 px-4 py-3 text-sm leading-relaxed text-zinc-300/90">
              {block.result}
            </div>
          )}

          {(block.fromAgentName || block.files?.length || block.isHandoffPlaceholder) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {block.fromAgentName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/35 px-2 py-1">
                  <Bot className="h-3 w-3" />
                  {block.fromAgentName}
                </span>
              )}
              {block.isHandoffPlaceholder && isRunning && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/8 px-2 py-1 text-amber-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando execução
                </span>
              )}
              {block.files?.length ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/35 px-2 py-1">
                  <FileText className="h-3 w-3" />
                  {block.files.length} arquivo(s)
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

SubAgentCard.displayName = 'SubAgentCard';
