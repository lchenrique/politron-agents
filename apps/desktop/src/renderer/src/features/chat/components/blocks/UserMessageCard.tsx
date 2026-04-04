import { memo } from 'react';
import { UserMessageBlock } from '../../types/block.types';
import { User } from 'lucide-react';

export const UserMessageCard = memo(({ block }: { block: UserMessageBlock }) => {
  return (
    <div className="flex w-full group py-4 items-start">
      {/* Icon/Avatar area on the left */}
      <div className="w-8 shrink-0 flex items-start justify-center mt-0.5">
        <div className="w-6 h-6 rounded-lg bg-card border border-border/20 flex items-center justify-center text-primary shadow-xs">
          <User className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Content in a bubble */}
      <div className="flex-1 px-4 min-w-0">
        <div className="inline-block max-w-[90%] bg-muted border border-border/30 rounded-2xl px-4 py-2.5 text-foreground shadow-xs">
          <div className="text-sm md:text-base whitespace-pre-wrap leading-relaxed wrap-break-word">
            {block.content}
          </div>
        </div>
      </div>
    </div>
  );
});

UserMessageCard.displayName = 'UserMessageCard';
