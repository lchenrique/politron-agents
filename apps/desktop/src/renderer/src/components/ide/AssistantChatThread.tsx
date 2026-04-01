import { useMemo, useState } from "react";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from "@assistant-ui/react";
import { useThreadMessages } from "@assistant-ui/core/react";
import type { AppendMessage, ThreadAssistantMessagePart, ThreadMessage, ThreadUserMessagePart } from "@assistant-ui/core";
import { Send, Plus, Globe } from "lucide-react";
import type { AgentActivityState, ChatMessage, MessagePart } from "@/types/workspace";
import ThinkingIndicator from "./ThinkingIndicator";
import DiffViewer from "./DiffViewer";
import { MessagePartsRenderer } from "./MessageParts";

type AssistantChatThreadProps = {
 messageKey: string;
 messages: ChatMessage[];
 activeAgentId: string;
 activeAgentInitials: string;
 isRunning: boolean;
 activity?: AgentActivityState;
 placeholder: string;
 onSendMessage: (messageKey: string, text: string) => void;
};

const getUserText = (message: AppendMessage): string => {
 return message.content
 .filter((part): part is Extract<ThreadUserMessagePart, { type: "text" }> => part.type === "text")
 .map((part) => part.text)
 .join("\n")
 .trim();
};

const joinLegacyText = (parts: MessagePart[], fallbackText: string): string => {
 const textFromParts = parts
 .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
 .map((part) => part.text)
 .join("\n")
 .trim();

 return textFromParts || fallbackText || "";
};

const getAssistantStatus = (message: ChatMessage): ThreadMessage["status"] => {
 const hasAskHuman = message.parts.some((part) => part.type === "ask-human");
 const hasRunningReasoning = message.parts.some(
 (part) => part.type === "reasoning" && part.isOngoing,
 );
 const hasRunningTool = message.parts.some(
 (part) => part.type === "tool" && (part.state === "pending" || part.state === "running"),
 );

 if (hasAskHuman) {
 return { type: "requires-action", reason: "interrupt" };
 }

 if (hasRunningReasoning || hasRunningTool) {
 return { type: "running" };
 }

 return { type: "complete", reason: "stop" };
};

