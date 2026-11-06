import { describe, expect, it } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { DELEGATION_TOOL, NOTE_TOOL, projectTurns } from './assistant-ui-adapter'
import { buildTurns } from './turns'

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 4, 12, 0, seconds)).toISOString()
const message = (overrides: Partial<Message>): Message => ({
  id: 'message-1', conversationId: 'conversation-1', agentId: 'agent-1', author: 'Boo',
  role: 'assistant', text: 'resposta', status: 'completed', runId: 'run-1', createdAt: at(0),
  ...overrides,
})
const project = (messages: Message[]) => projectTurns(buildTurns(messages))

describe('adapter V1 para assistant-ui (um turno = usuário + uma mensagem assistant)', () => {
  const user = message({ id: 'u1', role: 'user', author: 'Carlos', text: 'Olá', runId: null })

  it('projeta usuário e turno com id estável e partes na ordem cronológica do V1', () => {
    const tool = message({ id: 't1', role: 'activity', text: 'Leitura · README.md', createdAt: at(2), tool: { name: 'workspace_read', args: '{"path":"README.md"}', output: 'conteúdo', status: 'completed', startedAt: at(2), finishedAt: at(3) } })
    const reasoning = message({ id: 'r1', role: 'activity', text: 'Raciocínio', createdAt: at(4), tool: { name: 'reasoning', output: 'pensando', status: 'completed', startedAt: at(4) } })
    const origin = message({ id: 'd1', role: 'activity', text: 'Pedido para Mimir: revisar', createdAt: at(5), runId: null, delegationId: 'del', relatedConversationId: 'child', delegationTask: 'revisar', status: 'running' })
    const note = message({ id: 'n1', role: 'activity', text: 'Missão retomada', createdAt: at(6), runId: null })
    const result = project([user, message({ id: 'a1', text: 'Vou ler.', createdAt: at(1) }), tool, reasoning, origin, note, message({ id: 'a2', text: 'Pronto.', createdAt: at(7) })])
    expect(result.map(item => [item.id, item.role])).toEqual([['u1', 'user'], ['turn:u1', 'assistant']])
    expect(result[0]).toMatchObject({ content: 'Olá', createdAt: new Date(at(0)) })
    const parts = (result[1]!.content as { type: string; toolName?: string }[]).map(part => part.type === 'tool-call' ? part.toolName : part.type)
    expect(parts).toEqual(['text', 'workspace_read', 'reasoning', DELEGATION_TOOL, NOTE_TOOL, 'text'])
    expect(result[1]!.content[1]).toMatchObject({ toolCallId: 't1', argsText: '{"path":"README.md"}', result: 'conteúdo', isError: false })
    // Delegação ainda ativa não tem resultado; a do texto final carrega o id da mensagem V1.
    expect(result[1]!.content[3]).toMatchObject({ toolCallId: 'd1', isPreliminary: true })
    expect(result[1]!.content[5]).toMatchObject({ type: 'text', parentId: 'a2', text: 'Pronto.' })
  })

  it('o status do turno vem do V1: rodando, concluído, falho e interrompido', () => {
    const status = (reply: Message['status']) => project([user, message({ id: 'a1', status: reply })])[1]!.status
    expect(status('running')).toEqual({ type: 'running' })
    expect(status('waiting')).toEqual({ type: 'running' })
    expect(status('completed')).toEqual({ type: 'complete', reason: 'stop' })
    expect(status('failed')).toMatchObject({ type: 'incomplete', reason: 'error' })
    expect(status('interrupted')).toMatchObject({ type: 'incomplete', reason: 'cancelled' })
    // Ferramenta em execução também mantém o turno rodando.
    const running = message({ id: 't1', role: 'activity', text: 'Terminal · npm test', tool: { name: 'workspace_run_command', args: '{}', status: 'running', startedAt: at(1) } })
    expect(project([user, running])[1]!.status).toEqual({ type: 'running' })
    expect(project([user, running])[1]!.content[0]).toMatchObject({ isPreliminary: true })
  })

  it('o id do turno não muda com o streaming nem quando chegam mensagens anteriores', () => {
    const first = project([user, message({ id: 'a1', text: 'Par', status: 'running' })])
    const next = project([user, message({ id: 'a1', text: 'Parcial completo', status: 'running' })])
    expect(next[1]!.id).toBe(first[1]!.id)
    const older = [message({ id: 'u0', role: 'user', text: 'Antes', runId: null, createdAt: at(-10) }), message({ id: 'a0', text: 'Resposta antiga', createdAt: at(-9) })]
    expect(project([...older, user, message({ id: 'a1' })]).map(item => item.id)).toEqual(['u0', 'turn:u0', 'u1', 'turn:u1'])
  })

  it('atividade antiga sem payload estruturado vira tool-call renderizável e falha marca isError', () => {
    const legacy = project([user, message({ id: 't1', role: 'activity', text: 'Busca · indexando arquivos', tool: undefined })])[1]!
    expect(legacy.content[0]).toMatchObject({ type: 'tool-call', toolName: 'activity', toolCallId: 't1', argsText: 'Busca · indexando arquivos' })
    const failed = project([user, message({ id: 't2', role: 'activity', text: 'Terminal · x', tool: { name: 'workspace_run_command', status: 'failed', output: 'erro', startedAt: at(1) } })])[1]!
    expect(failed.content[0]).toMatchObject({ isError: true, result: 'erro' })
  })

  it('reaproveita a projeção dos turnos cujas mensagens não mudaram', () => {
    const cache = new Map()
    const stable = [user, message({ id: 'a1' })]
    const first = projectTurns(buildTurns([...stable, message({ id: 'u2', role: 'user', text: 'Outra', runId: null, createdAt: at(10) }), message({ id: 'a2', text: 'Par', status: 'running', createdAt: at(11) })]), cache)
    const next = projectTurns(buildTurns([...stable, message({ id: 'u2', role: 'user', text: 'Outra', runId: null, createdAt: at(10) }), message({ id: 'a2', text: 'Parcial', status: 'running', createdAt: at(11) })]), cache)
    expect(next[0]).toBe(first[0])
    expect(next[1]).toBe(first[1])
    expect(next[3]).not.toBe(first[3])
  })

  it('mensagens vazias concluídas, na fila ou removidas da fila não geram partes nem mensagens', () => {
    const result = project([user, message({ id: 'vazia', text: '' }), message({ id: 'fila', role: 'user', status: 'queued', runId: null }), message({ id: 'fora', role: 'user', status: 'cancelled', runId: null })])
    expect(result.map(item => item.id)).toEqual(['u1'])
  })
})
