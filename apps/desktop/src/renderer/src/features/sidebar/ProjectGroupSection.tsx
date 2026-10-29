import type { ReactNode } from 'react'
import { Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, Triangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Workspace } from '../../../../shared/v9'
import { moveKey, SortableGroup, useSortableStyle } from './SortableRows'

/** Cabecalho de uma pasta de projetos: recolhe a lista e expoe renomear/excluir. Pastas editáveis podem ser arrastadas; todas recebem projetos soltos sobre o cabeçalho. */
export function ProjectGroupSection({ name, items, collapsed, editable, onToggle, onRename, onRemove, onMove, renderWorkspace }: {
  name: string
  items: Workspace[]
  collapsed: boolean
  editable?: boolean
  onToggle: () => void
  onRename: () => void
  onRemove: () => void
  onMove?: (delta: number) => void
  renderWorkspace: (workspace: Workspace) => ReactNode
}) {
  // "Outros" (projetos sem pasta) não se move, mas aceita projetos tirados de uma pasta.
  const { setNodeRef, listeners, style } = useSortableStyle(editable ? 'group:' + name : 'group:', { type: 'group', name: editable ? name : null }, editable ? undefined : { draggable: true, droppable: false })
  return <div ref={setNodeRef} style={style} className="dsh-rows mt-1">
    <div className="dsh-row dsh-folder group" {...listeners} onKeyDown={event => { if (onMove) moveKey(event, onMove) }}>
      <Button variant="ghost" size={null} className="dsh-row-main" onClick={onToggle} aria-label={collapsed ? `Expandir ${name}` : `Recolher ${name}`}>
        <span className="dsh-slot"><Triangle className="dsh-arrow rotate-90 fill-current" data-open={!collapsed} />{collapsed ? <Folder className="dsh-folder-icon" /> : <FolderOpen className="dsh-folder-icon" />}</span>
        <span className="dsh-title">{name}</span>
        <span className="dsh-meta dsh-resting">{items.length}</span>
      </Button>
      {editable && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size={null} className="dsh-row-action" aria-label={`Ações da pasta ${name}`} title="Ações da pasta"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}><Pencil className="mr-2 size-4" />Renomear pasta</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 size-4" />Excluir pasta</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
    {!collapsed && !!items.length && <div className="dsh-indent dsh-rows"><SortableGroup ids={items.map(workspace => workspace.id)}>{items.map(workspace => renderWorkspace(workspace))}</SortableGroup></div>}
  </div>
}
