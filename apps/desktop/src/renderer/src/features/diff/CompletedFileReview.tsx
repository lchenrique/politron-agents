import { useMemo, useState } from 'react'
import { ChevronDown, Files, X } from 'lucide-react'
import AIDiffReview, { type FileChange as ReviewFile } from '@/components/kokonutui/ai-diff-review'
import type { FileChange } from '../../../../shared/v9'
import { toFileDiff } from './file-diff-model'

/** Read-only review of already applied changes: docked above the composer or inline under older replies. */
export function CompletedFileReview({ changes, label = 'Revisão de arquivos modificados' }: { changes: FileChange[]; label?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const applied = useMemo(() => {
    const last = new Map<string, FileChange>()
    for (const change of changes) if (change.status === 'applied') last.set(change.path, change)
    return [...last.values()]
  }, [changes])
  const files = useMemo<ReviewFile[]>(() => applied.map(change => ({
    path: change.path.replace(/\\/g, '/'),
    hunks: change.binary || change.truncated ? [] : toFileDiff(change.before, change.after, change.path).hunks.map(hunk => ({
      start: hunk.lines.find(line => line.newNumber !== undefined)?.newNumber || 1,
      lines: hunk.lines.map(line => ({
        type: line.type === 'addition' ? 'add' as const : line.type === 'deletion' ? 'remove' as const : 'context' as const,
        text: line.content,
      })),
    })),
  })), [applied])
  if (!applied.length || dismissed) return null
  // Use the very same hunks shown in the review. Backend operation counters can
  // differ from the last net file diff after several writes to the same path.
  const totals = files.reduce((sum, file, index) => {
    const change = applied[index]
    if (change.binary || change.truncated) {
      sum.added += change.additions
      sum.removed += change.deletions
    } else {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') sum.added++
          if (line.type === 'remove') sum.removed++
        }
      }
    }
    return sum
  }, { added: 0, removed: 0 })
  const unavailable = applied.filter(change => change.binary || change.truncated)

  return <section aria-label={label} className="mb-2 overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-sm">
    <div className="flex min-h-9 items-center gap-2 px-2.5">
      <button type="button" aria-label="Revisar arquivos modificados" aria-expanded={expanded}
        onClick={() => setExpanded(open => !open)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Files aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">{applied.length} {applied.length === 1 ? 'arquivo modificado' : 'arquivos modificados'}</span>
        <span className="shrink-0 font-mono text-[11px] text-emerald-600">+{totals.added}</span>
        <span className="shrink-0 font-mono text-[11px] text-red-500">−{totals.removed}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">Já aplicados · Revisar</span>
        <ChevronDown aria-hidden className={'size-3.5 shrink-0 transition-transform ' + (expanded ? 'rotate-180' : '')} />
      </button>
      <button type="button" aria-label="Dispensar revisão" title="Ocultar revisão" className="rounded-md p-1 text-muted-foreground hover:bg-accent" onClick={() => setDismissed(true)}><X className="size-3.5" /></button>
    </div>
    {expanded && <div className="max-h-72 overflow-y-auto border-t border-border/50 p-1.5">
      <AIDiffReview readOnly compact files={files} className="max-w-none" />
      {unavailable.length > 0 && <p className="px-2 pt-2 text-xs text-muted-foreground">
        Comparação textual indisponível para {unavailable.length} {unavailable.length === 1 ? 'arquivo binário ou parcial' : 'arquivos binários ou parciais'}.
      </p>}
    </div>}
  </section>
}
