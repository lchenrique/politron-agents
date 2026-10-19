import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './store'

const dirs: string[] = []
const stores: WorkspaceStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'politron-leader-'))
  dirs.push(dir)
  const store = new WorkspaceStore(dir)
  stores.push(store)
  const alice = store.saveAgent({ name: 'Alice', alias: 'alice', instructions: 'x' })
  const beto = store.saveAgent({ name: 'Beto', alias: 'beto', instructions: 'x' })
  return { store, alice, beto }
}

describe('líder do grupo', () => {
  it('conversa nova usa líder por padrão e escolhe o primeiro participante', () => {
    const { store, alice, beto } = setup()
    const conversation = store.saveConversation({ agentIds: [alice.id, beto.id], kind: 'group', name: 'Equipe' })
    expect(conversation.responseMode).toBe('leader')
    expect(conversation.leaderAgentId).toBe(alice.id)
  })

  it('interpreta conversas antigas sem configuração como líder único sem alterar o registro original', () => {
    const { store, alice, beto } = setup()
    const conversation = store.saveConversation({ agentIds: [alice.id, beto.id], kind: 'group', name: 'Equipe' })
    store.db.prepare('UPDATE v9_conversations SET data=? WHERE id=?').run(JSON.stringify({ ...conversation, responseMode: undefined, leaderAgentId: undefined }), conversation.id)
    const loaded = store.conversation(conversation.id)
    expect(loaded.responseMode).toBe('leader')
    expect(loaded.leaderAgentId).toBe(alice.id)
  })

  it('persiste o líder escolhido e recupera após reabrir', () => {
    const { store, alice, beto } = setup()
    const conversation = store.saveConversation({ agentIds: [alice.id, beto.id], kind: 'group', name: 'Equipe', responseMode: 'leader', leaderAgentId: beto.id })
    expect(conversation.leaderAgentId).toBe(beto.id)
    const dataDirectory = store.dataDirectory
    store.close()
    stores.pop()
    const reopened = new WorkspaceStore(dataDirectory)
    stores.push(reopened)
    expect(reopened.conversation(conversation.id).leaderAgentId).toBe(beto.id)
  })

  it('recusa líder que não participa da conversa', () => {
    const { store, alice, beto } = setup()
    expect(() => store.saveConversation({ agentIds: [alice.id], kind: 'group', name: 'Equipe', responseMode: 'leader', leaderAgentId: beto.id })).toThrow(/líder que participe/)
  })

  it('não precisa repetir o modo a cada alteração: salvar de novo sem mexer no líder mantém como estava', () => {
    const { store, alice, beto } = setup()
    const conversation = store.saveConversation({ agentIds: [alice.id, beto.id], kind: 'group', name: 'Equipe', responseMode: 'leader', leaderAgentId: beto.id })
    const updated = store.saveConversation({ id: conversation.id, agentIds: [alice.id, beto.id] })
    expect(updated.leaderAgentId).toBe(beto.id)
    expect(updated.responseMode).toBe('leader')
  })
})
