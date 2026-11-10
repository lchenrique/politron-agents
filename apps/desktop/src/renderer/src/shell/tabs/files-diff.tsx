import { useMemo, useState } from 'react'
import { FolderTree, ShieldAlert } from 'lucide-react'
import type { FileChange } from '../../../../shared/v9'
import { ProjectExplorer } from '@/features/panels/ProjectExplorer'
import { toFileDiff } from '@/features/diff/file-diff-model'
import { cn } from '@/lib/utils'

/**
 * Aba "Arquivos & Diff" no desenho do HTML: chips dos arquivos alterados com o
 * autor, nota de revisão e o diff unificado linha a linha. A árvore do projeto
 * continua a um clique, no mesmo cabeçalho.
 */
export function FilesDiffTab({ workspaceId, changes, onOpenFile }: {
  workspaceId?: string | null
  changes: FileChange[]
  onOpenFile: (workspaceId: string, path: string) => void
}) {
  const applied = useMemo(() => {
    const last = new Map<string, FileChange>()
    for (const change of changes) {
      if (change.status !== 'applied') continue
      if (workspaceId && change.workspaceId !== workspaceId) continue
      last.set(change.path, change)
    }
    return [...last.values()].sort((a, b) => a.path.localeCompare(b.path))
  }, [changes, workspaceId])

  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'diff' | 'tree'>(applied.length ? 'diff' : 'tree')
  const current = applied.find(change => change.path === selected) || applied[0]

  const lines = useMemo(() => {
    if (!current || current.binary || current.truncated) return []
    return toFileDiff(current.before, current.after, current.path).hunks.flatMap(hunk => hunk.lines)
  }, [current])

  if (mode === 'tree') {
    return <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">Explorador do projeto</span>
        <button type="button" onClick={() => setMode('diff')} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          Ver alterações ({applied.length})
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden"><ProjectExplorer workspaceId={workspaceId} onOpenFile={onOpenFile} /></div>
    </div>
  }

  return <div className="flex h-full min-h-0 flex-col bg-[var(--bg-pane)] select-text">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {applied.map(change => {
          const name = change.path.replace(/\\/g, '/').split('/').pop() || change.path
          const active = change.path === current?.path
          return (
            <button
              key={change.path}
              type="button"
              title={change.path}
              onClick={() => setSelected(change.path)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11.5px] transition',
                active
                  ? 'border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
              )}
            >
              <span className="max-w-40 truncate">{name}</span>
              <span className="text-[10px] text-emerald-400">+{change.additions}</span>
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {current ? <span className="font-mono text-[11px] text-[var(--text-muted)]">Autor: @{current.agentId ? current.agentId.slice(0, 8) : 'Boo'}</span> : null}
        <button type="button" onClick={() => setMode('tree')} title="Abrir a árvore do projeto" className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          <FolderTree className="size-3" /> Árvore
        </button>
      </div>
    </div>

    <div className="flex shrink-0 items-start gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[11.5px] text-[var(--text-secondary)]">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-teal-400" />
      <span>
        {current
          ? `${current.path} · ${current.additions} adições e ${current.deletions} remoções aplicadas nesta conversa.`
          : 'Nenhuma alteração aplicada ainda. O diff aparece aqui quando um Boo escrever arquivos.'}
      </span>
    </div>

    <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-[12px]">
      {current?.binary || current?.truncated ? <p className="px-3.5 text-[11.5px] text-[var(--text-muted)]">Comparação textual indisponível para arquivo binário ou truncado.</p> : null}
      {lines.map((line, index) => {
        const type = line.type
        const added = type === 'addition'
        const removed = type === 'deletion'
        return (
          <div
            key={index}
            className={cn(
              'flex items-start gap-3 px-3 py-0.5',
              added && 'border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-200',
              removed && 'border-l-2 border-rose-500 bg-rose-500/10 text-rose-300 line-through opacity-75',
              !added && !removed && 'text-[var(--text-secondary)]',
            )}
          >
            <span className="w-6 shrink-0 text-right text-[10.5px] text-[var(--text-muted)] select-none">{line.newNumber ?? ''}</span>
            <span className="w-3 shrink-0 select-none">{added ? '+' : removed ? '-' : ' '}</span>
            <span className="overflow-x-auto whitespace-pre">{line.content}</span>
          </div>
        )
      })}
      {current && !lines.length && !current.binary && !current.truncated ? <p className="px-3.5 text-[11.5px] text-[var(--text-muted)]">Sem diferenças textuais neste arquivo.</p> : null}
    </div>
  </div>
}
