import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { AssistantMessageBlock } from '../../types/block.types';

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="my-3 text-sm leading-relaxed text-foreground/90 md:text-base">
      {children}
    </p>
  ),
  h1: ({ children }) => <h1 className="my-4 text-2xl font-bold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="my-4 text-xl font-bold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="my-3 text-lg font-bold text-foreground/90">{children}</h3>,
  h4: ({ children }) => <h4 className="my-3 text-base font-semibold text-foreground/80">{children}</h4>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90 md:text-base">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 text-sm text-foreground/90 md:text-base">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-border pl-4 italic text-foreground/70">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-2xl border border-border/60 bg-secondary/35 p-4 text-sm shadow-inner">
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
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border/60 shadow-sm">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/30 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border/30 px-4 py-3 text-left font-semibold text-foreground last:border-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border/20 px-4 py-2.5 text-foreground/80 last:border-0">
      {children}
    </td>
  ),
};

export const AssistantMessageCard = memo(({ block }: { block: AssistantMessageBlock }) => {
  const isStreaming = block.status === 'streaming';

  return (
    <div className="flex w-full items-start py-4 group">
      <div className="mt-0.5 flex w-8 shrink-0 items-start justify-center">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground shadow-xs">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4">
        <div className="markdown-body text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
            {block.content}
          </ReactMarkdown>

          {isStreaming && (
            <div className="mt-4 mb-1 flex items-center gap-2">
              <div className="agent-loader shrink-0 text-primary mr-4">
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
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                Gerando resposta...
              </span>
              <span className="ml-2 h-3.5 w-1 animate-cursor-blink rounded-full bg-primary/80" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AssistantMessageCard.displayName = 'AssistantMessageCard';
