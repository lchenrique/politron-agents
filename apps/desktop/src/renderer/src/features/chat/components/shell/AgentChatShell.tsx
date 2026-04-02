/**
 * AgentChatShell - Main chat container
 *
 * Performance:
 * - Uses the OpenCode transcript bridge instead of local mock timers
 * - Keeps shell rendering cheap while the bridge translates IPC events to blocks
 * - Relies on turn-based virtualization for better stability during streaming
 */

import React, { memo } from 'react';
import { TranscriptViewport } from './TranscriptViewport';
import { PromptInput } from '../input/PromptInput';
import { useChatStore } from '../../store/chatStore';
import { useOpencodeTranscriptBridge } from '../../hooks/useOpencodeTranscriptBridge';
import { recordChatRender } from '../../perf/chatPerf';

export const AgentChatShell = memo(function AgentChatShell() {
  recordChatRender('AgentChatShell');
  const clearChat = useChatStore((state) => state.clearChat);
  const { activeAgent, header, sendMessage } = useOpencodeTranscriptBridge();

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans border-l border-zinc-800">
      <header className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex flex-col">
          <h2 className="text-sm font-medium text-zinc-200">{header.title}</h2>
          <span className="text-xs text-zinc-500">{header.subtitle}</span>
        </div>
        <button
          onClick={() => clearChat()}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <TranscriptViewport />
      </div>

      <div className="p-4 bg-zinc-950">
        <PromptInput
          onSend={sendMessage}
          selectedModel={activeAgent?.catalogSlug || 'opencode-agent'}
        />
      </div>
    </div>
  );
});

AgentChatShell.displayName = 'AgentChatShell';
