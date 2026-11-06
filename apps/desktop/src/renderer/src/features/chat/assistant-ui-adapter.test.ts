import { describe, expect, it } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { toAssistantThreadMessage } from './assistant-ui-adapter'

const message = (overrides: Partial<Message>): Message => ({
  id: 'message-1', conversationId: 'conversation-1', agentId: 'agent-1', author: 'Boo',
  role: 'assistant', text: 'resposta', status: 'completed', runId: 'run-1', createdAt: '2026-11-04T12:00:00.000Z',
  ...overrides,
})

describe('adapter V1 para assistant-ui', () => {
  it('preserva identidade, horário e texto sem tomar posse do histórico', () => {
    expect(toAssistantThreadMessage(message({ role: 'user', author: 'Carlos', text: 'Olá' }))).toEqual({
      id: 'message-1', role: 'user', content: 'Olá', createdAt: new Date('2026-11-04T12:00:00.000Z'),
      metadata: { runId: 'run-1' },
    })
  })

  it('representa atividade estruturada como tool-call de leitura, sem executar ferramentas', () => {
    expect(toAssistantThreadMessage(message({
      role: 'activity', text: 'Lendo arquivo', tool: {
        name: 'read_file', args: '{"path":"README.md"}', output: 'conteúdo redigido', status: 'completed',
        startedAt: '2026-11-04T12:00:00.000Z', finishedAt: '2026-11-04T12:00:01.000Z', exitCode: 0,
      },
    }))).toEqual({
      id: 'message-1', role: 'assistant', createdAt: new Date('2026-11-04T12:00:00.000Z'),
      metadata: { runId: 'run-1' },
      content: [{
        type: 'tool-call', toolCallId: 'message-1', toolName: 'read_file', argsText: '{"path":"README.md"}',
        result: 'conteúdo redigido', isError: false,
      }],
    })
  })

  it('mantém atividades históricas sem payload estruturado renderizáveis como tool-call', () => {
    expect(toAssistantThreadMessage(message({ role: 'activity', text: 'Busca · indexando arquivos', tool: undefined }))).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool-call', toolName: 'activity', argsText: 'Busca · indexando arquivos', toolCallId: 'message-1' }],
    })
  })
})
