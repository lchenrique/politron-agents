import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './store'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function storeInTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'politron-livre-'))
  dirs.push(directory)
  return { store: new WorkspaceStore(directory), directory }
}

describe('sessões no workspace Livre', () => {
  it('compartilha o workspace Livre sem misturar IDs dos históricos', () => {
    const { store } = storeInTemporaryDirectory()
    try {
      const first = store.saveConversation({})
      const second = store.saveConversation({})
      expect(first.id).not.toBe(second.id)
      expect(first.workspaceId).toBe(second.workspaceId)
      expect(store.workspace(first.workspaceId)).toMatchObject({ name: 'Livre', kind: 'free' })
      expect(store.workspaces().filter(item => item.name === 'Livre')).toHaveLength(1)
    } finally { store.db.close() }
  })

  it('mostra Livre após reiniciar sem alterar o diretório ou contexto de sessões antigas', () => {
    const { store, directory } = storeInTemporaryDirectory()
    const legacy = store.saveWorkspace({ name: '' })
    const conversation = store.saveConversation({ workspaceId: legacy.id })
    const originalPath = legacy.path
    store.db.close()
    const reopened = new WorkspaceStore(directory)
    try {
      expect(reopened.workspaces().some(item => item.name === 'Livre' && item.kind === 'free')).toBe(true)
      expect(reopened.conversation(conversation.id).workspaceId).toBe(legacy.id)
      expect(reopened.workspace(legacy.id).path).toBe(originalPath)
    } finally { reopened.db.close() }
  })
})
