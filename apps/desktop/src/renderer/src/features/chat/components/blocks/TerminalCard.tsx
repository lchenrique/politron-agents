import React, { memo } from 'react';
import { Loader2, Play, Terminal as TerminalIcon } from 'lucide-react';
import { TerminalBlock } from '../../types/block.types';

export const TerminalCard = memo(({ block }: { block: TerminalBlock }) => {
  const isRunning = block.status === 'running' || block.status === 'streaming';

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-border bg-background/50 font-mono text-sm leading-relaxed">
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary border-b border-border text-muted-foreground select-none">
          <TerminalIcon className="w-4 h-4" />
          <span className="flex-1 truncate">{block.cwd || '~'}</span>
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" style={{ willChange: 'transform' }} />
          ) : (
            <Play className="w-4 h-4 text-muted-foreground/40" />
          )}
        </div>

        <div className="p-4 overflow-x-auto text-foreground/90">
          <div className="mb-2 text-primary">
            <span className="text-emerald-400 mr-2">$</span>
            {block.command}
          </div>

          <div className="whitespace-pre-wrap text-muted-foreground">
            {block.output}
            {isRunning && (
              <span className="inline-block w-2 h-4 ml-1 align-middle bg-primary/40 animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TerminalCard.displayName = 'TerminalCard';
