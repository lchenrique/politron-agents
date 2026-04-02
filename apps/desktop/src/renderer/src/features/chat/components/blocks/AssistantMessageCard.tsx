import React, { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantMessageBlock } from '../../types/block.types';

// Lightweight markdown renderer - no heavy prose classes
function SimpleMarkdown({ content }: { content: string }) {
  // Handle code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);
  
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.replace(/```(\w+)?\n?/g, '').replace(/```$/g, '');
          return (
            <pre key={i} className="bg-zinc-900 rounded-lg p-3 my-2 overflow-x-auto text-sm font-mono">
              <code className="text-zinc-300">{code}</code>
            </pre>
          );
        }
        // Handle inline code and basic formatting
        const processed = part
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm font-mono">$1</code>');
        return <span key={i} dangerouslySetInnerHTML={{ __html: processed }} />;
      })}
    </>
  );
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
