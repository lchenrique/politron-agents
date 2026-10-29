import { useState, type ReactNode } from 'react'
import { Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, Triangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/dsh'
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
  const [menuOpen, setMenuOpen] = useState(false)
  // "Outros" (projetos sem pasta) não se move, mas aceita projetos tirados de uma pasta.
  const { setNodeRef, listeners, style } = useSortableStyle(editable ? 'group:' + name : 'group:', { type: 'group', name: editable ? name : null }, editable ? undefined : { draggable: true, droppable: false })
  return <div ref={setNodeRef} style={style} className="dsh-rows mt-1">
    <div className="dsh-row dsh-folder group" {...listeners} onKeyDown={event => { if (onMove) moveKey(event, onMove) }}>
      <Button variant="ghost" size={null} className="dsh-row-main" onClick={onToggle} aria-label={collapsed ? `Expandir ${name}` : `Recolher ${name}`}>
        <span className="dsh-slot"><Triangle className="dsh-arrow rotate-90 fill-current" data-open={!collapsed} />{collapsed ? <Folder className="dsh-folder-icon" /> : <FolderOpen className="dsh-folder-icon" />}</span>
        <span className="dsh-title">{name}</span>
        <span className="dsh-meta dsh-resting">{items.length}</span>
      </Button>
      {editable && <Menu open={menuOpen} onClose={() => setMenuOpen(false)} align="end" portal autoFocus
        anchor={<Button variant="ghost" size={null} className="dsh-row-action" aria-label={`Ações da pasta ${name}`} title="Ações da pasta"
          aria-haspopup="menu" aria-expanded={menuOpen} onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setMenuOpen(value => !value) } }} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal /></Button>}
        items={[{ id: 'rename', label: 'Renomear pasta', icon: <Pencil /> }, { id: 'remove', label: 'Excluir pasta', icon: <Trash2 />, danger: true }]}
        onSelect={id => { setMenuOpen(false); if (id === 'rename') onRename(); else if (id === 'remove') onRemove() }} />}
    </div>
    {!collapsed && !!items.length && <div className="dsh-indent dsh-rows"><SortableGroup ids={items.map(workspace => workspace.id)}>{items.map(workspace => renderWorkspace(workspace))}</SortableGroup></div>}
  </div>
}
