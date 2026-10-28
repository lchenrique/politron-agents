import type { SidebarLayout } from '../../../../shared/v9'

/** Ordem manual: itens fora da ordem salva (novos) entram no topo, na ordem automática em que chegaram. */
export function applyOrder<T>(items: readonly T[], order: readonly string[] | undefined, id: (item: T) => string): T[] {
  if (!order?.length) return [...items]
  const position = new Map(order.map((value, index) => [value, index]))
  const fresh = items.filter(item => !position.has(id(item)))
  const known = items.filter(item => position.has(id(item))).sort((a, b) => position.get(id(a))! - position.get(id(b))!)
  return fresh.concat(known)
}

/** Move um id para o índice informado (mesma semântica do arrayMove). Null quando não há o que mover. */
export function moveTo(ids: readonly string[], id: string, index: number): string[] | null {
  const from = ids.indexOf(id)
  const to = Math.max(0, Math.min(ids.length - 1, index))
  if (from < 0 || from === to) return null
  const next = ids.filter(item => item !== id)
  next.splice(to, 0, id)
  return next
}

/** Reordena um subconjunto (ex.: time do projeto) dentro da ordem completa, mantendo os demais no lugar. */
export function mergeSubset(full: readonly string[], subset: readonly string[]): string[] {
  const members = new Set(subset)
  const base = subset.filter(id => !full.includes(id)).concat(full)
  let next = 0
  return base.map(id => members.has(id) ? subset[next++] : id)
}

export interface ProjectContainers { groups: { name: string; workspaceIds: string[] }[]; ungrouped: string[] }

/** Tira o projeto de onde estiver e o põe na pasta alvo (null = sem pasta) no índice dado. */
export function placeProject(containers: ProjectContainers, id: string, target: string | null, index: number): Pick<SidebarLayout, 'groups' | 'projectOrder'> {
  const insert = (ids: string[]) => { const next = ids.filter(item => item !== id); next.splice(Math.max(0, Math.min(next.length, index)), 0, id); return next }
  const strip = (ids: string[]) => ids.filter(item => item !== id)
  return {
    groups: containers.groups.map(group => ({ name: group.name, workspaceIds: group.name === target ? insert(group.workspaceIds) : strip(group.workspaceIds) })),
    projectOrder: target === null ? insert(containers.ungrouped) : strip(containers.ungrouped)
  }
}