const convertAssistantPart = (
 part: MessagePart,
 messageId: string,
 partIndex: number,
): ThreadAssistantMessagePart | null => {
 if (part.type === "text") {
 return {
 type: "text",
 text: part.text,
 };
 }

 if (part.type === "reasoning") {
 return {
 type: "reasoning",
 text: part.text,
 };
 }

 if (part.type === "tool") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-tool-${partIndex}`,
 toolName: part.tool,
 args: {
 title: part.title,
 input: (part.input ?? {}) as any,
 },
 argsText: JSON.stringify(part.input ?? {}, null, 2),
 result: part.state === "completed" ? { title: part.title, ok: true } : undefined,
 isError: part.state === "error" || undefined,
 };
 }

 if (part.type === "ask-human") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-ask-${partIndex}`,
 toolName: "ask-human",
 args: { question: part.question },
 argsText: part.question,
 interrupt: {
 type: "human",
 payload: {
 question: part.question,
 },
 },
 };
 }

 if (part.type === "checkpoint") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-checkpoint-${partIndex}`,
 toolName: "checkpoint",
 args: { title: part.title },
 argsText: part.title,
 result: { ok: true },
 };
 }

 if (part.type === "diagnostics") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-diag-${partIndex}`,
 toolName: "diagnostics",
 args: { errors: part.errors, warnings: part.warnings },
 argsText: JSON.stringify(part),
 result: { ok: true },
 };
 }

 if (part.type === "plan") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-plan-${partIndex}`,
 toolName: "plan",
 args: { steps: part.steps },
 argsText: part.steps.join("\n"),
 result: { ok: true },
 };
 }

 if (part.type === "completed") {
 return {
 type: "tool-call",
 toolCallId: `${messageId}-done-${partIndex}`,
 toolName: "completed",
 args: { message: part.message },
 argsText: part.message ?? "Done",
 result: { ok: true },
 };
 }

 return null;
};


const toThreadMessage = (message: ChatMessage): ThreadMessage => {
 const createdAt = new Date(message.timestamp);

 if (message.isUser) {
 const text = joinLegacyText(message.parts, message.text);

 return {
 id: message.id,
 role: "user",
 createdAt,
 content: [
 {
 type: "text",
 text,
 },
 ],
 attachments: [],
 metadata: {
 custom: {
 agentId: message.agentId,
 agentInitials: message.agentInitials,
 agentName: message.agentName,
 agentColor: message.agentColor,
 diff: message.diff,
 },
 },
 };
 }

 const content = message.parts
 .map((part, index) => convertAssistantPart(part, message.id, index))
 .filter((part): part is ThreadAssistantMessagePart => !!part);

 const fallbackText = message.text.trim()
 ? [
 {
 type: "text" as const,
 text: message.text,
 },
 ]
 : [];

 return {
 id: message.id,
 role: "assistant",
 createdAt,
 content: content.length > 0 ? content : fallbackText,
 status: getAssistantStatus(message),
 metadata: {
 unstable_state: null,
 unstable_annotations: [],
 unstable_data: [],
 steps: [],
 custom: {
 agentId: message.agentId,
 agentInitials: message.agentInitials,
 agentName: message.agentName,
 agentColor: message.agentColor,
 diff: message.diff,
 },
 },
 };
};

const mapAssistantUiPartToLegacy = (
 part: ThreadAssistantMessagePart,
 isMessageRunning: boolean,
): MessagePart | null => {
 if (part.type === "text") {
 return { type: "text", text: part.text };
 }

 if (part.type === "reasoning") {
 return {
 type: "reasoning",
 text: part.text,
 isOngoing: isMessageRunning,
 };
 }

 if (part.type === "tool-call") {
 if (part.toolName === "ask-human") {
 const payloadQuestion =
 typeof part.interrupt?.payload === "object" &&
 part.interrupt?.payload &&
 "question" in part.interrupt.payload
 ? String((part.interrupt.payload as { question: string }).question)
 : typeof part.args === "object" && part.args && "question" in part.args
 ? String((part.args as { question: string }).question)
 : part.argsText;

 return {
 type: "ask-human",
 question: payloadQuestion,
 };
 }

 if (part.toolName === "checkpoint") {
 return { type: "checkpoint", title: String(part.argsText) };
 }
 if (part.toolName === "diagnostics") {
 const args = typeof part.args === "object" && part.args ? part.args : {};
 return { 
 type: "diagnostics", 
 errors: Array.isArray((args as any).errors) ? (args as any).errors : [],
 warnings: Array.isArray((args as any).warnings) ? (args as any).warnings : []
 };
 }
 if (part.toolName === "plan") {
 const args = typeof part.args === "object" && part.args ? part.args : {};
 return {
 type: "plan",
 steps: Array.isArray((args as any).steps) ? (args as any).steps : []
 };
 }
 if (part.toolName === "completed") {
 const args = typeof part.args === "object" && part.args ? part.args : {};
 return {
 type: "completed",
 message: (args as any).message
 };
 }

 let state: "pending" | "running" | "completed" | "error" = "completed";
 if (part.interrupt?.type === "human") {
 state = "pending";
 } else if (!part.result && isMessageRunning) {
 state = "running";
 } else if (part.isError) {
 state = "error";
 }

 const args = typeof part.args === "object" && part.args ? part.args : {};
 const title =
 typeof args === "object" && args && "title" in args
 ? String((args as { title?: string }).title || part.toolName)
 : part.toolName;
 const input =
 typeof args === "object" && args && "input" in args
 ? ((args as { input?: Record<string, unknown> }).input ?? {})
 : (args as Record<string, unknown>);

 return {
 type: "tool",
 tool: part.toolName,
 title,
 state,
 input,
 };
 }

 return null;
};

const AssistantChatThreadBody = ({
 activeAgentInitials,
 activity,
 isRunning,
 messageKey,
 onSendMessage,
 placeholder,
}: Pick<
 AssistantChatThreadProps,
 "activeAgentInitials" | "activity" | "isRunning" | "messageKey" | "onSendMessage" | "placeholder"
>) => {
 const runtimeMessages = useThreadMessages();
 const [composerText, setComposerText] = useState("");

 // Show ThinkingIndicator bubble ONLY when there are NO assistant messages yet
 // Once an assistant message appears, the content itself will show the thinking/editing state
 const hasAnyAssistantMessage = runtimeMessages.some(
 (message) => message.role === "assistant",
 );

 const showActivity =
 !!activity &&
 activity.activity !== "idle" &&
 !hasAnyAssistantMessage;

 const handleSend = () => {
 const text = composerText.trim();
 if (!text) return;

 onSendMessage(messageKey, text);
 setComposerText("");
 };

 const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
 if (event.key === "Enter" && !event.shiftKey) {
 event.preventDefault();
 handleSend();
 }
 };

 return (
 <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
 <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 scrollbar-thin">
 <ThreadPrimitive.Messages>
 {({ message }) => {
 const metadata = message.metadata.custom as {
 agentInitials?: string;
 agentName?: string;
 agentColor?: string;
 diff?: ChatMessage["diff"];
 };

 const isUser = message.role === "user";
 const legacyParts = isUser
 ? []
 : message.content
 .map((part) => mapAssistantUiPartToLegacy(part, message.status.type === "running"))
 .filter((part): part is MessagePart => !!part);

 const agentInitials = metadata.agentInitials ?? (isUser ? "VC" : activeAgentInitials);
 const agentName = metadata.agentName ?? (isUser ? "você" : "Agente");
 const agentColor = metadata.agentColor ?? "hsl(239 84% 67%)";

 return (
 <MessagePrimitive.Root
 key={message.id}
 className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
 >
 <div
 className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border text-[10px] font-medium"
 style={{
 background: agentColor.replace(")", " / 0.1").replace("hsl(", "hsl("),
 color: agentColor,
 borderColor: agentColor.replace(")", " / 0.2)").replace("hsl(", "hsl("),
 }}
 >
 {agentInitials}
 </div>
 <div className={`${isUser ? "max-w-[75%]" : "flex-1"}`}>
 <div className={`mb-1 text-[10px] uppercase font-bold tracking-widest text-ide-text-dim ${isUser ? "text-right" : "text-left ml-0.5"}`}>
 {agentName}
 </div>
 <div
 className={`${
 isUser
 ? "rounded-lg border border-ide-indigo/15 bg-[hsl(240,30%,12%)] px-3 py-2 text-[13px] leading-relaxed text-ide-text/90 shadow-sm"
 : "text-[13px] leading-relaxed text-ide-text/80 pl-2"
 }`}
 >
 {isUser ? (
 <MessagePrimitive.Parts>
 {({ part }) => {
 if (part.type !== "text") return null;

 return <p className="whitespace-pre-wrap">{part.text}</p>;
 }}
 </MessagePrimitive.Parts>
 ) : (
 <MessagePartsRenderer parts={legacyParts} isUser={false} />
 )}
 </div>
 {metadata.diff && <DiffViewer diff={metadata.diff} className="mt-2" />}
 </div>
 </MessagePrimitive.Root>
 );
 }}
 </ThreadPrimitive.Messages>

 {showActivity && (
 <div className="flex gap-2.5">
 <div className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-ide-border bg-ide-surface-2 text-[10px] font-medium opacity-50">
 {activeAgentInitials}
 </div>
 <div className="mt-1">
 <ThinkingIndicator
 status={activity.activity}
 filename={activity.filename}
 />
 </div>
 </div>
 )}
 </ThreadPrimitive.Viewport>

 <div className="shrink-0 bg-ide-bg px-5 pb-5 pt-4">
 <div className="flex flex-col gap-3 rounded-2xl border border-ide-text-dim/20 bg-ide-surface-2 p-4 focus-within:border-ide-text-dim/30 focus-within:shadow-[0_0_0_4px_hsl(239_84%_67%/0.06)]">
 <textarea
 value={composerText}
 onChange={(event) => setComposerText(event.target.value)}
 onKeyDown={handleKeyDown}
 placeholder={placeholder}
 rows={1}
 className="min-h-[24px] max-h-[200px] w-full resize-none border-none bg-transparent font-sans text-[15px] leading-relaxed text-ide-text outline-none placeholder:text-ide-text-dim/50"
 />
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <button className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ide-text-dim/15 bg-ide-surface-3 px-3 py-1.5 text-xs text-ide-text-muted hover:border-ide-text-dim/25 hover:bg-ide-surface-2 hover:text-ide-text/70">
 <Plus className="h-3.5 w-3.5 opacity-60" /> Arquivo
 </button>
 <button className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ide-text-dim/15 bg-ide-surface-3 px-3 py-1.5 text-xs text-ide-text-muted hover:border-ide-text-dim/25 hover:bg-ide-surface-2 hover:text-ide-text/70">
 <Globe className="h-3.5 w-3.5 opacity-60" /> URL
 </button>
 </div>
 <button
 onClick={handleSend}
 disabled={!composerText.trim() || isRunning}
 className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ide-indigo hover:scale-105 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
 >
 <Send className="h-4 w-4 text-white" />
 </button>
 </div>
 </div>
 </div>
 </ThreadPrimitive.Root>
 );
};

const AssistantChatThread = ({
 messageKey,
 messages,
 activeAgentId,
 activeAgentInitials,
 isRunning,
 activity,
 placeholder,
 onSendMessage,
}: AssistantChatThreadProps) => {
 const runtimeMessages = useMemo(() => messages.map(toThreadMessage), [messages]);

 const runtime = useExternalStoreRuntime({
 messages: runtimeMessages,
 isRunning,
 onNew: async (message) => {
 const text = getUserText(message);
 if (!text) return;
 onSendMessage(messageKey, text);
 },
 onCancel: async () => {
 // Cancellation is not wired through the Electron backend yet.
 },
 convertMessage: (message: ThreadMessage) => message,
 });

 return (
 <AssistantRuntimeProvider runtime={runtime}>
 <AssistantChatThreadBody
 activeAgentInitials={activeAgentInitials}
 activity={activity}
 isRunning={isRunning}
 messageKey={messageKey}
 onSendMessage={onSendMessage}
 placeholder={placeholder}
 />
 </AssistantRuntimeProvider>
 );
};

export default AssistantChatThread;
