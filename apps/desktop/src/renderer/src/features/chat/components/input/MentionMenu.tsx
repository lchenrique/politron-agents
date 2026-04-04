/**
 * MentionMenu - Autocomplete menu for @ mentions
 * 
 * Redesigned to show icon + name on left and metadata on right.
 */

import React, { memo, useEffect, useRef, useState, useMemo } from 'react';
import { FileCode, Shield, Hash, AtSign, Search, Box, Code2, AppWindow } from 'lucide-react';
import clsx from 'clsx';

interface MentionItem {
  id: string;
  type: 'file' | 'function' | 'variable' | 'symbol';
  name: string;
  path?: string;
  icon?: React.ReactNode;
}

interface MentionMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items?: MentionItem[];
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  searchQuery?: string;
}

// Mock items for demonstration
const mockItems: MentionItem[] = [
  { id: '1', type: 'file', name: 'chatStore.ts', path: 'src/features/chat/store/chatStore.ts' },
  { id: '2', type: 'file', name: 'AgentChatShell.tsx', path: 'src/renderer/src/features/chat/components/shell' },
  { id: '3', type: 'file', name: 'HireAgentModal.tsx', path: 'src/renderer/src/components/ide' },
  { id: '4', type: 'file', name: 'UserMessageCard.tsx', path: 'src/renderer/src/features/chat/components/blocks' },
  { id: '5', type: 'file', name: 'PromptInput.tsx', path: 'src/renderer/src/features/chat/components/input' },
  { id: '6', type: 'function', name: 'useChatStore', path: 'chatStore.ts' },
  { id: '7', type: 'symbol', name: 'TranscriptViewport', path: 'TranscriptViewport.tsx' },
  { id: '8', type: 'variable', name: 'sessionId', path: 'chatStore.ts' },
];

const getIcon = (item: MentionItem) => {
  const name = item.name.toLowerCase();
  
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) return <Code2 className="w-4 h-4 text-blue-400" />;
  if (name.endsWith('.ts') || name.endsWith('.js')) return <Box className="w-4 h-4 text-indigo-400" />;
  if (name.endsWith('.md')) return <FileCode className="w-4 h-4 text-zinc-400" />;
  if (item.type === 'function') return <Hash className="w-4 h-4 text-amber-400" />;
  if (item.type === 'symbol') return <AppWindow className="w-4 h-4 text-emerald-400" />;
  
  return <AtSign className="w-4 h-4 text-zinc-400" />;
};

export const MentionMenu = memo(({
  isOpen,
  position,
  items = mockItems,
  onSelect,
  onClose,
  searchQuery = '',
}: MentionMenuProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => 
    searchQuery
      ? items.filter((item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.path && item.path.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : items
  , [items, searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={clsx(
        'fixed z-100',
        'w-[500px] max-h-80 overflow-y-auto',
        'bg-ide-surface-2 border border-ide-indigo/20 rounded-xl shadow-2xl backdrop-blur-xl',
        'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200'
      )}
      style={{
        left: position.x,
        bottom: `calc(100vh - ${position.y}px)`,
      }}
    >
      <div className="px-3 py-2 border-b border-ide-border bg-ide-surface/50">
        <div className="flex items-center gap-2 text-[10px] font-bold text-ide-text-dim uppercase tracking-widest">
          <Search className="w-3 h-3" />
          <span>Arquivos e Símbolos</span>
        </div>
      </div>

      <div className="py-1">
        {filteredItems.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-ide-text-dim">
            Nenhum resultado encontrado
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={clsx(
                'w-full flex items-center justify-between gap-4 px-3 py-2 text-left transition-all',
                index === selectedIndex ? 'bg-ide-indigo/10 border-l-2 border-ide-indigo' : 'hover:bg-ide-surface-3'
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">{getIcon(item)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ide-text truncate">
                    {item.name}
                  </div>
                  {item.path && (
                    <div className="text-[10px] text-ide-text-dim truncate opacity-40">
                      {item.path}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="shrink-0 text-[10px] font-bold text-ide-text-dim/30 uppercase tracking-widest">
                {item.type}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-ide-border bg-ide-surface/30 text-[10px] text-ide-text-dim/50 font-bold uppercase flex justify-between">
        <span>↑↓ navegar • Enter selecionar</span>
        <span>Esc fechar</span>
      </div>
    </div>
  );
});

MentionMenu.displayName = 'MentionMenu';
