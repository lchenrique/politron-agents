import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantMessageBlock } from '../../types/block.types';

// Enhanced markdown renderer supporting: headers, links, lists, blockquotes, code blocks, tables
function SimpleMarkdown({ content }: { content: string }) {
  // If content already has HTML tags, just process inline formatting
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(content);

  // Process inline formatting only (no block parsing needed for HTML content)
  const processInlineOnly = (text: string): string => {
    if (!text) return text;
    // For HTML content, only handle remaining markdown-style formatting
    let processed = text;
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
    processed = processed.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm font-mono">$1</code>');
    // Links: [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer">$1</a>');
    return processed;
  };

  // If content already has HTML, just render it directly with inline processing
  if (hasHtmlTags) {
    return <span dangerouslySetInnerHTML={{ __html: processInlineOnly(content) }} />;
  }

  // For plain text/markdown, do full block parsing
  // Escape HTML to prevent XSS
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Process inline formatting (called after block processing)
  const processInline = (text: string): string => {
    if (!text) return text;
    let processed = text;
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
    processed = processed.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm font-mono">$1</code>');
    // Links: [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer">$1</a>');
    return processed;
  };

  // Split content into blocks for processing
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks: ```language\ncode\n```
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = escapeHtml(codeLines.join('\n'));
      elements.push(
        <pre key={keyIndex++} className="bg-zinc-900 rounded-lg p-3 my-3 overflow-x-auto text-sm font-mono border border-zinc-700">
          <code className="text-zinc-300">{code}</code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // Headers: # ## ### ####
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const sizeClasses = {
        1: 'text-2xl font-bold text-zinc-100',
        2: 'text-xl font-bold text-zinc-200',
        3: 'text-lg font-semibold text-zinc-300',
        4: 'text-base font-semibold text-zinc-400',
      };
      elements.push(
        <div key={keyIndex++} className={`${sizeClasses[level as keyof typeof sizeClasses]} mt-4 mb-2 text-zinc-100`}>
          {processInline(escapeHtml(text))}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rules: --- or *** or ___
    if (line.match(/^([-*_]){3,}$/)) {
      elements.push(<hr key={keyIndex++} className="my-4 border-zinc-700" />);
      i++;
      continue;
    }

    // Blockquotes: > text
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].slice(1).trim());
        i++;
      }
      elements.push(
        <blockquote key={keyIndex++} className="border-l-4 border-indigo-500 pl-4 my-2 text-zinc-400 italic">
          {processInline(escapeHtml(quoteLines.join(' ')))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered lists: - item or * item
    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={keyIndex++} className="list-disc list-inside my-2 space-y-1 text-zinc-300">
          {listItems.map((item, idx) => (
            <li key={idx}>{processInline(escapeHtml(item))}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered lists: 1. item
    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        listItems.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={keyIndex++} className="list-decimal list-inside my-2 space-y-1 text-zinc-300">
          {listItems.map((item, idx) => (
            <li key={idx}>{processInline(escapeHtml(item))}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Tables: | col1 | col2 | and | --- | --- |
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableRows: string[][] = [];
      // Collect all table rows
      while (i < lines.length && lines[i].startsWith('|') && lines[i].endsWith('|')) {
        // Skip separator row (contains only ---, |, and spaces)
        if (!lines[i].match(/^\|\s*[-:]+\s*\|/)) {
          const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(1);
        elements.push(
          <table key={keyIndex++} className="w-full my-3 border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-600">
                {headerRow.map((cell, idx) => (
                  <th key={idx} className="px-3 py-2 text-left font-semibold text-zinc-200">{processInline(escapeHtml(cell))}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-zinc-700/50">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-zinc-300">{processInline(escapeHtml(cell))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      continue;
    }

    // Paragraph: regular text
    if (line.trim()) {
      // Join with next lines if they don't start a new block
      let paragraph = line;
      while (i + 1 < lines.length && 
             !lines[i + 1].startsWith('```') && 
             !lines[i + 1].match(/^#{1,4}\s+/) &&
             !lines[i + 1].match(/^[-*]\s+/) &&
             !lines[i + 1].match(/^\d+\.\s+/) &&
             !lines[i + 1].match(/^>\s/) &&
             !lines[i + 1].match(/^\|/) &&
             !lines[i + 1].match(/^([-*_]){3,}$/) &&
             lines[i + 1].trim()) {
        i++;
        paragraph += ' ' + lines[i];
      }
      elements.push(
        <p key={keyIndex++} className="my-2 text-zinc-300 leading-relaxed">
          {processInline(escapeHtml(paragraph))}
        </p>
      );
    }
    i++;
  }

  return <>{elements}</>;
}

export const AssistantMessageCard = memo(({ block }: { block: AssistantMessageBlock }) => {
  const isStreaming = block.status === 'streaming';

  return (
    <div className="flex w-full group py-3">
      <div className="w-8 flex-shrink-0 flex items-start justify-center pt-1">
        <div className="w-6 h-6 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700">
          <Sparkles className="w-4 h-4" />
        </div>
      </div>
      <div className="flex-1 pl-4 overflow-hidden">
        <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed break-words font-sans">
          <SimpleMarkdown content={block.content} />
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 align-middle bg-indigo-400 cursor-blink" />
          )}
        </div>
      </div>
    </div>
  );
});

AssistantMessageCard.displayName = 'AssistantMessageCard';
