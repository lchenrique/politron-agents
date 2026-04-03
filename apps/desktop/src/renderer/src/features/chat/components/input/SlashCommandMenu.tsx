/**
 * SlashCommandMenu - Autocomplete menu for / commands
 * 
 * Redesigned to show command on left and description on right.
 */

import React, { memo, useEffect, useRef, useState, useMemo } from 'react';
import { Search, Terminal, MessageSquare, Shield, Box, Globe, Copy, LogOut, Maximize } from 'lucide-react';
import clsx from 'clsx';

interface SlashCommand {
  id: string;
  name: string;
  description: string;
  category: 'builtin' | 'user - Skill';
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
  { id: 'agents', name: '/agents', description: 'Switch agent', category: 'builtin' },
  { id: 'animation', name: '/animation-systems', description: 'Use when designing or animating systems', category: 'user - Skill' },
  { id: 'browser', name: '/browser-use', description: 'Automates browser interaction', category: 'user - Skill' },
  { id: 'cancel', name: '/cancel-ralph', description: 'Cancel active Ralph Loop', category: 'builtin' },
  { id: 'compact', name: '/compact', description: 'Compact session', category: 'builtin' },
  { id: 'connect', name: '/connect', description: 'Connect provider', category: 'builtin' },
  { id: 'copy', name: '/copy', description: 'Copy session transcript', category: 'builtin' },
  { id: 'cover', name: '/cover-image', description: 'Generate article cover image', category: 'user - Skill' },
  { id: 'editor', name: '/editor', description: 'Open editor view', category: 'builtin' },
  { id: 'exit', name: '/exit', description: 'Exit the application', category: 'builtin' },
];

const getIcon = (name: string) => {
  if (name.includes('agents')) return <Shield className="w-4 h-4 text-amber-400" />;
  if (name.includes('animation')) return <Box className="w-4 h-4 text-purple-400" />;
  if (name.includes('browser')) return <Globe className="w-4 h-4 text-blue-400" />;
  if (name.includes('copy')) return <Copy className="w-4 h-4 text-zinc-400" />;
  if (name.includes('exit')) return <LogOut className="w-4 h-4 text-red-400" />;
  if (name.includes('editor')) return <Maximize className="w-4 h-4 text-emerald-400" />;
  return <Terminal className="w-4 h-4 text-zinc-400" />;
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

  const filteredCommands = useMemo(() => 
    searchQuery
      ? commands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : commands
  , [searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

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
        'fixed z-[100]',
        'w-[500px] max-h-96 overflow-y-auto',
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
          <span>Comandos</span>
        </div>
      </div>

      <div className="py-1">
        {filteredCommands.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-ide-text-dim">
            Nenhum comando encontrado
          </div>
        ) : (
          filteredCommands.map((cmd, index) => (
            <button
              key={cmd.id}
              onClick={() => onSelect(cmd)}
              className={clsx(
                'w-full flex items-center justify-between gap-4 px-3 py-2 text-left transition-all',
                index === selectedIndex ? 'bg-ide-indigo/10 border-l-2 border-ide-indigo' : 'hover:bg-ide-surface-3'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">{getIcon(cmd.name)}</div>
                <div className="text-sm font-mono font-bold text-ide-text">
                  {cmd.name}
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-right overflow-hidden">
                <span className="text-[10px] text-ide-text-dim font-bold uppercase truncate max-w-[120px] opacity-40">
                  ({cmd.category})
                </span>
                <span className="text-xs text-ide-text-dim truncate">
                  {cmd.description}
                </span>
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

SlashCommandMenu.displayName = 'SlashCommandMenu';
