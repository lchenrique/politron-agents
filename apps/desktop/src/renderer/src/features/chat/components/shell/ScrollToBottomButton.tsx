/**
 * ScrollToBottomButton - Floating button to scroll to bottom
 *
 * Performance:
 * - Only visible when user has scrolled up
 * - Memoized to prevent re-renders
 * - Positioned fixed, not affecting layout
 */

import React, { memo } from 'react';
import { useAutoScroll, useChatStore, useUserScrolledUp } from '../../store/chatStore';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface ScrollToBottomButtonProps {
  /** Optional external onClick handler - if provided, internal scroll logic is skipped */
  onClick?: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = memo(({ onClick }) => {
  const autoScroll = useAutoScroll();
  const userScrolledUp = useUserScrolledUp();
  const setAutoScroll = useChatStore((state) => state.setAutoScroll);
  const setUserScrolledUp = useChatStore((state) => state.setUserScrolledUp);

  // Only show when user has scrolled up and autoScroll is off
  if (!userScrolledUp && autoScroll) return null;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior
      setAutoScroll(true);
      setUserScrolledUp(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'fixed bottom-24 right-8 z-50',
        'flex items-center gap-2 px-4 py-2.5',
        'rounded-full bg-indigo-600 hover:bg-indigo-500',
        'text-white text-sm font-medium',
        'shadow-lg shadow-indigo-500/20',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95'
      )}
      style={{
        boxShadow: '0 4px 20px rgba(79, 70, 229, 0.3)',
      }}
    >
      <span>Scroll to bottom</span>
      <ChevronDown className="w-4 h-4" />
    </button>
  );
});

ScrollToBottomButton.displayName = 'ScrollToBottomButton';
