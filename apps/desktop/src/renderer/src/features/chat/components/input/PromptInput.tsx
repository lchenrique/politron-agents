import React, { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { MentionMenu } from './MentionMenu';
import { PromptToolbar } from './PromptToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';

interface PromptInputProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onMention?: () => void;
  onSlashCommand?: () => void;
  onModelChange?: () => void;
  selectedModel?: string;
}

export function PromptInput({
  onSend,
  onAttach,
  onMention,
  onSlashCommand,
  onModelChange,
  selectedModel = 'gemini-1.5-pro-exp',
}: PromptInputProps) {
  const [text, setText] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounced auto-resize to avoid layout thrashing on each keystroke
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Only resize if needed - skip if height hasn't changed
    const newHeight = Math.min(textarea.scrollHeight, 250);
    if (textarea.offsetHeight !== newHeight) {
      textarea.style.height = 'auto';
      textarea.style.height = `${newHeight}px`;
    }
  }, [text]);

  const updateMenuPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const rect = textarea.getBoundingClientRect();
    setMenuPosition({ x: rect.left, y: rect.top });
  }, []);

  const closeMenus = useCallback(() => {
    setShowMentionMenu(false);
    setShowSlashMenu(false);
  }, []);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || showMentionMenu || showSlashMenu) return;

    onSend(trimmed);
    setText('');
    closeMenus();
  }, [closeMenus, onSend, showMentionMenu, showSlashMenu, text]);

  const handleTextChange = useCallback((newText: string) => {
    setText(newText);

    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = newText.slice(0, cursorPos);

    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const shouldOpenSlash =
      lastSlash !== -1 &&
      lastSlash === textBeforeCursor.length - 1 &&
      (lastSlash === 0 || textBeforeCursor[lastSlash - 1] === ' ' || textBeforeCursor[lastSlash - 1] === '\n');

    if (shouldOpenSlash) {
      setShowSlashMenu(true);
      setShowMentionMenu(false);
      updateMenuPosition();
      return;
    }

    const lastAt = textBeforeCursor.lastIndexOf('@');
    const hasMentionQuery = lastAt !== -1 && !textBeforeCursor.slice(lastAt + 1).includes(' ');

    if (hasMentionQuery) {
      setShowMentionMenu(true);
      setShowSlashMenu(false);
      updateMenuPosition();
      return;
    }

    closeMenus();
  }, [closeMenus, updateMenuPosition]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'Escape') {
      closeMenus();
    }
  }, [closeMenus, submit]);

  const handleMentionSelect = useCallback((item: { name: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const nextText = text.slice(0, lastAt) + `@${item.name} ` + text.slice(cursorPos);
    setText(nextText);
    setShowMentionMenu(false);
    textarea.focus();
  }, [text]);

  const handleSlashSelect = useCallback((command: { name: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const nextText = text.slice(0, lastSlash) + command.name + ' ' + text.slice(cursorPos);
    setText(nextText);
    setShowSlashMenu(false);
    textarea.focus();
  }, [text]);

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 transition-all group overflow-hidden">
      <PromptToolbar
        onAttach={onAttach}
        onMention={() => setShowMentionMenu((current) => !current)}
        onSlashCommand={() => setShowSlashMenu((current) => !current)}
        onModelChange={onModelChange}
        selectedModel={selectedModel}
      />

      <div className="relative px-4 py-3 flex items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="O que vamos construir hoje?"
          className="w-full bg-transparent border-none outline-none resize-none text-zinc-200 placeholder:text-zinc-600 font-sans leading-relaxed max-h-[250px] overflow-y-auto no-scrollbar"
          rows={1}
          autoFocus
        />

        <button
          onClick={submit}
          disabled={!text.trim() || showMentionMenu || showSlashMenu}
          className="flex-shrink-0 ml-2 p-2 rounded-lg bg-indigo-600 text-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
        >
          <CornerDownLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex justify-between items-center px-4 py-2 text-[11px] text-zinc-600 bg-zinc-950/30">
        <span>Use Shift + Enter para quebrar linha</span>
        <span>A IA pode cometer erros. Revise o código.</span>
      </div>

      {showMentionMenu && (
        <MentionMenu
          isOpen={showMentionMenu}
          position={menuPosition}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentionMenu(false)}
        />
      )}

      {showSlashMenu && (
        <SlashCommandMenu
          isOpen={showSlashMenu}
          position={menuPosition}
          onSelect={handleSlashSelect}
          onClose={() => setShowSlashMenu(false)}
        />
      )}
    </div>
  );
}
