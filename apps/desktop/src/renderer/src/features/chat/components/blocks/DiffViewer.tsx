/**
 * DiffViewer - Actual diff rendering with syntax highlighting
 *
 * Performance:
 * - Separated into its own component for code splitting
 * - Only rendered when DiffCard is expanded
 * - Line-by-line diff computation
 *
 * @heavy This component is lazy loaded
 */

import React, { memo, useMemo } from 'react';
import clsx from 'clsx';

interface DiffViewerProps {
  originalContent: string;
  modifiedContent: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

const DiffViewerComponent = memo(({ originalContent, modifiedContent }: DiffViewerProps) => {
  const lines = useMemo(() => {
    const originalLines = (originalContent || '').split('\n');
    const modifiedLines = (modifiedContent || '').split('\n');

    const result: DiffLine[] = [];
    let oldLine = 1;
    let newLine = 1;

    // Simple line-by-line diff
    // In production, use a library like diff-match-patch or monaco-diff-editor
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLineContent = originalLines[i];
      const newLineContent = modifiedLines[i];

      if (oldLineContent === undefined) {
        // Added line
        result.push({
          type: 'added',
          content: newLineContent || '',
          newLineNum: newLine++,
        });
      } else if (newLineContent === undefined) {
        // Removed line
        result.push({
          type: 'removed',
          content: oldLineContent,
          oldLineNum: oldLine++,
        });
      } else if (oldLineContent !== newLineContent) {
        // Modified line - show as remove + add
        result.push({
          type: 'removed',
          content: oldLineContent,
          oldLineNum: oldLine++,
        });
        result.push({
          type: 'added',
          content: newLineContent,
          newLineNum: newLine++,
        });
      } else {
        // Unchanged
        result.push({
          type: 'unchanged',
          content: oldLineContent,
          oldLineNum: oldLine++,
          newLineNum: newLine++,
        });
      }
    }

    return result;
  }, [originalContent, modifiedContent]);

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg overflow-hidden border border-zinc-800/50 bg-zinc-950/50 font-mono text-sm">
        {/* Diff header */}
        <div className="flex items-center gap-4 px-3 py-2 bg-zinc-900/50 border-b border-zinc-800/50 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500/20 text-red-400 flex items-center justify-center">
              -
            </span>
            <span>removed</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              +
            </span>
            <span>added</span>
          </span>
        </div>

        {/* Diff lines */}
        <div className="max-h-96 overflow-y-auto">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className={clsx(
                'flex items-start',
                line.type === 'added' && 'bg-emerald-500/10',
                line.type === 'removed' && 'bg-red-500/10'
              )}
            >
              {/* Line numbers */}
              <div className="flex-shrink-0 flex w-16 text-right pr-4 py-0.5 text-xs text-zinc-600 select-none">
                <span className="w-8 text-right">{line.oldLineNum || ''}</span>
                <span className="w-8 text-right">{line.newLineNum || ''}</span>
              </div>

              {/* Diff indicator */}
              <div className="flex-shrink-0 w-4 py-0.5 text-center">
                {line.type === 'added' && (
                  <span className="text-emerald-400">+</span>
                )}
                {line.type === 'removed' && (
                  <span className="text-red-400">-</span>
                )}
              </div>

              {/* Content */}
              <pre
                className={clsx(
                  'flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all',
                  line.type === 'added' && 'text-emerald-300',
                  line.type === 'removed' && 'text-red-300',
                  line.type === 'unchanged' && 'text-zinc-400'
                )}
              >
                {line.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

DiffViewerComponent.displayName = 'DiffViewer';

// Default export for lazy loading
export default DiffViewerComponent;
