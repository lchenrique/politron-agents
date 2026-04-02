/**
 * ApprovalCard - Requests user approval for an action
 *
 * Performance:
 * - Memoized
 * - Contains action buttons that trigger callbacks
 * - Visual distinction for approval-required state
 */

import React, { memo } from 'react';
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
          <div className="flex-shrink-0 text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-200">
              Approval Required
            </span>
          </div>
          <div
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium',
              isPending && 'bg-amber-500/20 text-amber-400',
              isApproved && 'bg-emerald-500/20 text-emerald-400',
              !isPending && !isApproved && 'bg-red-500/20 text-red-400'
            )}
          >
            {isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected'}
          </div>
        </div>

        {/* Message */}
        <div className="px-4 py-3">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">
            {block.message}
          </p>
        </div>

        {/* Actions - only show if pending */}
        {isPending && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-amber-500/20 bg-zinc-950/30">
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
                'bg-zinc-700 hover:bg-zinc-600',
                'text-zinc-200 text-sm font-medium',
                'transition-colors'
              )}
            >
              <X className="w-4 h-4" />
              <span>Reject</span>
            </button>
            <span className="flex-1 text-xs text-zinc-500">
              This action will be logged for security purposes
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

ApprovalCard.displayName = 'ApprovalCard';
