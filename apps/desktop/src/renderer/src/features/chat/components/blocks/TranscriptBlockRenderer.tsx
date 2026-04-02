/**
 * TranscriptBlockRenderer - Dispatches to correct block component
 *
 * Performance:
 * - Memoized component
 * - Only re-renders when the specific block changes
 * - Lazy loads heavy components (DiffCard)
 *
 * @optimization Each block type is isolated - no shared state re-renders
 */

import React, { memo, lazy, Suspense } from 'react';
import { useBlock } from '../../store/chatStore';
import { recordChatRender } from '../../perf/chatPerf';

// Base components - statically imported for fast common blocks
import { UserMessageCard } from './UserMessageCard';
import { AssistantMessageCard } from './AssistantMessageCard';
import { ThinkingCard } from './ThinkingCard';
import { TerminalCard } from './TerminalCard';
import { ToolCallCard } from './ToolCallCard';
import { ToolResultCard } from './ToolResultCard';
import { FileChangesCard } from './FileChangesCard';
import { ApprovalCard } from './ApprovalCard';
import { SubAgentCard } from './SubAgentCard';

// Heavy components - lazy loaded for code splitting
const DiffCard = lazy(() => import('./DiffCard'));

interface TranscriptBlockRendererProps {
  blockId: string;
}

export const TranscriptBlockRenderer = memo(({ blockId }: TranscriptBlockRendererProps) => {
  // Extrai apenas o bloco necessário. Se ele mudar, só este renderiza.
  const block = useBlock(blockId);
  recordChatRender(block ? `TranscriptBlockRenderer:${block.type}` : 'TranscriptBlockRenderer:missing');

  if (!block) {
    return (
      <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
        Block not found: {blockId}
      </div>
    );
  }

  switch (block.type) {
    // === USER & ASSISTANT ===
    case 'user-message':
      return <UserMessageCard block={block} />;

    case 'assistant-message':
      return <AssistantMessageCard block={block} />;

    // === THINKING ===
    case 'thinking':
      return <ThinkingCard block={block} />;

    // === TOOLS ===
    case 'tool-call':
      return <ToolCallCard blockId={block.id} />;

    case 'tool-result':
      return <ToolResultCard blockId={block.id} />;

    // === TERMINAL ===
    case 'terminal':
      return <TerminalCard block={block} />;

    // === DIFF (Lazy loaded) ===
    case 'diff':
      return (
        <Suspense
          fallback={
            <div className="flex w-full group py-2">
              <div className="flex-1 ml-12 rounded-xl bg-zinc-900/40 animate-pulse h-20" />
            </div>
          }
        >
          <DiffCard blockId={block.id} />
        </Suspense>
      );

    // === FILE CHANGES ===
    case 'file-changes':
      return <FileChangesCard blockId={block.id} />;

    // === APPROVAL ===
    case 'approval':
      return <ApprovalCard blockId={block.id} />;

    // === SUB-AGENT ===
    case 'sub-agent':
      return <SubAgentCard blockId={block.id} />;

    // === UNKNOWN ===
    default:
      return (
        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          Unsupported block type: {(block as { type: string }).type}
        </div>
      );
  }
});

TranscriptBlockRenderer.displayName = 'TranscriptBlockRenderer';
