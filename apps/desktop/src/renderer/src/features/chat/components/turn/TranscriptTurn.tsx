/**
 * TranscriptTurn - Groups blocks by conversation turn
 *
 * Performance:
 * - Subscribes only to turn data, not entire transcript
 * - Memoized to prevent re-renders when siblings change
 * - Renders children via TranscriptBlockRenderer
 *
 * @optimization Visual grouping with turn indicator
 */

import React, { memo } from 'react';
import { useTurnBlockIds } from '../../store/chatStore';
import { TranscriptBlockRenderer } from '../blocks/TranscriptBlockRenderer';
import { recordChatRender } from '../../perf/chatPerf';

interface TranscriptTurnProps {
  turnId: string;
  /** Show visual separator between turns */
  showSeparator?: boolean;
}

export const TranscriptTurn = memo(({ turnId, showSeparator = true }: TranscriptTurnProps) => {
  recordChatRender('TranscriptTurn');
  const blockIds = useTurnBlockIds(turnId);

  if (blockIds.length === 0) return null;

  return (
    <div className="relative">
      {/* Separator line */}
      {showSeparator && (
        <div className="absolute -top-4 left-0 right-0 h-4 bg-linear-to-b from-background/80 to-transparent pointer-events-none" />
      )}
      {/* Blocks in this turn */}
      <div className="space-y-1">
        {blockIds.map((blockId) => (
          <TranscriptBlockRenderer key={blockId} blockId={blockId} />
        ))}
      </div>
    </div>
  );
});

TranscriptTurn.displayName = 'TranscriptTurn';
