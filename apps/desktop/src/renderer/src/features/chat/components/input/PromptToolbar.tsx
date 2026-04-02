/**
 * PromptToolbar - Toolbar for prompt input with actions
 *
 * Performance:
 * - Separated component to allow memoization
 * - Icon buttons with tooltips
 * - Exposes callbacks for parent to handle
 */

import React, { memo } from 'react';
import { Paperclip, AtSign, Command, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface PromptToolbarProps {
  onAttach?: () => void;
  onMention?: () => void;
  onSlashCommand?: () => void;
  onModelChange?: () => void;
  selectedModel?: string;
  className?: string;
}

export const PromptToolbar = memo(({
  onAttach,
  onMention,
  onSlashCommand,
  onModelChange,
  selectedModel = 'gemini-1.5-pro-exp',
  className,
}: PromptToolbarProps) => {
  return (
    <div className={clsx('flex items-center gap-1 px-3 py-2 border-b border-zinc-800/60 text-zinc-400 bg-zinc-900/50', className)}>
      {/* Attachment button */}
      <button
        onClick={onAttach}
        className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
        title="Adicionar Arquivo (A)"
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {/* Mention button */}
      <button
        onClick={onMention}
        className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
        title="Mencionar (@)"
      >
        <AtSign className="w-4 h-4" />
      </button>

      {/* Slash command button */}
      <button
        onClick={onSlashCommand}
        className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
        title="Comandos (/)"
      >
        <Command className="w-4 h-4" />
      </button>

      <div className="flex-1" />

      {/* Model selector */}
      <button
        onClick={onModelChange}
        className="flex items-center gap-2 text-xs font-mono bg-zinc-800/80 px-2 py-1 rounded-md text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
      >
        <span>{selectedModel}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
});

PromptToolbar.displayName = 'PromptToolbar';
