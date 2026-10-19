import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { WorkspaceStore } from './store'
import type { Message } from '../../shared/v9'

it('pagina pela mensagem mais antiga ainda em memória sem pular registros ou cruzar conversas', () => {
  const directory = mkdtempSync(join(tmpdir(), 'politron-history-'))
  const store = new WorkspaceStore(directory)
  try {
    const conversation = store.saveConversation({})
    const other = store.saveConversation({})
    for (let index = 0; index < 350; index++) {
      const message: Message = { id: `m${index}`, conversationId: conversation.id, agentId: null, author: 'Você', role: 'user', text: String(index), status: 'completed', runId: null, createdAt: '' }
      store.putMessage(message)
    }
    const recent = store.historyPage(conversation.id, null, 100)
    expect(recent.messages[0].id).toBe('m250')
    // Simula as primeiras 40 mensagens descartadas durante uso contínuo.
    const previous = store.historyPage(conversation.id, recent.messages[40].id, 100)
    expect(previous.messages[0].id).toBe('m190')
    expect(previous.messages[99].id).toBe('m289')
    expect(previous.hasMore).toBe(true)
    expect(store.historyPage(other.id, recent.messages[40].id).messages).toEqual([])
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }) }
})
