import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, ChevronDown, ChevronUp, FileText, Search, Edit3, Terminal, Check, Loader2 } from "lucide-react";
import type { MessagePart } from "@/types/workspace";

// ─── Reasoning Block ──────────────────────────────────────────────────────────
interface ReasoningBlockProps {
  text: string;
  isOngoing: boolean;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ text, isOngoing }) => {
  const [open, setOpen] = useState(isOngoing);

  // Auto-open when streaming starts, stays closed when not ongoing
  useEffect(() => {
    setOpen(isOngoing);
  }, [isOngoing]);

  if (!text.trim()) return null;

  return (
    <div className="w-full rounded-lg border border-ide-border overflow-hidden text-[12px] mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-ide-surface-2 hover:bg-ide-surface-3 transition-colors text-ide-text-dim text-left"
      >
        <Brain className="w-3.5 h-3.5 text-ide-indigo shrink-0" />
        <span className="flex-1 text-[11px] font-medium tracking-wide">
          {isOngoing ? "Pensando..." : "Raciocínio"}
        </span>
        {isOngoing && (
          <Loader2 className="w-3 h-3 animate-spin text-ide-indigo shrink-0" />
        )}
        {!isOngoing && (open ? (
          <ChevronUp className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ))}
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-ide-surface/50 text-ide-text-dim leading-relaxed border-t border-ide-border whitespace-pre-wrap font-mono text-[11px] max-h-64 overflow-y-auto scrollbar-thin">
          {text}
        </div>
      )}
    </div>
  );
};

// ─── Tool Call Block ──────────────────────────────────────────────────────────
const toolIcon = (tool: string) => {
  const t = tool.toLowerCase();
  if (t.includes("read") || t.includes("glob") || t.includes("list")) return FileText;
  if (t.includes("grep") || t.includes("search") || t.includes("find")) return Search;
  if (t.includes("edit") || t.includes("write") || t.includes("patch")) return Edit3;
  return Terminal;
};

const toolLabel = (tool: string): string => {
  const map: Record<string, string> = {
    read_file: "Lendo arquivo",
    edit_file: "Editando arquivo",
    write_file: "Escrevendo arquivo",
    search_files: "Buscando arquivos",
    grep_search: "Pesquisando",
    list_directory: "Listando diretório",
    bash: "Executando comando",
    glob: "Buscando arquivos",
  };
  return map[tool] || tool.replace(/_/g, " ");
};

interface ToolCallBlockProps {
  tool: string;
  title: string;
  state: "pending" | "running" | "completed" | "error";
}

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ tool, title, state }) => {
  const Icon = toolIcon(tool);
  const isDone = state === "completed";
  const isError = state === "error";
  const isRunning = state === "running" || state === "pending";

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] mb-1 border transition-all ${
      isDone
        ? "bg-ide-surface-2/50 border-ide-border text-ide-text-dim"
        : isError
        ? "bg-ide-red/5 border-ide-red/20 text-ide-red"
        : "bg-ide-indigo/5 border-ide-indigo/15 text-ide-text-muted"
    }`}>
      {isRunning && <Loader2 className="w-3 h-3 animate-spin text-ide-indigo shrink-0" />}
      {isDone && <Check className="w-3 h-3 text-ide-green shrink-0" />}
      {isError && <span className="w-3 h-3 text-ide-red shrink-0">✕</span>}
      {!isRunning && !isDone && !isError && <Icon className="w-3 h-3 text-ide-indigo shrink-0" />}
      <span className="font-medium text-ide-text-muted">{toolLabel(tool)}</span>
      {title && title !== tool && (
        <>
          <span className="text-ide-text-dim/40">·</span>
          <span
            className="text-ide-text-dim truncate max-w-[200px] font-mono"
            title={title}
          >
            {title.split("/").pop() ?? title}
          </span>
        </>
      )}
    </div>
  );
};

// ─── Text Block ───────────────────────────────────────────────────────────────
interface TextBlockProps {
  text: string;
}

// Strip raw <think>...</think> blocks from text (some models output these without going through the reasoning part)
function stripThinkTags(text: string): string {
  let clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, "");
    
  // Handle unclosed tags at the end (common during streaming)
  clean = clean.replace(/<think>[\s\S]*/gi, "");
  clean = clean.replace(/<antThinking>[\s\S]*/gi, "");
  
  return clean.trim();
}

export const TextBlock: React.FC<TextBlockProps> = ({ text }) => {
  const clean = stripThinkTags(text);
  if (!clean) return null;
  return (
    <div
      className="text-[13px] leading-relaxed
        [&_p]:my-1.5
        [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:my-2.5
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2
        [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:my-1.5
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5
        [&_li]:my-0.5
        [&_pre]:bg-ide-bg [&_pre]:border [&_pre]:border-ide-border [&_pre]:my-3 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-[12px]
        [&_code]:text-ide-text-muted [&_code]:bg-ide-surface-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[12px]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-ide-text
        [&_a]:text-ide-indigo [&_a]:underline [&_a]:underline-offset-2
        [&_blockquote]:border-l-2 [&_blockquote]:border-ide-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ide-text-dim
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-ide-text-dim [&_th]:pb-1.5 [&_td]:py-1 [&_td]:border-b [&_td]:border-ide-border/50"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{clean}</ReactMarkdown>
    </div>
  );
};

// ─── Message Parts Renderer ───────────────────────────────────────────────────
interface MessagePartsProps {
  parts: MessagePart[];
  isUser: boolean;
}

export const MessagePartsRenderer: React.FC<MessagePartsProps> = ({ parts, isUser }) => {
  if (isUser) return null;

  // Fallback: if parts is empty but we have a raw text in a parent prop, caller should handle it
  if (!parts || parts.length === 0) return null;

  // Consolidate all reasoning parts into a single block
  const allReasoning = parts.filter((p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning");
  const combinedReasoningText = allReasoning.map(r => r.text).join("\n\n");
  // Only mark as ongoing if the LATEST reasoning part is still streaming
  const lastReasoning = allReasoning.at(-1);
  const isReasoningOngoing = !!lastReasoning?.isOngoing;

  return (
    <div className="flex flex-col gap-0.5 w-full">
      {/* Render reasoning block first */}
      {combinedReasoningText && (
        <ReasoningBlock text={combinedReasoningText} isOngoing={isReasoningOngoing} />
      )}

      {/* Render all other parts in order, skipping reasoning (already above) */}
      {parts.map((part, i) => {
        if (part.type === "reasoning") return null;
        if (part.type === "tool") {
          return (
            <ToolCallBlock
              key={i}
              tool={part.tool}
              title={part.title}
              state={part.state}
            />
          );
        }
        if (part.type === "text" && part.text.trim()) {
          return <TextBlock key={i} text={part.text} />;
        }
        return null;
      })}
    </div>
  );
};
