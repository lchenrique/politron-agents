import { describe, expect, it } from 'vitest'
import { applyOrder, mergeSubset, moveTo, placeProject } from './sidebarOrder'

const self = (id: string) => id

describe('ordem manual do sidebar', () => {
  it('aplica a ordem salva e põe itens novos no topo', () => {
    expect(applyOrder(['a', 'b', 'c', 'novo'], ['c', 'a', 'b', 'apagado'], self)).toEqual(['novo', 'c', 'a', 'b'])
    expect(applyOrder(['b', 'a'], [], self)).toEqual(['b', 'a'])
  })

  it('move para cima e para baixo, sem passar das pontas', () => {
    expect(moveTo(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(moveTo(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'c', 'b'])
    expect(moveTo(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(moveTo(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(moveTo(['a', 'b', 'c'], 'c', 3)).toBeNull()
  })

  it('reordena um subconjunto sem tirar os demais do lugar', () => {
    expect(mergeSubset(['a', 'x', 'b', 'y', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'x', 'a', 'y', 'b'])
    expect(mergeSubset(['a', 'x'], ['novo', 'a'])).toEqual(['novo', 'a', 'x'])
  })

  it('move projetos entre pastas e dentro da mesma pasta', () => {
    const containers = { groups: [{ name: 'Clientes', workspaceIds: ['a', 'b'] }, { name: 'Pessoal', workspaceIds: ['c'] }], ungrouped: ['d', 'e'] }
    expect(placeProject(containers, 'a', 'Pessoal', 0)).toEqual({ groups: [{ name: 'Clientes', workspaceIds: ['b'] }, { name: 'Pessoal', workspaceIds: ['a', 'c'] }], projectOrder: ['d', 'e'] })
    expect(placeProject(containers, 'c', null, 1)).toEqual({ groups: [{ name: 'Clientes', workspaceIds: ['a', 'b'] }, { name: 'Pessoal', workspaceIds: [] }], projectOrder: ['d', 'c', 'e'] })
    expect(placeProject(containers, 'a', 'Clientes', 1).groups[0].workspaceIds).toEqual(['b', 'a'])
  })
})
