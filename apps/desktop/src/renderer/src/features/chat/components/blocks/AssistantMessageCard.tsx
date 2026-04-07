import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { AssistantMessageBlock } from '../../types/block.types';

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="my-2.5 text-[15px] leading-relaxed text-foreground/90">
      {children}
    </p>
  ),
  h1: ({ children }) => <h1 className="my-4 text-2xl font-bold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="my-4 text-xl font-bold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="my-3 text-lg font-bold text-foreground/90">{children}</h3>,
  h4: ({ children }) => <h4 className="my-3 text-base font-semibold text-foreground/80">{children}</h4>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-[15px] text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 text-[15px] text-foreground/90">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-muted pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl border border-border bg-muted/20 p-4 text-[13px] shadow-sm font-mono">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlockCode = /language-/.test(className ?? '');

    if (!isBlockCode) {
      return (
        <code
          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
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
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border shadow-xs">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/30">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/50 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border/50 px-4 py-3 text-left font-semibold text-foreground last:border-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border/30 px-4 py-2.5 text-foreground/70 last:border-0">
      {children}
    </td>
  ),
};

export const AssistantMessageCard = memo(({ block }: { block: AssistantMessageBlock }) => {
  const isStreaming = block.status === 'streaming';
  
  // Rule: Do not render empty blocks unless they are streaming (Rule 04)
  if (!block.content.trim() && !isStreaming) return null;

  return (
    <div className="flex w-full items-start py-5 group animate-fade-in text-foreground">
      <div className="mt-0.5 flex w-10 shrink-0 items-start justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          <Sparkles className="h-4 w-4" />
        </div>
      </div>

      <div className="min-w-0 flex-1 px-5">
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
            {block.content}
          </ReactMarkdown>

          {isStreaming && (
            <div className="mt-4 mb-1 flex items-center gap-4">
              {/* Restoring the original Square Loader (requested by user) */}
              <div className="agent-loader shrink-0 text-primary">
                <div className="square" id="sq1" />
                <div className="square" id="sq2" />
                <div className="square" id="sq3" />
                <div className="square" id="sq4" />
                <div className="square" id="sq5" />
                <div className="square" id="sq6" />
                <div className="square" id="sq7" />
                <div className="square" id="sq8" />
                <div className="square" id="sq9" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Gerando resposta...
                </span>
                <span className="mt-1 h-0.5 w-full animate-cursor-blink rounded-full bg-primary/40" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AssistantMessageCard.displayName = 'AssistantMessageCard';
