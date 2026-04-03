import React, { memo } from 'react';
import { UserMessageBlock } from '../../types/block.types';
import { User } from 'lucide-react';

export const UserMessageCard = memo(({ block }: { block: UserMessageBlock }) => {
  return (
    <div className="flex w-full group py-4 items-start">
      {/* Icon/Avatar area on the left */}
      <div className="w-8 flex-shrink-0 flex items-start justify-center mt-0.5">
        <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-sm">
          <User className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Content in a bubble */}
      <div className="flex-1 px-4 min-w-0">
        <div className="inline-block max-w-[90%] bg-zinc-800/40 border border-zinc-700/30 rounded-2xl px-4 py-2.5 text-zinc-100 shadow-sm">
          <div className="text-sm md:text-base whitespace-pre-wrap leading-relaxed break-words">
            {block.content}
          </div>
        </div>
      </div>
    </div>
  );
});

