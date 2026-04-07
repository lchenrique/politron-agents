import { memo } from 'react';
import { ArrowRightLeft, CornerDownRight, FileText, Sparkles } from 'lucide-react';
import { useBlock } from '../../store/chatStore';
import type { DelegationBlock } from '../../types/block.types';

export const DelegationCard = memo(({ blockId }: { blockId: string }) => {
  const block = useBlock(blockId) as DelegationBlock | undefined;

  if (!block || block.type !== 'delegation') {
    return null;
  }

  const fromName = block.fromAgentName || block.fromAgentId || 'agente';
  const toName = block.toAgentName || block.toAgentId || 'agente';
  const teamLabel = block.teamName || block.teamId || 'time';

  return (
    <div className="group flex w-full py-2">
      <div className="ml-12 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-secondary/20 shadow-sm shadow-black/5">
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-200">
            <Sparkles className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200">
                <ArrowRightLeft className="h-3 w-3" />
                Delegação
              </span>
              <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {teamLabel}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span className="text-foreground/80">{fromName}</span>
              <CornerDownRight className="h-4 w-4 text-muted-foreground/60" />
              <span className="text-foreground">{toName}</span>
            </div>

            <div className="mt-3 rounded-xl border border-border/60 bg-background/30 px-4 py-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Mensagem do Tech Lead
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100/90">
                {block.task}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/35 px-2 py-1">
                <FileText className="h-3 w-3" />
                {block.statusMessage || 'Tarefa delegada para outro agente do time'}
              </span>
              {block.branchName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/35 px-2 py-1">
                  <span className="font-semibold uppercase tracking-[0.18em]">Branch</span>
                  {block.branchName}
                </span>
              )}
            </div>

            {block.files?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {block.files.map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
                  >
                    <FileText className="h-3 w-3" />
                    {file}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

DelegationCard.displayName = 'DelegationCard';
