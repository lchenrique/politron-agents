import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantMessageBlock } from '../../types/block.types';

/**
 * SimpleMarkdown - A lightweight markdown parser for streaming assistant responses
 */
function SimpleMarkdown({ content }: { content: string }) {
  if (!content) return null;

  // Process a segment of text for inline formatting (bold, italic, code, links)
  // Returns a React element with dangerouslySetInnerHTML
  const processInline = (text: string, key: number) => {
    if (!text) return null;
    
    // First escape HTML
    let processed = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Bold + Italic combined: ***text*** or ___text___
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    
    // Bold: **text** or __text__
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
    processed = processed.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Inline code: `code`
    processed = processed.replace(/`([^`]+)`/g, '<code class="bg-muted/50 px-1.5 py-0.5 rounded text-primary text-sm font-mono border border-border/30">$1</code>');
    
    // Links: [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:opacity-80 underline" target="_blank" rel="noopener noreferrer">$1</a>');

    return <span key={key} dangerouslySetInnerHTML={{ __html: processed }} />;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join('\n');
      elements.push(
        <div key={keyIndex++} className="my-4 group relative">
          {language && (
            <div className="absolute top-0 right-0 px-2 py-1 text-xs font-mono text-muted-foreground bg-secondary border-l border-b border-border rounded-bl-md z-10">
              {language}
            </div>
          )}
          <pre className="bg-secondary/40 rounded-xl p-4 overflow-x-auto text-sm font-mono border border-border/50 shadow-inner">
            <code className="text-foreground/90">{code}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const HeaderTag = `h${level + 1}` as keyof JSX.IntrinsicElements; // Offset because we're inside a page
      const sizeClasses = {
        h2: 'text-xl font-bold text-foreground',
        h3: 'text-lg font-bold text-foreground/90',
        h4: 'text-base font-semibold text-foreground/80',
        h5: 'text-sm font-semibold text-muted-foreground',
      };
      
      elements.push(
        <HeaderTag key={keyIndex++} className={`${sizeClasses[HeaderTag as keyof typeof sizeClasses]} mt-6 mb-3 first:mt-2`}>
          {processInline(text, 0)}
        </HeaderTag>
      );
      i++;
      continue;
    }

    // Lists
    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={keyIndex++} className="list-disc list-outside ml-6 my-3 space-y-1.5 text-foreground/90 text-sm md:text-base">
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-1 leading-relaxed">
              {processInline(item, 0)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph
    if (line.trim()) {
      elements.push(
        <p key={keyIndex++} className="my-3 text-foreground/90 leading-relaxed text-sm md:text-base wrap-break-word">
          {processInline(line, 0)}
        </p>
      );
    } else {
      // Empty line - add some vertical space
      elements.push(<div key={keyIndex++} className="h-2" />);
    }
    i++;
  }

  return <div className="markdown-body">{elements}</div>;
}

export const AssistantMessageCard = memo(({ block }: { block: AssistantMessageBlock }) => {
  const isStreaming = block.status === 'streaming';

  return (
    <div className="flex w-full group py-4 items-start">
      {/* Icon/Avatar area */}
      <div className="w-8 shrink-0 flex items-start justify-center mt-0.5">
        <div className="w-6 h-6 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
      </div>
      
      {/* Content area - NO bubble background as requested */}
      <div className="flex-1 px-4 min-w-0">
        <div className="text-foreground/90">
          <SimpleMarkdown content={block.content} />
          {isStreaming && (
            <div className="inline-flex gap-1 ml-1 items-center h-4 align-middle">
              <span className="w-1 h-3.5 bg-primary/80 rounded-full animate-cursor-blink" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AssistantMessageCard.displayName = 'AssistantMessageCard';
