/**
 * FileChangesCard - Lists all files changed in an operation
 *
 * Performance:
 * - Memoized
 * - Compact display with expandable details
 * - Visual icons for file actions
 */

import { memo, useMemo, useState } from 'react';
import type { FileChangesBlock } from './types';
import { ChevronDown, ChevronUp, FilePlus, FileEdit, FileMinus, FolderOpen } from 'lucide-react';

interface FileChangesCardProps {
  block: FileChangesBlock;
  defaultExpanded?: boolean;
}

// NOTA (Fase 0 da limpeza): ver NOTA equivalente em DiffCard.tsx — recebe o
// bloco por prop em vez do store de transcript legado removido nesta fase.
export const FileChangesCard = memo(({ block, defaultExpanded = false }: FileChangesCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const stats = useMemo(() => ({
    created: block.files.filter((f) => f.action === 'created').length,
    modified: block.files.filter((f) => f.action === 'modified').length,
    deleted: block.files.filter((f) => f.action === 'deleted').length,
  }), [block.files]);

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/40">
        {/* Header */}
        <button
          onClick={() => setIsExpanded((current) => !current)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          <div className="shrink-0 text-zinc-400">
            <FolderOpen className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200 font-medium">
              {block.files.length} file{block.files.length !== 1 ? 's' : ''} changed
            </div>
            <div className="flex items-center gap-3 mt-1">
              {stats.created > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <FilePlus className="w-3 h-3" />
                  {stats.created} created
                </span>
              )}
              {stats.modified > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <FileEdit className="w-3 h-3" />
                  {stats.modified} modified
                </span>
              )}
              {stats.deleted > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <FileMinus className="w-3 h-3" />
                  {stats.deleted} deleted
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 text-zinc-500">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {/* File list */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-zinc-800/50">
            <div className="mt-3 space-y-1">
              {block.files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-950/50"
                >
                  <div className="shrink-0">
                    {file.action === 'created' && (
                      <FilePlus className="w-4 h-4 text-emerald-400" />
                    )}
                    {file.action === 'modified' && (
                      <FileEdit className="w-4 h-4 text-amber-400" />
                    )}
                    {file.action === 'deleted' && (
                      <FileMinus className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <span className="font-mono text-xs text-zinc-300 truncate">
                    {file.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

FileChangesCard.displayName = 'FileChangesCard';
