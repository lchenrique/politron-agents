import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TextAnimate } from "@/components/ui/text-animate";

interface MessageContentProps {
  text: string;
}

// Memoized regex - compiled once
const THINK_REGEX = /<(?:think|antThinking)>([\s\S]*?)(?:<\/(?:think|antThinking)>|$)/g;

export const MessageContent: React.FC<MessageContentProps> = ({ text }) => {
  // Memoize the regex parsing - this is expensive!
  const parts = useMemo(() => {
    const result: { type: "text" | "think"; content: string }[] = [];
    const thinkRegex = /<(?:think|antThinking)>([\s\S]*?)(?:<\/(?:think|antThinking)>|$)/g;
    
    let lastIndex = 0;
    let match;

    while ((match = thinkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: text.slice(lastIndex, match.index),
        });
      }
      result.push({
        type: "think",
        content: match[1],
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      result.push({
        type: "text",
        content: text.slice(lastIndex),
      });
    }

    return result;
  }, [text]);

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
              <summary className="cursor-pointer px-3 py-1.5 text-[11px] text-ide-text-muted font-medium bg-ide-surface-2 hover:bg-ide-surface-3 flex items-center gap-2 select-none">
                <span className="text-ide-text-dim/60 group-open:rotate-90 text-[10px]">
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

        // Use TextAnimate for typing effect
        return (
          <TextAnimate 
            key={i}
            animation="slideUp" 
            by="word"
            className="text-[13px] leading-relaxed max-w-none"
          >
            {part.content}
          </TextAnimate>
        );
      })}
    </div>
  );
};
