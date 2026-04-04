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

import { memo, useMemo } from 'react';
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
      <div className="rounded-lg overflow-hidden border border-border/50 bg-background/50 font-mono text-sm shadow-inner">
        {/* Diff header */}
        <div className="flex items-center gap-4 px-3 py-2 bg-secondary border-b border-border/50 text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-red-500/40" />
            <span>Removido</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-emerald-500/40" />
            <span>Adicionado</span>
          </span>
        </div>

        {/* Diff lines */}
        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className={clsx(
                'flex items-start transition-colors duration-150',
                line.type === 'added' && 'bg-emerald-500/15',
                line.type === 'removed' && 'bg-red-500/15'
              )}
            >
              {/* Line numbers */}
              <div className="shrink-0 flex w-16 text-right pr-4 py-0.5 text-xs text-muted-foreground/40 select-none border-r border-border/20">
                <span className="w-8 text-right">{line.oldLineNum || ''}</span>
                <span className="w-8 text-right font-medium text-muted-foreground/60">{line.newLineNum || ''}</span>
              </div>

              {/* Diff indicator */}
              <div className="shrink-0 w-6 py-0.5 text-center text-xs">
                {line.type === 'added' && (
                  <span className="text-emerald-500 font-bold">+</span>
                )}
                {line.type === 'removed' && (
                  <span className="text-red-500 font-bold">-</span>
                )}
              </div>

              {/* Content */}
              <pre
                className={clsx(
                  'flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all',
                  line.type === 'added' && 'text-emerald-400 dark:text-emerald-300',
                  line.type === 'removed' && 'text-red-600 dark:text-red-300',
                  line.type === 'unchanged' && 'text-foreground/70'
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

export default DiffViewerComponent;
