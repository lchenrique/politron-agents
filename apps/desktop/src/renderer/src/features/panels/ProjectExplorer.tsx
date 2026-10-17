import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProjectFileEntry } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'

function ExplorerFolder({ workspaceId, path, name, depth, onOpenFile, refreshKey }: {
  workspaceId: string
  path: string
  name: string
  depth: number
  onOpenFile: (workspaceId: string, path: string) => void
  refreshKey: number
}) {
  const [expanded, setExpanded] = useState(!path)
  const [entries, setEntries] = useState<ProjectFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!expanded) return
    let live = true
    setLoading(true)
    window.appAPI.listProjectFiles(workspaceId, path).then(items => {
      if (live) { setEntries(items); setError('') }
    }).catch(cause => { if (live) setError(errorText(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [workspaceId, path, expanded, refreshKey])
  return <div className="min-w-0">
    {path && <button type="button" aria-label={name + (expanded ? ' recolher pasta' : ' expandir pasta')} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded px-2 text-left text-xs text-foreground hover:bg-accent/70" style={{ paddingLeft: depth * 13 + 8 }}>
      {expanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
      {expanded ? <FolderOpen className="size-3.5 shrink-0 text-primary/80" /> : <Folder className="size-3.5 shrink-0 text-primary/80" />}
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>}
    {expanded && <div>
      {loading && <p className="px-4 py-2 text-xs text-muted-foreground" style={{ paddingLeft: (depth + 1) * 13 }}>Lendo pasta…</p>}
      {error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{error}</p>}
      {!loading && !error && entries.map(entry => entry.directory
        ? <ExplorerFolder key={entry.path} workspaceId={workspaceId} path={entry.path} name={entry.name} depth={depth + 1} onOpenFile={onOpenFile} refreshKey={refreshKey} />
        : <button key={entry.path} type="button" title={entry.path} onClick={() => onOpenFile(workspaceId, entry.path)}
          className="flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground" style={{ paddingLeft: (depth + 1) * 13 + 8 }}>
          <FileCode2 className="size-3.5 shrink-0 text-primary/70" /><span className="min-w-0 truncate">{entry.name}</span>
        </button>)}
      {!loading && !error && !entries.length && <p className="px-3 py-1 text-[11px] text-muted-foreground">{path ? 'Pasta vazia' : 'Nenhum arquivo encontrado'}</p>}
    </div>}
  </div>
}

export function ProjectExplorer({ workspaceId, onOpenFile }: {
  workspaceId?: string | null
  onOpenFile: (workspaceId: string, path: string) => void
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  if (!workspaceId) return <div className="flex h-full flex-col items-center justify-center p-6 text-center">
    <Folder className="mb-3 size-9 text-muted-foreground/50" />
    <h3 className="text-sm font-medium">Selecione um projeto</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Escolha um workspace para ver sua árvore de arquivos.</p>
  </div>
  return <section aria-label="Explorador de arquivos" className="flex h-full min-h-0 flex-col overflow-hidden">
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Arquivos do projeto</span>
      <Button size="icon" variant="ghost" className="size-7" aria-label="Atualizar árvore de arquivos" title="Atualizar arquivos" onClick={() => setRefreshKey(key => key + 1)}><RefreshCw className="size-3.5" /></Button>
    </header>
    <div className="min-h-0 flex-1 overflow-auto py-2"><ExplorerFolder key={workspaceId} workspaceId={workspaceId} path="" name="" depth={0} onOpenFile={onOpenFile} refreshKey={refreshKey} /></div>
  </section>
}
