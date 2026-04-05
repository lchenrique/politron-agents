/**
 * TranscriptViewport - Virtualized transcript list with auto-scroll
 *
 * Performance:
 * - TanStack Virtual for O(1) render on large transcripts
 * - Only renders visible items + overscan
 * - Sticky bottom when autoScroll is enabled
 * - User can scroll up without forced jump
 *
 * @optimization Auto-scroll disabled when user scrolls up, re-enabled on button click
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTurnIds, useAutoScroll, useChatStore, useBlockIds } from '../../store/chatStore';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { TranscriptTurn } from '../turn/TranscriptTurn';
import { recordChatRender } from '../../perf/chatPerf';

export function TranscriptViewport() {
  recordChatRender('TranscriptViewport');
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnIds = useTurnIds();
  const blockIds = useBlockIds();
  const autoScroll = useAutoScroll();
  const setAutoScroll = useChatStore((state) => state.setAutoScroll);
  const setUserScrolledUp = useChatStore((state) => state.setUserScrolledUp);
  const previousBlockCount = useRef(blockIds.length);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isNearBottomRef = useRef(true);
  const isScrollingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const useVirtualizedList = turnIds.length > 8;

  // TanStack Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: useVirtualizedList ? turnIds.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 220,
    overscan: 3,
  });

  // Autoscroll effect when new blocks are added
  useEffect(() => {
    if (autoScroll && blockIds.length > previousBlockCount.current) {
      isScrollingRef.current = true;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      // Reset flag after scroll completes
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    }
    previousBlockCount.current = blockIds.length;
  }, [autoScroll, blockIds.length]);

  // ResizeObserver to keep scroll at bottom during active streaming when content grows vertically
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const contentEl = el.firstElementChild;
    if (!contentEl) return;

    const observer = new ResizeObserver(() => {
      if (autoScroll) {
        isScrollingRef.current = true;
        el.scrollTop = el.scrollHeight;
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 50);
      }
    });

    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [autoScroll]);

  // Detect scroll position to show/hide ScrollToBottomButton
  // IMPORTANT: Don't update state if we're programmatically scrolling
  const handleScroll = useCallback(() => {
    if (isScrollingRef.current) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;

      const el = scrollRef.current;
      if (!el) return;

      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < 150;

      if (isNearBottomRef.current !== nearBottom) {
        isNearBottomRef.current = nearBottom;
        setIsNearBottom(nearBottom);
      }

      if (!nearBottom && autoScroll) {
        setAutoScroll(false);
        setUserScrolledUp(true);
      }
    });
  }, [autoScroll, setAutoScroll, setUserScrolledUp]);

  // Re-enable autoScroll when near bottom and ScrollToBottomButton is clicked
  const handleScrollToBottom = useCallback(() => {
    setAutoScroll(true);
    setUserScrolledUp(false);
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    if (scrollRef.current) {
      isScrollingRef.current = true;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    }
  }, [setAutoScroll, setUserScrolledUp]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Scrollable container */}
      <div
        className="absolute inset-0 overflow-y-auto chat-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {useVirtualizedList ? (
          <div
            className="relative w-full"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const turnId = turnIds[virtualRow.index];
              return (
                <div
                  key={turnId}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="py-2 px-4 max-w-4xl mx-auto">
                    <TranscriptTurn
                      turnId={turnId}
                      showSeparator={virtualRow.index > 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-2 px-4 max-w-4xl mx-auto space-y-2">
            {turnIds.map((turnId, index) => (
              <TranscriptTurn
                key={turnId}
                turnId={turnId}
                showSeparator={index > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scroll to bottom button - only visible when not near bottom */}
      {!isNearBottom && turnIds.length > 0 && (
        <ScrollToBottomButton onClick={handleScrollToBottom} />
      )}
    </div>
  );
}
