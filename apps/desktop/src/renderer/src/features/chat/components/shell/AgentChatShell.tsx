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
import { SessionModal } from './SessionModal';
import { useChatStore } from '../../store/chatStore';
import { useOpencodeTranscriptBridge } from '../../hooks/useOpencodeTranscriptBridge';
import { recordChatRender } from '../../perf/chatPerf';
import { History, LayoutGrid } from 'lucide-react';

export const AgentChatShell = memo(function AgentChatShell() {
  recordChatRender('AgentChatShell');
  const clearChat = useChatStore((state) => state.clearChat);
  const { activeAgent, header, sendMessage } = useOpencodeTranscriptBridge();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans rounded-3xl">
      <header className="px-5 py-3 flex items-center justify-between border-b border-zinc-900 bg-zinc-900/10">
        <div className="flex items-center gap-3">
          {/* History Modal Toggle */}
          <button
            onClick={() => setModalOpen(true)}
            className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-2 group"
          >
            <History className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium pr-1">Sessões</span>
          </button>
          
          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-zinc-100">{header.title}</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">{header.subtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => clearChat()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-all border border-transparent hover:border-zinc-800"
          >
            Novo Chat
          </button>
        </div>
      </header>

      {/* Main content: Chat Viewport */}
      <div className="flex-1 overflow-hidden relative">
        <TranscriptViewport />
      </div>

      {/* Input Area - Now centered to match TranscriptViewport max-w-4xl */}
      <div className="p-4 py-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent flex flex-col items-center">
        <div className="w-full max-w-4xl px-4">
          <PromptInput
            onSend={sendMessage}
            selectedModel={activeAgent?.catalogSlug || 'opencode-agent'}
          />
          <div className="mt-3 text-[10px] text-zinc-600 text-center uppercase tracking-[0.2em] font-medium">
            Politron OpenCode — IA Experimental
          </div>
        </div>
      </div>

      {/* Floating Modal for Sessions */}
      <SessionModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
      />
    </div>
  );
});



AgentChatShell.displayName = 'AgentChatShell';
