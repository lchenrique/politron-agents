import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './store'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function openStore() {
  const directory = mkdtempSync(join(tmpdir(), 'politron-sidebar-layout-'))
  dirs.push(directory)
  return { directory, store: new WorkspaceStore(directory) }
}

describe('ordem do sidebar no banco', () => {
  it('começa vazia, mescla campos enviados e sobrevive ao reabrir o banco', () => {
    const { directory, store } = openStore()
    const workspace = store.saveConversation({ name: 'Sessão' }).workspaceId
    try {
      expect(store.sidebarLayout()).toBeNull()
      store.saveSidebarLayout({ projectOrder: ['b', 'a', 'b'], groups: [{ name: ' Clientes ', workspaceIds: ['c'] }] })
      store.saveSidebarLayout({ agentOrder: ['x'], sessionOrder: { [workspace]: ['s2', 's1'], apagado: ['s9'] } })
      expect(store.sidebarLayout()).toEqual({ projectOrder: ['b', 'a'], groups: [{ name: 'Clientes', workspaceIds: ['c'] }], agentOrder: ['x'], sessionOrder: { [workspace]: ['s2', 's1'] } })
    } finally { store.db.close() }
    const reopened = new WorkspaceStore(directory)
    try { expect(reopened.sidebarLayout()?.agentOrder).toEqual(['x']) } finally { reopened.db.close() }
  })

  it('recusa entradas inválidas sem alterar o que foi salvo', () => {
    const { store } = openStore()
    try {
      store.saveSidebarLayout({ agentOrder: ['a'] })
      for (const input of [null, [], { agentOrder: 'a' }, { agentOrder: [1] }, { agentOrder: ['x'.repeat(201)] }, { projectOrder: Array(5001).fill('a') },
        { groups: [{ name: '', workspaceIds: [] }] }, { groups: [{ name: 'A', workspaceIds: [] }, { name: 'A', workspaceIds: [] }] },
        { sessionOrder: [] }, { sessionOrder: JSON.parse('{"__proto__":["a"]}') }])
        expect(() => store.saveSidebarLayout(input), JSON.stringify(input)).toThrow('Ordem do sidebar inválida.')
      expect(store.sidebarLayout()?.agentOrder).toEqual(['a'])
    } finally { store.db.close() }
  })
})
