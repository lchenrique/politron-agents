import React, { memo } from 'react';
import { UserMessageBlock } from '../../types/block.types';
import { User } from 'lucide-react';

export const UserMessageCard = memo(({ block }: { block: UserMessageBlock }) => {
  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 pr-4 text-right">
        <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
          {block.content}
        </div>
      </div>
      <div className="w-8 flex-shrink-0 flex items-start justify-center pt-1">
        <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
          <User className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
});
