import React, { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CornerDownLeft, AtSign, Slash, ShieldAlert } from 'lucide-react';
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
  const [isFocused, setIsFocused] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [slashQuery, setSlashQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize logic that correctly handles shrinking
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200); 
    textarea.style.height = `${newHeight}px`;
  }, [text]);

  const updateMenuPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const rect = textarea.parentElement?.getBoundingClientRect();
    if (!rect) return;

    // Position menu above the input bar
    setMenuPosition({ x: rect.left, y: rect.top - 8 });
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

    // Mention Logic
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const textAfterAt = textBeforeCursor.slice(lastAt + 1);
    const hasMentionQuery = lastAt !== -1 && !textAfterAt.includes(' ');

    if (hasMentionQuery) {
      setMentionQuery(textAfterAt);
      setShowMentionMenu(true);
      setShowSlashMenu(false);
      updateMenuPosition();
      return;
    }

    // Command Logic
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const textAfterSlash = textBeforeCursor.slice(lastSlash + 1);
    const isAtStart = lastSlash === 0 || textBeforeCursor[lastSlash - 1] === ' ' || textBeforeCursor[lastSlash - 1] === '\n';
    const hasSlashQuery = lastSlash !== -1 && isAtStart && !textAfterSlash.includes(' ');

    if (hasSlashQuery) {
      setSlashQuery(textAfterSlash);
      setShowSlashMenu(true);
      setShowMentionMenu(false);
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
      if (showMentionMenu || showSlashMenu) {
        closeMenus();
      } else {
        textareaRef.current?.blur();
      }
    }
  }, [closeMenus, submit, showMentionMenu, showSlashMenu]);

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

  const isActive = isFocused || text.length > 0;

  return (
    <div 
      className={`
        flex flex-col w-full max-w-4xl mx-auto rounded-3xl border transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) overflow-hidden
        ${isActive 
          ? 'bg-ide-surface-2 border-ide-indigo/30 shadow-2xl ring-1 ring-ide-indigo/10 translate-y-[-8px]' 
          : 'bg-ide-surface/80 border-ide-border shadow-lg hover:border-ide-border-subtle backdrop-blur-md'
        }
      `}
    >
      {/* Toolbar Area */}
      <div className={`
        overflow-hidden transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${isActive ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <PromptToolbar
          onAttach={onAttach}
          onMention={() => {
            setText(t => t + (t.endsWith(' ') || t === '' ? '' : ' ') + '@');
            setMentionQuery('');
            setShowMentionMenu(true);
            setShowSlashMenu(false);
            updateMenuPosition();
          }}
          onSlashCommand={() => {
            setText(t => t + (t.endsWith(' ') || t === '' ? '' : ' ') + '/');
            setSlashQuery('');
            setShowSlashMenu(true);
            setShowMentionMenu(false);
            updateMenuPosition();
          }}
          onModelChange={onModelChange}
          selectedModel={selectedModel}
        />
      </div>

      {/* Main Container - Centered Vertically */}
      <div className={`relative px-6 flex items-center transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isActive ? 'py-5' : 'py-3'}`}>
        <textarea
          ref={textareaRef}
          value={text}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="O que vamos construir hoje?"
          className="w-full bg-transparent border-none outline-none resize-none text-ide-text placeholder:text-ide-text-dim/40 font-sans text-[16px] leading-[1.6] py-1 max-h-[200px] overflow-y-auto no-scrollbar scroll-smooth"
          rows={1}
        />

        <button
          onClick={submit}
          disabled={!text.trim() || showMentionMenu || showSlashMenu}
          className={`
            flex-shrink-0 ml-4 p-3.5 rounded-2xl transition-all duration-500
            ${text.trim() 
              ? 'bg-ide-indigo text-white shadow-lg shadow-ide-indigo/30 scale-100 hover:opacity-90 active:scale-95' 
              : 'bg-ide-surface-3 text-ide-text-dim scale-90 opacity-20 pointer-events-none'
            }
          `}
        >
          <CornerDownLeft className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Simplified and Fix Footer */}
      <div className={`
        overflow-hidden transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${isActive 
          ? 'max-h-14 opacity-100 bg-ide-bg border-t border-ide-border' 
          : 'max-h-0 opacity-0'
        }
      `}>
        <div className="flex justify-between items-center px-6 py-3">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 group cursor-default">
              <kbd className="px-1.5 py-0.5 rounded-md bg-ide-surface border border-ide-border text-ide-text-dim text-[10px] font-bold">Shift + Enter</kbd>
              <span className="text-[10px] text-ide-text-dim uppercase tracking-wider font-bold group-hover:text-ide-text transition-colors">Linha</span>
            </div>
            
            <div className="flex items-center gap-1.5 group cursor-default">
              <AtSign className="w-3 h-3 text-ide-text-dim group-hover:text-ide-indigo transition-colors" />
              <span className="text-[10px] text-ide-text-dim uppercase tracking-wider font-bold group-hover:text-ide-text transition-colors">Arquivo</span>
            </div>

            <div className="flex items-center gap-1.5 group cursor-default">
              <Slash className="w-3 h-3 text-ide-text-dim group-hover:text-ide-indigo transition-colors" />
              <span className="text-[10px] text-ide-text-dim uppercase tracking-wider font-bold group-hover:text-ide-text transition-colors">Comandos</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 text-ide-text-dim/40 hover:text-ide-text-dim transition-colors cursor-default">
            <ShieldAlert className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">IA Experimental</span>
          </div>
        </div>
      </div>

      {showMentionMenu && (
        <MentionMenu
          isOpen={showMentionMenu}
          position={menuPosition}
          searchQuery={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentionMenu(false)}
        />
      )}

      {showSlashMenu && (
        <SlashCommandMenu
          isOpen={showSlashMenu}
          position={menuPosition}
          searchQuery={slashQuery}
          onSelect={handleSlashSelect}
          onClose={() => setShowSlashMenu(false)}
        />
      )}
    </div>
  );
}
