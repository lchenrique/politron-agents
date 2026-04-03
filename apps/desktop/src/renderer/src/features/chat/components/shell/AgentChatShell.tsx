/**
 * AgentChatShell - Main chat container
 *
 * Performance:
 * - Uses the OpenCode transcript bridge instead of local mock timers
 * - Keeps shell rendering cheap while the bridge translates IPC events to blocks
 * - Relies on turn-based virtualization for better stability during streaming
 */

import React, { memo, useState } from 'react';
import { TranscriptViewport } from './TranscriptViewport';
import { PromptInput } from '../input/PromptInput';
import { SessionSidebar } from './SessionSidebar';
import { useChatStore } from '../../store/chatStore';
import { useOpencodeTranscriptBridge } from '../../hooks/useOpencodeTranscriptBridge';
import { recordChatRender } from '../../perf/chatPerf';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

export const AgentChatShell = memo(function AgentChatShell() {
  recordChatRender('AgentChatShell');
  const clearChat = useChatStore((state) => state.clearChat);
  const { activeAgent, header, sendMessage } = useOpencodeTranscriptBridge();
  const [sidebarVisible, setSidebarVisible] = useState(true);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans rounded-3xl">
      <header className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={sidebarVisible ? 'Ocultar sessões' : 'Mostrar sessões'}
          >
            {sidebarVisible ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>
          <div className="flex flex-col">
            <h2 className="text-sm font-medium text-zinc-200">{header.title}</h2>
            <span className="text-xs text-zinc-500">{header.subtitle}</span>
          </div>
        </div>
        <button
          onClick={() => clearChat()}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </header>

      {/* Main content: Sidebar + Chat */}
      <div className="flex-1 overflow-hidden relative flex">
        {/* Session Sidebar - Left */}
        {sidebarVisible && <SessionSidebar />}

        {/* Chat Area - Right */}
        <div className="flex-1 overflow-hidden relative">
          <TranscriptViewport />
        </div>
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
