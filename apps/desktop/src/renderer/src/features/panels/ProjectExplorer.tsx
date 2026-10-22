import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Folder, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileTree, type FileTreeItem } from '@/components/ai/file-tree'
import type { ProjectFileEntry } from '../../../../shared/v9'
import { errorText } from '../app/appShellShared'

// Monaco is large. Start downloading its chunk as the user heads toward a file,
// not after the filesystem request has finished.
let editorPreload: Promise<unknown> | undefined
const prewarmEditor = () => {
  editorPreload ??= import('./MonacoCodeEditor').catch(() => {
    editorPreload = undefined
  })
}

function ProjectTree({ workspaceId, refreshKey, onOpenFile }: {
  workspaceId: string
  refreshKey: number
  onOpenFile: (workspaceId: string, path: string) => void
}) {
  const [directories, setDirectories] = useState<Record<string, ProjectFileEntry[]>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string>()
  const inFlight = useRef(new Set<string>())
  const alive = useRef(false)

  const load = useCallback((path: string) => {
    if (inFlight.current.has(path)) return
    inFlight.current.add(path)
    setPending(current => new Set([...current, path]))
    void window.appAPI.listProjectFiles(workspaceId, path)
      .then(result => {
        if (!alive.current) return
        setDirectories(current => ({ ...current, [path]: result }))
        setErrors(current => {
          if (!current[path]) return current
          const next = { ...current }
          delete next[path]
          return next
        })
      })
      .catch(cause => {
        if (alive.current) setErrors(current => ({ ...current, [path]: errorText(cause) }))
      })
      .finally(() => {
        inFlight.current.delete(path)
        if (alive.current) setPending(current => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
      })
  }, [workspaceId])

  useEffect(() => {
    alive.current = true
    load('')
    return () => { alive.current = false }
  }, [load, refreshKey])

  const nodes = useMemo<FileTreeItem[]>(() => {
    const output: FileTreeItem[] = []
    const visit = (directory: string, depth: number) => {
      for (const item of directories[directory] || []) {
        output.push({
          id: item.path,
          name: item.name,
          kind: item.directory ? 'folder' : 'file',
          depth,
        })
        if (item.directory && expanded.has(item.path)) visit(item.path, depth + 1)
      }
    }
    visit('', 0)
    return output
  }, [directories, expanded])

  const toggleFolder = (path: string, open: boolean) => {
    setExpanded(current => {
      const next = new Set(current)
      if (open) next.add(path)
      else next.delete(path)
      return next
    })
    if (open && !Object.prototype.hasOwnProperty.call(directories, path)) load(path)
  }
  const chooseFile = (path: string) => {
    prewarmEditor()
    setSelected(path)
    onOpenFile(workspaceId, path)
  }
  const firstError = Object.entries(errors)[0]
  return <>
    <FileTree title="Arquivos do projeto" aria-label="Árvore de arquivos do projeto"
      className="!rounded-none !bg-transparent !p-1.5 !shadow-none"
      hideHeader items={nodes} expandedIds={expanded} selectedId={selected}
      onFolderToggle={toggleFolder} onSelect={chooseFile} onFileIntent={prewarmEditor}
    />
    {pending.size > 0 && <p role="status" className="px-3 py-1.5 text-xs text-muted-foreground">
      Lendo {Array.from(pending).map(item => item || 'projeto').join(', ')}…
    </p>}
    {firstError && <div role="alert" className="mx-2 my-1 rounded-md border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive">
      Não foi possível ler {firstError[0] || 'o projeto'}: {firstError[1]}
      <Button size="sm" variant="ghost" className="ml-1 h-6 text-xs" onClick={() => load(firstError[0])}>Tentar novamente</Button>
    </div>}
    {!pending.size && !firstError && nodes.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum arquivo encontrado.</p>}
  </>
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
    <div className="min-h-0 flex-1 overflow-auto py-1">
      <ProjectTree key={workspaceId + ':' + refreshKey} workspaceId={workspaceId} refreshKey={refreshKey} onOpenFile={onOpenFile} />
    </div>
  </section>
}
