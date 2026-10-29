import { describe, expect, it } from 'vitest'
import type { Message } from '../../../../shared/v9'
import { buildTurns, endsWithReply, finalReply, foldsAway, turnFoldable, turnHeaderText } from './turns'
import { activityToolCall, formatRunDuration, liveStep, processTitle, stepActivity } from './tool-call'

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 28, 12, 0, seconds)).toISOString()
const base = { conversationId: 'c', runId: 'run-1', createdAt: at(0) }
const user = (id: string, seconds = 0, extra: Partial<Message> = {}): Message => ({ ...base, id, agentId: null, author: 'Você', role: 'user', text: `Pedido ${id}`, status: 'completed', runId: null, createdAt: at(seconds), ...extra })
const reply = (id: string, text: string, seconds: number, extra: Partial<Message> = {}): Message => ({ ...base, id, agentId: 'lyra', author: 'Lyra', role: 'assistant', text, status: 'completed', createdAt: at(seconds), ...extra })
const activity = (id: string, text: string, seconds: number, extra: Partial<Message> = {}): Message => ({ ...base, id, agentId: 'lyra', author: 'Lyra', role: 'activity', text, status: 'completed', createdAt: at(seconds), ...extra })

describe('agrupamento em turnos', () => {
  it('um turno vai da mensagem do usuário até a próxima, com ferramentas seguidas num grupo', () => {
    const turns = buildTurns([
      user('u1'), reply('pre', 'Vou olhar.', 1), activity('a1', 'Leitura · a.ts', 2), activity('a2', 'Terminal · ls', 3), reply('fim', 'Pronto.', 5),
      user('u2', 10), reply('r2', 'Oi.', 11),
    ])
    expect(turns.map(turn => turn.user?.id)).toEqual(['u1', 'u2'])
    expect(turns[0]!.items.map(item => item.kind)).toEqual(['reply', 'tools', 'reply'])
    expect(turns[0]!.toolCount).toBe(2)
    expect(turns[0]!.messageIds).toEqual(['u1', 'pre', 'a1', 'a2', 'fim'])
  })

  it('mensagens antes do primeiro pedido formam um turno sem usuário; fila e removidas ficam de fora', () => {
    const turns = buildTurns([reply('solto', 'Aviso.', 0), user('u1', 1), user('fila', 2, { status: 'queued' }), user('fora', 3, { status: 'cancelled' })])
    expect(turns.map(turn => turn.user?.id ?? null)).toEqual([null, 'u1'])
  })

  it('separa raciocínio, delegações e notas sem run', () => {
    const origin = activity('d1', 'Pedido para Mimir: revisar', 2, { runId: null, delegationId: 'del', relatedConversationId: 'child', delegationTask: 'revisar', agentId: 'mimir', author: 'Mimir', status: 'running' })
    const turns = buildTurns([user('u1'), activity('r', 'Raciocínio', 1, { tool: { name: 'reasoning', output: 'pensando', status: 'completed', startedAt: at(1) } }), activity('ask', 'Delegação · Mimir', 2), origin, activity('n', 'Missão retomada', 3, { runId: null })])
    expect(turns[0]!.items.map(item => item.kind)).toEqual(['reasoning', 'delegations', 'note'])
    expect(turns[0]!.toolCount).toBe(0)
    // Delegação ativa não recolhe com o turno.
    expect(foldsAway(turns[0]!.items[1]!)).toBe(false)
  })

  it('cabeçalho do Boo no primeiro bloco de cada resposta e a cada troca de autor', () => {
    const turns = buildTurns([user('u1'), reply('a', 'Um.', 1), activity('t', 'Terminal · ls', 2), reply('b', 'Dois.', 3), reply('c', 'Três.', 4, { agentId: 'atlas', author: 'Atlas' }), reply('d', '', 5, { agentId: 'lyra' })])
    const boos = turns[0]!.items.flatMap(item => item.kind === 'reply' ? [[item.message.id, item.boo]] : [])
    expect(boos).toEqual([['a', true], ['b', false], ['c', true]])
  })
})

describe('estado e cabeçalho do turno', () => {
  it('enquanto roda não há cabeçalho; concluído mostra duração e número de ferramentas', () => {
    const running = buildTurns([user('u1'), activity('a1', 'Terminal · ls', 2), reply('r', '', 3, { status: 'running' })])[0]!
    expect(running.status).toBe('running')
    expect(turnHeaderText(running)).toBeNull()
    const done = buildTurns([user('u1'), activity('a1', 'Terminal · ls', 2), reply('r', 'Fim.', 3, { finishedAt: at(83) })])[0]!
    expect(turnHeaderText(done)).toBe('Concluído em 1min 23s · 1 ferramenta')
    expect(turnFoldable(done)).toBe(true)
  })

  it('usa o fim da ferramenta quando a resposta não registrou finishedAt e no mínimo 1 s', () => {
    const turn = buildTurns([user('u1'), activity('a1', 'Leitura · a', 0, { tool: { name: 'workspace_read', status: 'completed', startedAt: at(0), finishedAt: at(57) } }), activity('a2', 'Leitura · b', 1)])[0]!
    expect(turnHeaderText(turn)).toBe('Concluído em 57s · 2 ferramentas')
    expect(turnHeaderText(buildTurns([user('u1'), reply('r', 'Oi', 0)])[0]!)).toBe('Concluído em 1s')
  })

  it('falha e interrupção substituem a duração e não recolhem', () => {
    const failed = buildTurns([user('u1'), activity('a', 'Terminal · ls', 1), reply('r', 'Erro', 2, { status: 'failed' })])[0]!
    expect(turnHeaderText(failed)).toBe('Falhou · 1 ferramenta')
    expect(turnFoldable(failed)).toBe(false)
    const stopped = buildTurns([user('u1'), reply('r', '', 2, { status: 'interrupted' })])[0]!
    expect(turnHeaderText(stopped)).toBe('Interrompido')
    expect(buildTurns([user('u1'), reply('r', 'Aprova?', 2, { status: 'waiting' })])[0]!.status).toBe('waiting')
    // Turno só com a pergunta: nada para resumir.
    expect(turnHeaderText(buildTurns([user('u1')])[0]!)).toBeNull()
  })

  it('rodapé: última resposta com texto e se o turno termina nela', () => {
    const turn = buildTurns([user('u1'), reply('a', 'Primeira', 1), activity('t', 'Terminal · ls', 2), reply('b', 'Final', 3), reply('vazia', '', 4)])[0]!
    expect(finalReply(turn)?.id).toBe('b')
    expect(endsWithReply(turn)).toBe(true)
    expect(endsWithReply(buildTurns([user('u1'), reply('a', 'Antes', 1), activity('t', 'Terminal · ls', 2)])[0]!)).toBe(false)
  })
})

