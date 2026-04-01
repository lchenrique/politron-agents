import { useMemo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from "@pierre/diffs";
import { cn } from "@/lib/utils";

export interface DiffLine {
 type: "add" | "rem" | "ctx";
 text: string;
}

export interface DiffData {
 filename: string;
 additions: number;
 deletions: number;
 lines: DiffLine[];
}

interface DiffViewerProps {
 diff: DiffData;
 className?: string;
}

export function DiffViewer({ diff, className }: DiffViewerProps) {
 const fileDiff = useMemo(() => {
 if (!diff.lines.length) return null;

 // Reconstruct old and new file contents from the diff lines
 const oldLines: string[] = [];
 const newLines: string[] = [];

 for (const line of diff.lines) {
 if (line.type === "rem") {
 oldLines.push(line.text);
 } else if (line.type === "add") {
 newLines.push(line.text);
 } else {
 oldLines.push(line.text);
 newLines.push(line.text);
 }
 }

 const oldFile: FileContents = {
 name: diff.filename,
 contents: oldLines.join("\n"),
 };

 const newFile: FileContents = {
 name: diff.filename,
 contents: newLines.join("\n"),
 };

 try {
 return parseDiffFromFile(oldFile, newFile);
 } catch (err) {
 console.error("Failed to parse diff:", err);
 return null;
 }
 }, [diff]);

 if (!fileDiff) {
 // Fallback to basic diff display
 return (
 <div className={cn("border border-ide-border rounded-md overflow-hidden", className)}>
 <div className="bg-ide-surface-2 px-3 py-2 flex items-center gap-2 border-b border-ide-border">
 <span className="text-[11px] font-mono text-ide-text-muted">{diff.filename}</span>
 <span className="ml-auto text-[10px] font-mono">
 <span className="text-ide-green-bright">+{diff.additions}</span>{" "}
 <span className="text-ide-red-bright">-{diff.deletions}</span>
 </span>
 </div>
 <div className="text-[11px] font-mono">
 {diff.lines.map((line, i) => (
 <div
 key={i}
 className={cn(
 "flex gap-2 px-3 py-px",
 line.type === "add" && "bg-[hsl(145,60%,8%)] text-ide-green-bright",
 line.type === "rem" && "bg-[hsl(0,60%,10%)] text-ide-red-bright",
 line.type === "ctx" && "text-ide-text-dim"
 )}
 >
 <span className="select-none w-4 shrink-0 opacity-50">
 {line.type === "add" ? "+" : line.type === "rem" ? "-" : " "}
 </span>
 {line.text}
 </div>
 ))}
 </div>
 </div>
 );
 }

 return (
 <div className={cn("border border-[#2a2a2a] rounded-lg overflow-hidden", className)}>
 <FileDiff
 fileDiff={fileDiff}
 options={{
 disableFileHeader: true,
 }}
 renderCustomHeader={(fd) => (
 <div className="flex items-center gap-2 px-3 py-2">
 <span className="text-[12px] font-mono text-[#ccc]">{fd.name}</span>
 <span className="ml-auto text-[11px] font-mono">
 <span className="text-[#4ade80]">+{diff.additions}</span>{" "}
 <span className="text-[#f87171]">-{diff.deletions}</span>
 </span>
 </div>
 )}
 className="font-mono"
 style={{
 "--diff-bg": "transparent",
 "--diff-border": "#2a2a2a",
 } as React.CSSProperties}
 />
 </div>
 );
}

export default DiffViewer;
