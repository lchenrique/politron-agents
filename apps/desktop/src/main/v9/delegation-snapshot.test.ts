import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './store'
import type { Delegation, Message } from '../../shared/v9'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('vínculo de delegação no snapshot', () => {
  it('marca a conversa privada com a conversa que delegou, sem gravar o campo', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-delegation-snapshot-'))
    dirs.push(directory)
    const store = new WorkspaceStore(directory)
    try {
      const parent = store.saveConversation({ name: 'Chief' })
      const child = store.saveConversation({ name: 'Examen · revisar login', workspaceId: parent.workspaceId })
      const now = new Date().toISOString()
      store.putDelegation({ id: 'd1', idempotencyKey: 'k1', rootRunId: 'r', parentRunId: 'r', childRunId: 'c', requesterAgentId: 'a', recipientAgentId: 'b', sourceConversationId: parent.id, targetConversationId: child.id, sourceMessageId: 'm1', requestMessageId: 'm2', resultMessageId: 'm3', task: 'revisar login', status: 'completed', result: '', error: '', createdAt: now, updatedAt: now } satisfies Delegation)
      const conversations = store.snapshot().conversations
      expect(conversations.find(item => item.id === child.id)?.parentConversationId).toBe(parent.id)
      expect(conversations.find(item => item.id === parent.id)?.parentConversationId).toBeUndefined()
      expect(store.conversation(child.id).parentConversationId).toBeUndefined()
    } finally { store.db.close() }
  })

  it('traz a prévia da última fala com texto e o primeiro pedido, ignorando atividades e respostas vazias', () => {
    const directory = mkdtempSync(join(tmpdir(), 'politron-preview-snapshot-'))
    dirs.push(directory)
    const store = new WorkspaceStore(directory)
    try {
      const conversation = store.saveConversation({ name: 'Chief' })
      const empty = store.saveConversation({ name: 'Vazia', workspaceId: conversation.workspaceId })
      const put = (id: string, role: Message['role'], text: string) => store.putMessage({ id, conversationId: conversation.id, agentId: null, author: 'x', role, text, status: 'completed', runId: null, createdAt: new Date().toISOString() })
      put('m1', 'user', 'oi')
      put('m2', 'assistant', 'Oi! Como posso ajudar?')
      put('m3', 'user', 'revisa o login')
      put('m4', 'activity', 'Leitura · login.ts')
      put('m5', 'assistant', '  ')
      const conversations = store.snapshot().conversations
      const item = conversations.find(entry => entry.id === conversation.id)
      expect(item?.preview).toBe('revisa o login')
      expect(item?.firstPrompt).toBe('oi')
      expect(item?.previewFailed).toBeUndefined()
      expect(conversations.find(entry => entry.id === empty.id)?.preview).toBeUndefined()
      store.putMessage({ id: 'm6', conversationId: conversation.id, agentId: null, author: 'x', role: 'assistant', text: 'Failed to authenticate', status: 'failed', runId: null, createdAt: new Date().toISOString() })
      expect(store.snapshot().conversations.find(entry => entry.id === conversation.id)).toMatchObject({ preview: 'Failed to authenticate', previewFailed: true })
    } finally { store.db.close() }
  })
})
