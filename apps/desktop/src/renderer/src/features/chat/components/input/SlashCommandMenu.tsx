/**
 * SlashCommandMenu - Autocomplete menu for / commands
 *
 * Performance:
 * - Only rendered when active
 * - Categorized commands
 * - Keyboard navigation support
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { Search, FileCode, Terminal, MessageSquare, Settings } from 'lucide-react';
import clsx from 'clsx';

interface SlashCommand {
  id: string;
  name: string;
  description: string;
  category: 'file' | 'terminal' | 'chat' | 'settings';
  icon?: React.ReactNode;
}

interface SlashCommandMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  searchQuery?: string;
}

const commands: SlashCommand[] = [
  { id: 'read', name: '/read', description: 'Ler conteúdo de um arquivo', category: 'file' },
  { id: 'edit', name: '/edit', description: 'Editar arquivo existente', category: 'file' },
  { id: 'create', name: '/create', description: 'Criar novo arquivo', category: 'file' },
  { id: 'terminal', name: '/terminal', description: 'Executar comando no terminal', category: 'terminal' },
  { id: 'bash', name: '/bash', description: 'Executar script bash', category: 'terminal' },
  { id: 'ask', name: '/ask', description: 'Fazer uma pergunta ao agente', category: 'chat' },
  { id: 'explain', name: '/explain', description: 'Explicar código seleccionado', category: 'chat' },
  { id: 'review', name: '/review', description: 'Solicitar code review', category: 'chat' },
  { id: 'config', name: '/config', description: 'Configurações do agente', category: 'settings' },
  { id: 'model', name: '/model', description: 'Trocar modelo de IA', category: 'settings' },
];

const getCategoryIcon = (category: SlashCommand['category']) => {
  switch (category) {
    case 'file':
      return <FileCode className="w-4 h-4 text-indigo-400" />;
    case 'terminal':
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-amber-400" />;
    case 'settings':
      return <Settings className="w-4 h-4 text-zinc-400" />;
  }
};

const getCategoryColor = (category: SlashCommand['category']) => {
  switch (category) {
    case 'file':
      return 'text-indigo-400';
    case 'terminal':
      return 'text-emerald-400';
    case 'chat':
      return 'text-amber-400';
    case 'settings':
      return 'text-zinc-400';
  }
};

export const SlashCommandMenu = memo(({
  isOpen,
  position,
  onSelect,
  onClose,
  searchQuery = '',
}: SlashCommandMenuProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter commands based on search query
  const filteredCommands = searchQuery
    ? commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : commands;

  // Group by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, SlashCommand[]>);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
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
  }, [isOpen, filteredCommands, selectedIndex, onSelect, onClose]);

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

  let globalIndex = 0;

  return (
    <div
      ref={menuRef}
      className={clsx(
        'fixed z-50',
        'w-80 max-h-96 overflow-y-auto',
        'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl',
        'animate-in fade-in slide-in-from-top-2 duration-150'
      )}
      style={{
        left: position.x,
        top: position.y + 24,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Search className="w-3 h-3" />
          <span>Comandos disponíveis</span>
        </div>
      </div>

      {/* Commands grouped by category */}
      <div className="py-1">
        {Object.entries(groupedCommands).map(([category, cmds]) => (
          <div key={category}>
            <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-950/50">
              {category}
            </div>
            {cmds.map((cmd) => {
              const index = globalIndex++;
              return (
                <button
                  key={cmd.id}
                  onClick={() => onSelect(cmd)}
                  className={clsx(
                    'w-full flex items-start gap-3 px-3 py-2 text-left',
                    'hover:bg-zinc-800 transition-colors',
                    index === selectedIndex && 'bg-zinc-800'
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getCategoryIcon(cmd.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={clsx('text-sm font-mono font-medium', getCategoryColor(cmd.category))}>
                      {cmd.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {cmd.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {filteredCommands.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-zinc-500">
            Nenhum comando encontrado
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-600">
        ↑↓ navegar • Enter selecionar • Esc fechar
      </div>
    </div>
  );
});

SlashCommandMenu.displayName = 'SlashCommandMenu';
