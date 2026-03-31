import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageContentProps {
  text: string;
}

export const MessageContent: React.FC<MessageContentProps> = ({ text }) => {
  // Parse <think>...</think> and <antThinking>...</antThinking> blocks
  const parts: { type: "text" | "think"; content: string }[] = [];
  const thinkRegex = /<(?:think|antThinking)>([\s\S]*?)(?:<\/(?:think|antThinking)>|$)/g;

  let lastIndex = 0;
  let match;

  while ((match = thinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: "think",
      content: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, i) => {
        if (part.type === "think") {
          if (!part.content.trim()) return null;
          return (
            <details
              key={i}
              className="group border border-ide-text-dim/20 rounded-md overflow-hidden bg-ide-surface-3/50"
            >
              <summary className="cursor-pointer px-3 py-1.5 text-[11px] text-ide-text-muted font-medium bg-ide-surface-2 hover:bg-ide-surface-3 transition-colors flex items-center gap-2 select-none">
                <span className="text-ide-text-dim/60 group-open:rotate-90 transition-transform text-[10px]">
                  ▶
                </span>
                Pensamento da IA (OpenCode)
              </summary>
              <div className="p-3 text-[12px] leading-relaxed text-ide-text-dim border-t border-ide-text-dim/20 whitespace-pre-wrap font-sans bg-ide-surface-2/30">
                {part.content.trim()}
              </div>
            </details>
          );
        }

        if (!part.content.trim()) return null;

        return (
          <div
            key={i}
            className="text-[13px] leading-relaxed max-w-none
              [&_p]:my-2
              [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-3
              [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-3
              [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:my-2
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
              [&_li]:my-0.5
              [&_pre]:bg-ide-bg [&_pre]:border [&_pre]:border-ide-border [&_pre]:my-3 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
              [&_code]:text-ide-text-muted [&_code]:bg-ide-surface-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[12px]
              [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:text-ide-text
              [&_a]:text-ide-indigo [&_a]:underline [&_a]:underline-offset-2
              [&_blockquote]:border-l-2 [&_blockquote]:border-ide-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ide-text-dim"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {part.content}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
};
