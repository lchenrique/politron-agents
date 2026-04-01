import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
 Brain, 
 FileText, 
 Search, 
 Edit3, 
 Terminal, 
 Check, 
 Loader2, 
 MessageSquareQuote,
 CheckCircle2,
 AlertCircle,
 ListTodo,
 Flag,
 Info,
 ChevronDown,
 ChevronUp
} from "lucide-react";
import type { MessagePart } from "@/types/workspace";

// ─── Timeline Components ──────────────────────────────────────────────────────

interface TimelineEntryProps {
 icon: React.ElementType;
 label: string;
 subLabel?: string;
 status?: "pending" | "running" | "completed" | "error";
 children?: React.ReactNode;
 colorClass?: string;
 isMonospace?: boolean;
}

const TimelineEntry: React.FC<TimelineEntryProps> = ({ 
 icon: Icon, 
 label, 
 subLabel, 
 status, 
 children, 
 colorClass = "text-ide-indigo",
 isMonospace = true 
}) => {
 const isRunning = status === "running" || status === "pending";
 const isDone = status === "completed";
 const isError = status === "error";

 return (
 <div className="relative pl-6 pb-4 last:pb-0 group">
 {/* Vertical Line */}
 <div className="absolute left-[9px] top-2 bottom-0 w-[1px] bg-ide-border group-last:bg-transparent" />
 
 {/* Node Dot/Icon */}
 <div className="absolute left-0 top-1.5 flex h-[19px] w-[19px] items-center justify-center rounded-full bg-ide-bg border border-ide-border shadow-sm">
 {isRunning ? (
 <Loader2 className={`w-2.5 h-2.5 animate-spin ${colorClass}`} />
 ) : isDone ? (
 <Check className="w-2.5 h-2.5 text-ide-green" />
 ) : isError ? (
 <span className="text-[10px] text-ide-red leading-none font-bold">✕</span>
 ) : (
 <Icon className={`w-2.5 h-2.5 ${colorClass}`} />
 )}
 </div>

 {/* Content */}
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2">
 <span className={`text-[11px] font-bold uppercase tracking-wider ${isMonospace ? 'font-mono' : ''} ${isError ? 'text-ide-red' : isDone ? 'text-ide-green' : isRunning ? 'text-ide-indigo' : 'text-ide-text-dim'}`}>
 {label}
 </span>
 {subLabel && (
 <>
 <span className="text-ide-text-dim/30 text-[10px]">·</span>
 <span className="text-[11px] text-ide-text-dim/70 font-mono truncate max-w-[300px]" title={subLabel}>
 {subLabel.split("/").pop() ?? subLabel}
 </span>
 </>
 )}
 </div>
 {children && (
 <div className="mt-1 ">
 {children}
 </div>
 )}
 </div>
 </div>
 );
};

// ─── Refined Event Components ────────────────────────────────────────────────

export const ReasoningBlock: React.FC<{ text: string; isOngoing: boolean }> = ({ text, isOngoing }) => {
 const [open, setOpen] = useState(isOngoing);

 useEffect(() => {
 setOpen(isOngoing);
 }, [isOngoing]);

 if (!text.trim()) return null;

 return (
 <TimelineEntry 
 icon={Brain} 
 label={isOngoing ? "Thinking" : "Reasoning"} 
 status={isOngoing ? "running" : "completed"}
 >
 <div className="rounded border border-ide-border bg-ide-surface/30 overflow-hidden">
 <button
 onClick={() => setOpen(o => !o)}
 className="w-full flex items-center justify-between px-2 py-1 hover:bg-ide-surface-2 text-ide-text-dim text-[10px] font-mono"
 >
 <span>{open ? "hide reasoning" : "show reasoning"}</span>
 {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
 </button>
 {open && (
 <div className="px-2.5 py-2 text-ide-text-dim/80 leading-relaxed border-t border-ide-border whitespace-pre-wrap font-mono text-[11px] max-h-48 overflow-y-auto scrollbar-thin">
 {text}
 </div>
 )}
 </div>
 </TimelineEntry>
 );
};

const toolInfo = (tool: string) => {
 const t = tool.toLowerCase();
 if (t.includes("read") || t.includes("glob") || t.includes("list")) return { label: "Reading Files", icon: FileText };
 if (t.includes("edit") || t.includes("write") || t.includes("patch")) return { label: "Updating Files", icon: Edit3 };
 if (t.includes("bash") || t.includes("terminal")) return { label: "Running Command", icon: Terminal };
 if (t.includes("search") || t.includes("grep")) return { label: "Searching", icon: Search };
 return { label: tool.replace(/_/g, " "), icon: Terminal };
};

export const ToolCallBlock: React.FC<{ tool: string; title: string; state: "pending" | "running" | "completed" | "error" }> = ({ tool, title, state }) => {
 const { label, icon } = toolInfo(tool);
 return (
 <TimelineEntry 
 icon={icon} 
 label={label} 
 subLabel={title !== tool ? title : undefined} 
 status={state} 
 />
 );
};

export const TextBlock: React.FC<{ text: string }> = ({ text }) => {
 const clean = text
 .replace(/<think>[\s\S]*?<\/think>/gi, "")
 .replace(/<think>[\s\S]*/gi, "")
 .trim();
 
 if (!clean) return null;

 return (
 <div className="text-[13px] leading-relaxed text-ide-text/90 mb-4
 [&_p]:my-1.5
 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:my-2.5
 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2
 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:my-1.5
 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5
 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5
 [&_li]:my-0.5
 [&_pre]:bg-ide-bg [&_pre]:border [&_pre]:border-ide-border [&_pre]:my-3 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre]:font-mono
 [&_code]:text-ide-text-muted [&_code]:bg-ide-surface-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[12px]
 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-ide-text
 [&_a]:text-ide-indigo [&_a]:underline [&_a]:underline-offset-2
 [&_blockquote]:border-l-2 [&_blockquote]:border-ide-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ide-text-dim">
 <ReactMarkdown remarkPlugins={[remarkGfm]}>{clean}</ReactMarkdown>
 </div>
 );
};

