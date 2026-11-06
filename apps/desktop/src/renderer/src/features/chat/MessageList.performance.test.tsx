import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { MessageList } from '@/test/runtime-message-list'

it('monta somente a janela visível de um histórico com 5.000 mensagens', () => {
  const messages: Message[] = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), conversationId: 'chat', agentId: null, author: 'Você', role: 'user', text: `Mensagem ${index}`, status: 'completed', runId: null, createdAt: '' }))
  const { container } = render(<MessageList messages={messages} fileChanges={[]} approvals={[]} conversations={[]} agentOf={() => undefined} selectedAgents={[]} onOpenRelatedConversation={vi.fn()} onNotice={vi.fn()} />)
  expect(container.querySelectorAll('[data-message-id]').length).toBeLessThan(30)
})
