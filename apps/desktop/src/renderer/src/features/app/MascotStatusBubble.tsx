export function MascotStatusBubble({ text, className = '' }: { text?: string; className?: string }) {
  if (!text) return null
  return <div role="status" aria-live="polite" aria-atomic="true" className={`relative max-w-56 break-words rounded-xl border border-border/80 bg-popover px-3 py-1.5 text-center text-[11px] leading-4 text-popover-foreground shadow-md ${className}`}>
    {text}
    <span aria-hidden="true" className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-border/80 bg-popover" />
  </div>
}
