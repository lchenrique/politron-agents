/**
 * ScrollToBottomButton - Minimalist floating round button to scroll to bottom
 *
 * Performance:
 * - Only visible when user has scrolled up
 * - Memoized to prevent re-renders
 * - Centered at the bottom of the chat viewport
 */

import React, { memo } from 'react';
import { useAutoScroll, useChatStore, useUserScrolledUp } from '../../store/chatStore';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      className={cn(
        'absolute bottom-8 left-1/2 -translate-x-1/2 z-50',
        'flex items-center justify-center w-10 h-10',
        'rounded-full bg-primary hover:bg-primary/90',
        'text-primary-foreground',
        'shadow-2xl shadow-black/30',
        'transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)',
        'hover:scale-110 active:scale-95 border border-primary-foreground/10 backdrop-blur-sm',
        'animate-in fade-in zoom-in slide-in-from-bottom-2'
      )}
      title="Ir para o final"
    >
      <ChevronDown className="w-5 h-5" />
    </button>
  );
});

ScrollToBottomButton.displayName = 'ScrollToBottomButton';
