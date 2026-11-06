import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { MessageList } from './MessageList'

const turnsOf = (count: number): Message[] => Array.from({ length: count }, (_, index): Message[] => [
  { id: `u${index}`, conversationId: 'chat', agentId: null, author: 'Você', role: 'user', text: `Pergunta ${index}`, status: 'completed', runId: null, createdAt: '' },
  { id: `t${index}`, conversationId: 'chat', agentId: 'boo', author: 'Boo', role: 'activity', text: 'Terminal · ls', status: 'completed', runId: `run-${index}`, createdAt: '', tool: { name: 'workspace_run_command', args: '{"command":"ls"}', status: 'completed', output: 'ok', startedAt: '' } },
  { id: `a${index}`, conversationId: 'chat', agentId: 'boo', author: 'Boo', role: 'assistant', text: `Resposta **${index}**`, status: 'completed', runId: `run-${index}`, createdAt: '' },
]).flat()

const props = { fileChanges: [], approvals: [], conversations: [], agentOf: () => undefined, onOpenRelatedConversation: vi.fn(), onNotice: vi.fn() }

it('mostra todos os turnos de um histórico longo e o streaming não remonta os anteriores', () => {
  const history = turnsOf(300)
  const streaming = (text: string): Message => ({ id: 'live', conversationId: 'chat', agentId: 'boo', author: 'Boo', role: 'assistant', text, status: 'running', runId: 'run-live', createdAt: '' })
  const started = performance.now()
  const { container, rerender } = render(<MessageList messages={[...history, streaming('Começando')]} {...props} />)
  expect(performance.now() - started).toBeLessThan(15_000)
  // 300 turnos; a resposta em streaming pertence ao último deles.
  expect(container.querySelectorAll('[data-turn-start]')).toHaveLength(300)
  const first = container.querySelector('[data-message-id="a0"]')!
  const last = container.querySelector('[data-message-id="a299"]')!
  expect(last).toBeInTheDocument()

  const update = performance.now()
  for (let step = 0; step < 5; step++) rerender(<MessageList messages={[...history, streaming('Começando '.repeat(step + 2))]} {...props} />)
  expect((performance.now() - update) / 5).toBeLessThan(2_000)
  expect(container.querySelector('[data-message-id="a0"]')).toBe(first)
  expect(container.querySelector('[data-message-id="a299"]')).toBe(last)
}, 60_000)
