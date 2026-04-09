import React, { memo, useState, useEffect } from 'react';
import { Loader2, Play, Terminal as TerminalIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { TerminalBlock } from '../../types/block.types';

export const TerminalCard = memo(({ block }: { block: TerminalBlock }) => {
  const isRunning = block.status === 'running' || block.status === 'streaming';
  const [isExpanded, setIsExpanded] = useState(isRunning);

  // Auto-expand when it starts running
  useEffect(() => {
    if (isRunning) {
      setIsExpanded(true);
    }
  }, [isRunning]);

  return (
    <div className="flex w-full group py-1 animate-fade-in text-foreground">
      <div className="flex-1 ml-12 rounded-lg overflow-hidden border border-border bg-muted/10 font-mono text-[13px] shadow-inner transition-all hover:border-muted-foreground/30">
        {/* Terminal Header */}
        <div 
          className="flex items-center gap-2.5 px-4 py-2 bg-muted/20 border-b border-border border-transparent text-muted-foreground select-none cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
             <ChevronRight className="w-3.5 h-3.5" />
          )}
          <TerminalIcon className="w-3.5 h-3.5" />
          <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-widest">{block.cwd || 'terminal'}</span>
          {isRunning ? (
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse outline outline-2 outline-amber-500/20" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </div>

        {/* Terminal Body */}
        {isExpanded && (
          <div className="p-4 overflow-x-auto text-foreground/90 leading-relaxed font-mono">
            <div className="flex gap-2">
              <span className="text-muted-foreground/40 font-bold">$</span>
              <span className="text-foreground font-semibold">{block.command}</span>
            </div>

            {(block.output || isRunning) && (
              <div className="mt-3 text-muted-foreground whitespace-pre-wrap break-all border-t border-border/40 pt-3">
                {block.output}
                {isRunning && (
                  <span className="inline-block w-1.5 h-3.5 ml-1.5 align-middle bg-foreground/30 animate-pulse" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

TerminalCard.displayName = 'TerminalCard';
