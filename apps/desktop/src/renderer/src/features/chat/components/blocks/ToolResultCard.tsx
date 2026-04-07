import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { ToolResultBlock } from '../../types/block.types';
import { useBlock, useIsBlockExpanded, useChatStore } from '../../store/chatStore';
import { ChevronDown, CheckCircle2, XCircle, Loader2, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  pre: ({ children }) => (
    <pre className="my-0 overflow-x-auto rounded-xl border border-border/60 bg-background/60 p-4 text-sm shadow-inner">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlockCode = /language-/.test(className ?? '');

    if (!isBlockCode) {
      return (
        <code
          className="rounded-md border border-border/30 bg-muted/70 px-1.5 py-0.5 font-mono text-[0.92em] text-primary"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
};

type ParsedToolResult =
  | { kind: 'file'; filePath: string; language: string; code: string }
  | { kind: 'markdown'; content: string }
  | { kind: 'text'; content: string };

function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

function parseToolResult(result: string): ParsedToolResult {
  const normalized = result.trim();
  const pathMatch = normalized.match(/<path>([\s\S]*?)<\/path>/i);
  const typeMatch = normalized.match(/<type>([\s\S]*?)<\/type>/i);
  const contentMatch = normalized.match(/<content>([\s\S]*)/i);

  const filePath = pathMatch?.[1]?.trim() ?? '';
  const declaredType = typeMatch?.[1]?.trim().toLowerCase() ?? '';
  const rawContent = contentMatch?.[1]?.trim() ?? '';

  if (filePath && rawContent && (declaredType === 'file' || /\.(?:[a-z0-9]+)$/i.test(filePath))) {
    return {
      kind: 'file',
      filePath,
      language: getLanguageFromPath(filePath),
      code: rawContent,
    };
  }

  if (/^#{1,6}\s|\n#{1,6}\s|```/m.test(normalized) || /\n[-*+]\s|\n\d+\.\s/.test(normalized)) {
    return { kind: 'markdown', content: normalized };
  }

  return { kind: 'text', content: normalized };
}

interface ToolResultCardProps {
  blockId: string;
}

export const ToolResultCard = memo(({ blockId }: ToolResultCardProps) => {
  const block = useBlock(blockId) as ToolResultBlock | undefined;
  const isExpanded = useIsBlockExpanded(blockId);
  const toggleBlockExpanded = useChatStore((state) => state.toggleBlockExpanded);
  const isRunning = block?.status === 'running' || block?.status === 'streaming';
  const preview = useMemo(() => {
    if (!block?.result) return '';
    const maxLen = 150;
    if (block.result.length <= maxLen) return block.result;
    return block.result.slice(0, maxLen) + '...';
  }, [block?.result]);
  const parsedResult = useMemo(() => block?.result ? parseToolResult(block.result) : { kind: 'text', content: '' } as ParsedToolResult, [block?.result]);
  const previewResult = useMemo(() => parseToolResult(preview), [preview]);

  if (!block || block.type !== 'tool-result') return null;

  const isLongResult = block.result && block.result.length > 500;

  const renderContent = (parsed: ParsedToolResult) => {
    if (parsed.kind === 'file') {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground/70">
            <div className="font-mono truncate text-foreground/80">{parsed.filePath}</div>
            <div className="mt-1 uppercase tracking-wider">{parsed.language}</div>
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
            {` \`\`\`${parsed.language}\n${parsed.code}\n\`\`\` `}
          </ReactMarkdown>
        </div>
      );
    }

    if (parsed.kind === 'markdown') {
      return (
        <div className="prose prose-invert max-w-none prose-pre:my-0 prose-pre:bg-transparent">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
            {parsed.content}
          </ReactMarkdown>
        </div>
      );
    }

    return <pre className="whitespace-pre-wrap break-all">{parsed.content}</pre>;
  };

  return (
    <div className="flex w-full group py-2">
      <div className="flex-1 ml-12 rounded-xl overflow-hidden border border-border/60 bg-secondary/20">
        {/* Header - always clickable if result is long */}
        <div
          className={clsx(
            'flex items-start gap-3 px-4 py-3',
            isLongResult ? 'cursor-pointer hover:bg-secondary/30' : ''
          )}
          onClick={() => isLongResult && toggleBlockExpanded(blockId)}
        >
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            {isRunning ? (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
            ) : block.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : block.status === 'error' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground/60">
                {block.toolName}
              </span>
              <span className="text-xs text-muted-foreground/40">result</span>
            </div>

            <div className="font-mono text-sm text-foreground/80">
              {isLongResult && !isExpanded ? (
                renderContent(previewResult)
              ) : (
                renderContent(parsedResult)
              )}
            </div>

            {/* Expand indicator */}
            {isLongResult && (
              <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    <span>Show less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>Show more ({block.result.length} chars)</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ToolResultCard.displayName = 'ToolResultCard';
