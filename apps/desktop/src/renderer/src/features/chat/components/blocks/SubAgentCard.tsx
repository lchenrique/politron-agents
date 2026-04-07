/**
 * SubAgentCard - Displays a sub-agent or subtask
 *
 * Performance:
 * - Memoized
 * - Shows agent/task hierarchy
 * - Expandable for detailed result
 */

import React, { memo, useMemo } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, Bot, Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight, FolderGit2, FileText } from 'lucide-react';
import { SubAgentBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';

interface SubAgentCardProps {
  blockId: string;
}

export const SubAgentCard = memo(({ blockId }: SubAgentCardProps) => {
  const block = useBlock(blockId) as SubAgentBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);

  const statusIcon = useMemo(() => {
    if (!block) return <Bot className="w-4 h-4 text-zinc-500" />;

    const isRunning = block.status === 'running' || block.status === 'streaming';
    if (isRunning) return <Loader2 className="w-4 h-4 animate-spin text-amber-500" />;
    if (block.status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (block.status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Bot className="w-4 h-4 text-zinc-500" />;
  }, [block]);

  const timeline = useMemo(() => {
    const lines = (block?.result || '').split('\n').map((line) => line.trim()).filter(Boolean);
    return lines.map((line, index) => ({
      id: `${block?.id ?? 'sub-agent'}-step-${index}`,
      line,
      isMeta: line.startsWith('Transferido por:') || line.startsWith('Equipe:') || line.startsWith('Branch:'),
    }));
  }, [block?.id, block?.result]);

  if (!block || block.type !== 'sub-agent') return null;

  const routeLabel = block.fromAgentName ? `${block.fromAgentName} -> ${block.agentName}` : block.agentName;
  const hasDetails = timeline.length > 0;
  const isHandoffPlaceholder = Boolean(block.isHandoffPlaceholder);

  return (
    <div className="group flex w-full py-2">
      <div className="ml-12 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-zinc-900/70 to-zinc-950/60 shadow-lg shadow-black/10">
        {isHandoffPlaceholder ? (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Tech Lead handoff</span>
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

            <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                  <ArrowRight className="h-3 w-3" />
                  {routeLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <FolderGit2 className="h-3 w-3" />
                  {block.teamName || block.teamId || 'time'}
                </span>
              </div>

              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200/90">
                {block.handoffMessage || block.task}
              </div>

              <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span>Delegado pelo tech lead, aguardando execução</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 pt-3">
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Sub-agent handoff</span>
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

            <button
              onClick={() => hasDetails && toggleBlockExpanded(blockId)}
              className={clsx(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                hasDetails ? 'cursor-pointer hover:bg-secondary/20' : ''
              )}
              disabled={!hasDetails}
            >
              <div className="mt-0.5 shrink-0">{statusIcon}</div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                    <ArrowRight className="h-3 w-3" />
                    {routeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <FolderGit2 className="h-3 w-3" />
                    {block.teamName || block.teamId || 'time'}
                  </span>
                </div>
                <div className="mt-2 text-sm text-zinc-300/90">
                  {block.task}
                </div>
              </div>

              {hasDetails && (
                <div className="shrink-0 flex items-center gap-2">
                  <span className="hidden rounded-full border border-border/60 bg-secondary/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:inline-flex">
                    Detalhes
                  </span>
                  <div className="text-zinc-500">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              )}
            </button>

            {hasDetails && isExpanded && (
              <div className="border-t border-border/50 px-4 pb-4">
                <div className="mt-3 rounded-xl border border-border/50 bg-background/45 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Linha do tempo
                  </div>
                  <div className="space-y-3">
                    {timeline.map((step, index) => (
                      <div key={step.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={clsx(
                            'mt-1.5 h-2.5 w-2.5 rounded-full',
                            step.isMeta ? 'bg-primary/60' : index === timeline.length - 1 ? 'bg-emerald-500' : 'bg-zinc-500/70'
                          )} />
                          {index !== timeline.length - 1 && (
                            <div className="mt-1 h-full min-h-6 w-px bg-border/60" />
                          )}
                        </div>
                        <div className="flex-1 text-sm leading-relaxed text-zinc-200/90">
                          {step.line}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

SubAgentCard.displayName = 'SubAgentCard';
