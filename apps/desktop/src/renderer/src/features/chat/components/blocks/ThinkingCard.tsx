import React, { memo } from 'react';
import { ThinkingBlock } from '../../types/block.types';
import { Brain, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

export const ThinkingCard = memo(({ block }: { block: ThinkingBlock }) => {
  const isDone = block.status === 'success';

  // Don't show thinking block at all during streaming - only show when done
  if (!isDone) return null;

  return (
    <div className="flex w-full group py-2 animate-fade-in">
      <div className="flex-1 ml-12 px-4 py-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-sm">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-zinc-400">
             Thought Process
          </span>
        </div>
        <div className="text-zinc-500 whitespace-pre-wrap transition-all line-clamp-2 max-h-12 overflow-hidden text-clip hover:line-clamp-none hover:max-h-[500px]">
          {block.content}
        </div>
      </div>
    </div>
  );
});