describe('chamadas de ferramenta para as linhas do DSH', () => {
  it('estruturada: terminal com comando, saída sem rodapé e código de saída', () => {
    const message = activity('a', 'Terminal · node --version', 0, { tool: { name: 'workspace_run_command', args: JSON.stringify({ command: 'node --version' }), output: 'v24.1.0\nCódigo de saída: 0.\nEvidência: e1', status: 'completed', startedAt: at(0), finishedAt: at(2), exitCode: 0 } })
    const call = activityToolCall(message, false)
    expect(call).toMatchObject({ kind: 'bash', state: 'success', durationMs: 2000, terminal: { command: 'node --version', output: 'v24.1.0', exitCode: 0 } })
    expect(stepActivity(call, message)).toBe('commands')
    expect(liveStep(call, 'commands')).toBe('Executando comandos · node --version')
  })

  it('estruturada: leitura numerada, listagem como caminhos, falha com a primeira linha do erro', () => {
    const read = activityToolCall(activity('r', 'Leitura · a.ts', 0, { tool: { name: 'workspace_read', path: 'a.ts', output: 'um\ndois', status: 'completed', startedAt: at(0) } }), false)
    expect(read).toMatchObject({ kind: 'read', path: 'a.ts', read: { totalLines: 2, lines: [{ number: 1, text: 'um' }, { number: 2, text: 'dois' }] } })
    const list = activityToolCall(activity('l', 'Leitura · .', 0, { tool: { name: 'workspace_list', path: '.', output: JSON.stringify([{ name: 'src', type: 'directory' }, { name: 'a.ts', type: 'file' }]), status: 'completed', startedAt: at(0) } }), false)
    expect(list.search).toEqual({ kind: 'paths', paths: ['src/', 'a.ts'], total: 2, truncated: false })
    const failed = activityToolCall(activity('f', 'Leitura · x', 0, { tool: { name: 'workspace_read', output: 'ENOENT: não existe\nstack', status: 'failed', startedAt: at(0) } }), false)
    expect(failed).toMatchObject({ state: 'error', errorSummary: 'ENOENT: não existe' })
  })

  it('chamada que ficou rodando: em execução no turno ativo, interrompida depois', () => {
    const message = activity('a', 'Terminal · sleep 9', 0, { tool: { name: 'workspace_run_command', status: 'running', startedAt: at(0) } })
    expect(activityToolCall(message, true).state).toBe('running')
    expect(activityToolCall(message, false).state).toBe('interrupted')
  })

  it('histórico antigo: lê "Categoria · detalhe"', () => {
    expect(activityToolCall(activity('t', 'Terminal · npm test', 0), false)).toMatchObject({ kind: 'bash', state: 'success', terminal: { command: 'npm test' } })
    expect(activityToolCall(activity('r', 'Leitura · src/a.ts', 0), false)).toMatchObject({ kind: 'read', path: 'src/a.ts', summary: 'src/a.ts' })
    expect(activityToolCall(activity('e', 'Edição · b.ts', 0), false)).toMatchObject({ kind: 'write', path: 'b.ts' })
    expect(activityToolCall(activity('n', 'Navegador real · js · alvo https://example.com/\nawait tab.goto(1)', 0), false)).toMatchObject({ kind: 'code', title: 'Navegador real', summary: 'js · alvo https://example.com/', input: 'await tab.goto(1)' })
    expect(activityToolCall(activity('g', 'Ferramenta · group_members', 0), false)).toMatchObject({ kind: 'generic', title: 'Ferramenta', summary: 'group_members' })
  })
})

describe('textos do DSH em PT-BR', () => {
  it('duração e títulos de grupo', () => {
    expect(formatRunDuration(57_400)).toBe('57s')
    expect(formatRunDuration(83_000)).toBe('1min 23s')
    expect(formatRunDuration(3_723_000)).toBe('1h 2min 3s')
    expect(processTitle(['commands'])).toBe('Executou comandos')
    expect(processTitle(['search', 'commands', 'search'])).toBe('Buscou e executou comandos')
    expect(processTitle(['read', 'search', 'commands', 'edit'])).toBe('Leu arquivos, buscou, executou comandos etc.')
    expect(processTitle([])).toBe('Analisou o pedido')
  })
})
