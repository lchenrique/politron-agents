import { memo } from 'react';
import { ApprovalBlock } from '../../types/block.types';
import { useBlock, useChatStore } from '../../store/chatStore';
import { ShieldCheck, X, Check } from 'lucide-react';
import clsx from 'clsx';

interface ApprovalCardProps {
  blockId: string;
  onApprove?: () => void;
  onReject?: () => void;
}

export const ApprovalCard = memo(({ blockId, onApprove, onReject }: ApprovalCardProps) => {
  const block = useBlock(blockId) as ApprovalBlock | undefined;
  const updateBlock = useChatStore((state) => state.updateBlock);

  if (!block || block.type !== 'approval') return null;

  const handleApprove = () => {
    updateBlock(blockId, { isApproved: true, status: 'success' });
    onApprove?.();
  };

  const handleReject = () => {
    updateBlock(blockId, { isApproved: false, status: 'cancelled' });
    onReject?.();
  };

  const isPending = block.isApproved === undefined;
  const isApproved = block.isApproved === true;

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-amber-500/30 bg-amber-500/5">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-500/20">
          <div className="shrink-0 text-amber-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-600 dark:text-amber-200">
              Approval Required
            </span>
          </div>
          <div
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium',
              isPending && 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
              isApproved && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
              !isPending && !isApproved && 'bg-red-500/20 text-red-600 dark:text-red-400'
            )}
          >
            {isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected'}
          </div>
        </div>

        {/* Message */}
        <div className="px-4 py-3">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {block.message}
          </p>
        </div>

        {/* Actions - only show if pending */}
        {isPending && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-amber-500/20 bg-muted/30">
            <button
              onClick={handleApprove}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-emerald-600 hover:bg-emerald-500',
                'text-white text-sm font-medium',
                'transition-colors'
              )}
            >
              <Check className="w-4 h-4" />
              <span>Approve</span>
            </button>
            <button
              onClick={handleReject}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-muted-foreground/10 hover:bg-muted-foreground/20 text-muted-foreground',
                'text-sm font-medium transition-colors'
              )}
            >
              <X className="w-4 h-4" />
              <span>Reject</span>
            </button>
            <span className="flex-1 text-xs text-muted-foreground/60 pr-2">
              Esta ação será auditada para segurança do sistema.
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

ApprovalCard.displayName = 'ApprovalCard';