export const AskHumanBlock: React.FC<{ question: string }> = ({ question }) => {
 if (!question.trim()) return null;
 return (
 <TimelineEntry icon={MessageSquareQuote} label="Input Required" colorClass="text-ide-amber">
 <div className="rounded-lg border border-ide-amber/20 bg-ide-amber/5 px-3 py-2.5 text-[13px] text-ide-text leading-relaxed">
 {question}
 </div>
 </TimelineEntry>
 );
};

// ─── New Event Components ────────────────────────────────────────────────────

export const CheckpointBlock: React.FC<{ title: string }> = ({ title }) => (
 <TimelineEntry icon={Flag} label="Checkpoint" subLabel={title} colorClass="text-ide-pink" />
);

export const DiagnosticsBlock: React.FC<{ errors: string[]; warnings: string[] }> = ({ errors, warnings }) => (
 <TimelineEntry icon={AlertCircle} label="Diagnostics" colorClass="text-ide-red">
 <div className="flex flex-col gap-1 font-mono text-[11px]">
 {errors.map((e, i) => <div key={i} className="text-ide-red-bright">ERR: {e}</div>)}
 {warnings.map((w, i) => <div key={i} className="text-ide-amber-bright">WRN: {w}</div>)}
 </div>
 </TimelineEntry>
);

export const PlanBlock: React.FC<{ steps: string[] }> = ({ steps }) => (
 <TimelineEntry icon={ListTodo} label="Plan" colorClass="text-ide-teal">
 <div className="flex flex-col gap-1 text-[12px] text-ide-text-dim">
 {steps.map((s, i) => (
 <div key={i} className="flex gap-2">
 <span className="text-ide-teal/50 font-mono">{i + 1}.</span>
 <span>{s}</span>
 </div>
 ))}
 </div>
 </TimelineEntry>
);

export const CompletedBlock: React.FC<{ message?: string }> = ({ message }) => (
 <TimelineEntry icon={CheckCircle2} label="Completed" colorClass="text-ide-green" status="completed">
 {message && <div className="text-[12px] text-ide-text-muted mt-1">{message}</div>}
 </TimelineEntry>
);

// ─── Message Parts Renderer ───────────────────────────────────────────────────

interface MessagePartsProps {
 parts: MessagePart[];
 isUser: boolean;
}

export const MessagePartsRenderer: React.FC<MessagePartsProps> = ({ parts, isUser }) => {
 if (isUser) return null;
 if (!parts || parts.length === 0) return null;

 // Consolidate reasoning
 const allReasoning = parts.filter((p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning");
 const combinedReasoningText = allReasoning.map(r => r.text).join("\n\n");
 const isReasoningOngoing = !!allReasoning.at(-1)?.isOngoing;

 return (
 <div className="flex flex-col w-full">
 {/* Reasoning block first if it exists */}
 {combinedReasoningText && (
 <ReasoningBlock text={combinedReasoningText} isOngoing={isReasoningOngoing} />
 )}

 {/* Other parts in order */}
 {parts.map((part, i) => {
 if (part.type === "reasoning") return null;
 if (part.type === "tool") {
 return <ToolCallBlock key={i} tool={part.tool} title={part.title} state={part.state} />;
 }
 if (part.type === "ask-human") {
 return <AskHumanBlock key={i} question={part.question} />;
 }
 if (part.type === "checkpoint") {
 return <CheckpointBlock key={i} title={part.title} />;
 }
 if (part.type === "diagnostics") {
 return <DiagnosticsBlock key={i} errors={part.errors} warnings={part.warnings} />;
 }
 if (part.type === "plan") {
 return <PlanBlock key={i} steps={part.steps} />;
 }
 if (part.type === "completed") {
 return <CompletedBlock key={i} message={part.message} />;
 }
 if (part.type === "text" && part.text.trim()) {
 // If reasoning is ongoing, hide text (prevents leaked reasoning)
 if (isReasoningOngoing) return null;
 return <TextBlock key={i} text={part.text} />;
 }
 return null;
 })}
 </div>
 );
};
