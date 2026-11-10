import { useMemo, useState } from 'react'
import { ChevronDown, FileDiff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  // Pílula compacta do design, acima do compositor: contagem, saldos e "Revisar".
  return <section aria-label={label} className="mb-1.5 overflow-hidden">
    <div className="flex items-center justify-between gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px]">
      <Button type="button" variant="ghost" size={null} aria-label="Revisar arquivos modificados" aria-expanded={expanded}
        onClick={() => setExpanded(open => !open)}
        className="flex min-w-0 flex-1 justify-start gap-2 rounded-none text-left text-[11px] font-normal text-inherit outline-none hover:bg-transparent hover:text-inherit focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
        <FileDiff aria-hidden className="size-3.5 shrink-0 text-[var(--accent-primary)]" />
        <span className="min-w-0 truncate font-medium text-[var(--text-secondary)]">{applied.length} {applied.length === 1 ? 'arquivo modificado' : 'arquivos modificados'}</span>
        <span className="shrink-0 font-mono text-[11px] text-emerald-400">+{totals.added}</span>
        <span className="shrink-0 font-mono text-[11px] text-rose-400">−{totals.removed}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 font-medium text-[var(--text-primary)]">Revisar<ChevronDown aria-hidden className={'size-3 transition-transform ' + (expanded ? 'rotate-180' : '')} /></span>
      </Button>
      <Button type="button" variant="ghost" size={null} aria-label="Dispensar revisão" title="Ocultar revisão" className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]" onClick={() => setDismissed(true)}><X className="size-3" /></Button>
    </div>
    {expanded && <div className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5">
      <AIDiffReview readOnly compact files={files} className="max-w-none" />
      {unavailable.length > 0 && <p className="px-2 pt-2 text-xs text-muted-foreground">
        Comparação textual indisponível para {unavailable.length} {unavailable.length === 1 ? 'arquivo binário ou parcial' : 'arquivos binários ou parciais'}.
      </p>}
    </div>}
  </section>
}
