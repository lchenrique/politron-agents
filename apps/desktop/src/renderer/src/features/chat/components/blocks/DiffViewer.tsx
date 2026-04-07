import { memo, useMemo } from 'react';
import { FileDiff } from '@pierre/diffs/react';
import { parseDiffFromFile, type FileContents, type FileDiffOptions } from '@pierre/diffs';

interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
}

const DIFF_OPTIONS = {
  theme: {
    dark: 'pierre-dark',
    light: 'pierre-light',
  },
  tokenizeMaxLineLength: 500,
  diffStyle: 'unified',
  diffIndicators: 'bars',
  lineDiffType: 'word-alt',
  overflow: 'wrap',
  disableBackground: false,
  disableLineNumbers: false,
} satisfies FileDiffOptions<undefined>;

const DiffViewerComponent = memo(({ filePath, originalContent, modifiedContent }: DiffViewerProps) => {
  const hasChanges = originalContent !== modifiedContent;

  const fileDiff = useMemo(() => {
    const safeName = filePath?.trim() || 'diff.txt';
    const oldFile: FileContents = {
      name: safeName,
      contents: originalContent ?? '',
    };
    const newFile: FileContents = {
      name: safeName,
      contents: modifiedContent ?? '',
    };

    return parseDiffFromFile(oldFile, newFile);
  }, [filePath, originalContent, modifiedContent]);

  if (!hasChanges) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-lg border border-border/60 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
          Nenhuma alteração detectada.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <div className="overflow-hidden rounded-lg border border-border/50 bg-background/50 shadow-inner">
        <FileDiff
          fileDiff={fileDiff}
          options={DIFF_OPTIONS}
          className="block w-full"
          disableWorkerPool
        />
      </div>
    </div>
  );
});

DiffViewerComponent.displayName = 'DiffViewer';

export default DiffViewerComponent;
