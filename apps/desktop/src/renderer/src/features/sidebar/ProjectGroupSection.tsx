import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Workspace } from '../../../../shared/v9'

/** Cabecalho de uma pasta de projetos: recolhe a lista e expoe renomear/excluir. */
export function ProjectGroupSection({ name, items, collapsed, editable, onToggle, onRename, onRemove, renderWorkspace }: {
  name: string
  items: Workspace[]
  collapsed: boolean
  editable?: boolean
  onToggle: () => void
  onRename: () => void
  onRemove: () => void
  renderWorkspace: (workspace: Workspace) => ReactNode
}) {
  return <div className="mt-1">
    <div className="group flex items-center gap-1">
      <Button variant="ghost" className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-2 text-xs" onClick={onToggle} aria-label={collapsed ? `Expandir ${name}` : `Recolher ${name}`}>
        {collapsed ? <ChevronRight className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{name}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{items.length}</span>
      </Button>
      {editable && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ações da pasta ${name}`} title="Ações da pasta"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}><Pencil className="mr-2 size-4" />Renomear pasta</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir pasta</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
    {!collapsed && !!items.length && <div className="ml-5 border-l border-border/50 pl-1">{items.map(workspace => renderWorkspace(workspace))}</div>}
  </div>
}
