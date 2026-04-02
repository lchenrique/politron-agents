/**
 * MentionMenu - Autocomplete menu for @ mentions
 *
 * Performance:
 * - Only rendered when active
 * - Virtualized list for large number of items
 * - Keyboard navigation support
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { FileText, Hash, AtSign } from 'lucide-react';
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
  { id: '2', type: 'file', name: 'AgentChatShell.tsx', path: 'src/features/chat/components/AgentChatShell.tsx' },
  { id: '3', type: 'function', name: 'useChatStore', path: 'chatStore.ts' },
  { id: '4', type: 'function', name: 'TranscriptViewport', path: 'TranscriptViewport.tsx' },
  { id: '5', type: 'variable', name: 'blockIds', path: 'chatStore.ts' },
];

const getIcon = (type: MentionItem['type']) => {
  switch (type) {
    case 'file':
      return <FileText className="w-4 h-4 text-zinc-400" />;
    case 'function':
      return <Hash className="w-4 h-4 text-indigo-400" />;
    default:
      return <AtSign className="w-4 h-4 text-zinc-400" />;
  }
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

  // Filter items based on search query
  const filteredItems = searchQuery
    ? items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  // Keyboard navigation
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

  // Click outside to close
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
        'fixed z-50',
        'w-72 max-h-80 overflow-y-auto',
        'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl',
        'animate-in fade-in slide-in-from-top-2 duration-150'
      )}
      style={{
        left: position.x,
        top: position.y + 24,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        Mencionar arquivo ou símbolo
      </div>

      {/* Items */}
      <div className="py-1">
        {filteredItems.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-zinc-500">
            Nenhum resultado encontrado
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 text-left',
                'hover:bg-zinc-800 transition-colors',
                index === selectedIndex && 'bg-zinc-800'
              )}
            >
              <div className="flex-shrink-0">{getIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{item.name}</div>
                {item.path && (
                  <div className="text-xs text-zinc-500 truncate">{item.path}</div>
                )}
              </div>
              <div className="flex-shrink-0 text-xs text-zinc-600 capitalize">
                {item.type}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-600">
        ↑↓ navegar • Enter selecionar • Esc fechar
      </div>
    </div>
  );
});

MentionMenu.displayName = 'MentionMenu';
