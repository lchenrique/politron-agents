import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { closestCenter, DndContext, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type SortableData = { type: 'project' | 'group' | 'session' | 'agent'; group?: string | null; name?: string | null }

/** Só compara com itens do mesmo tipo; um projeto solto sobre o cabeçalho de uma pasta entra nela. */
const collision: CollisionDetection = args => {
  const type = (args.active.data.current as SortableData | undefined)?.type
  const of = (kind: SortableData['type']) => args.droppableContainers.filter(item => (item.data.current as SortableData | undefined)?.type === kind)
  if (type === 'group') return closestCenter({ ...args, droppableContainers: of('group') })
  const hit = pointerWithin({ ...args, droppableContainers: of(type!) })
  if (hit.length) return hit
  if (type === 'project') { const group = pointerWithin({ ...args, droppableContainers: of('group') }); if (group.length) return group }
  return closestCenter({ ...args, droppableContainers: of(type!) })
}

const stop = (event: Event) => { event.preventDefault(); event.stopPropagation() }
const accessibility = {
  screenReaderInstructions: { draggable: 'Para mover, use Alt+Seta para cima ou Alt+Seta para baixo.' },
  announcements: { onDragStart: () => undefined, onDragOver: () => undefined, onDragEnd: () => undefined, onDragCancel: () => undefined }
}

/**
 * Área de arrastar e soltar. Mouse começa a arrastar após 5px; toque, após segurar 250 ms,
 * para que tocar e rolar a lista continuem funcionando na PWA.
 */
export function SortableArea({ onDragEnd, children }: { onDragEnd: (event: DragEndEvent) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )
  // Soltar sobre o próprio botão não deve abrir o item; o toque longo não deve abrir o menu de contexto.
  const release = () => setTimeout(() => { window.removeEventListener('click', stop, true); window.removeEventListener('contextmenu', stop, true) }, 0)
  return <DndContext sensors={sensors} collisionDetection={collision} accessibility={accessibility}
    onDragStart={() => { window.addEventListener('click', stop, true); window.addEventListener('contextmenu', stop, true) }}
    onDragCancel={release}
    onDragEnd={event => { release(); onDragEnd(event) }}>
    {children}
  </DndContext>
}

/** `grid`: itens que quebram linha (faixa de avatares) em vez de uma coluna. */
export function SortableGroup({ ids, grid, children }: { ids: string[]; grid?: boolean; children: ReactNode }) {
  return <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>{children}</SortableContext>
}

/** Atalho de teclado do reordenamento: Alt+↑/↓ no item focado. */
export function moveKey(event: KeyboardEvent, onMove: (delta: number) => void) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  event.stopPropagation()
  onMove(event.key === 'ArrowUp' ? -1 : 1)
}

export function useSortableStyle(id: string, data: SortableData, disabled?: { draggable: boolean; droppable: boolean }) {
  const sortable = useSortable({ id, data, disabled })
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition, touchAction: 'manipulation', ...(sortable.isDragging ? { position: 'relative', zIndex: 10, opacity: 0.85 } : {}) }
  return { ...sortable, style }
}

/** Linha arrastável: o conteúdo continua sendo os botões de sempre; o atalho Alt+↑/↓ sobe dos botões focados. */
export function SortableRow({ id, data, onMove, children }: { id: string; data: SortableData; onMove: (delta: number) => void; children: ReactNode }) {
  const { setNodeRef, listeners, style } = useSortableStyle(id, data)
  return <div ref={setNodeRef} style={style} {...listeners} onKeyDown={event => moveKey(event, onMove)}>{children}</div>
}
