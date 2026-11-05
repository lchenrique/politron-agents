import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, applyOutcome, createDelegation, needsNotice, notificationText, pending, prune, taskPrompt, textOf, MAX_DELEGATIONS, MAX_SUMMARY } from './delegations.js'

const ev = (seq, type, data) => ({ seq, type, data })
const say = text => ({ content: [{ type: 'text', text }] })
const turn = (reason, texts = ['Feito.']) => [
  ev(1, 'user/message', say('tarefa')), ev(2, 'turn/start', { turn: 1 }),
  ...texts.map((text, index) => ev(3 + index, 'assistant/message', { message: say(text) })),
  ev(10, 'turn/end', { turn: 1, reason }),
]
const base = () => createDelegation({ agentId: 'a', handle: 'dev', name: 'Dev', workspaceId: 'w', projectTitle: 'bubbledesk', sessionId: 'S1', originSessionId: 'O1', task: 'Corrigir o login' })

test('sem turno concluído, ou com turno aberto, a delegação está rodando', () => {
  assert.equal(analyze([]).state, 'running')
  assert.equal(analyze(undefined).state, 'running')
  assert.equal(analyze([ev(1, 'user/message', say('x'))]).state, 'running')
  assert.equal(analyze([ev(1, 'turn/start', {}), ev(2, 'assistant/message', { message: say('meio') })]).state, 'running')
})

test('turno concluído: done, com a última resposta do Boo como resumo', () => {
  const out = analyze(turn({ kind: 'completed' }, ['Vou ver.', 'Corrigi o login em auth.ts.']))
  assert.deepEqual([out.state, out.summary], ['done', 'Corrigi o login em auth.ts.'])
})

test('erro, aborto e limite viram failed com motivo; blocked espera o usuário', () => {
  assert.deepEqual(analyze(turn({ kind: 'error', error: { message: 'cota estourou' } })).error, 'cota estourou')
  assert.equal(analyze(turn({ kind: 'aborted', reason: { kind: 'user' } })).state, 'failed')
  assert.match(analyze(turn({ kind: 'max-tokens' })).error, /max-tokens/)
  assert.equal(analyze(turn({ kind: 'blocked' })).state, 'blocked')
})

test('segundo turno aberto (o usuário continuou a conversa) volta a rodando', () => {
  const events = [...turn({ kind: 'completed' }), ev(11, 'turn/start', { turn: 2 })]
  assert.equal(analyze(events).state, 'running')
})

test('resumo é limitado e textOf junta só blocos de texto', () => {
  assert.equal(analyze(turn({ kind: 'completed' }, ['x'.repeat(MAX_SUMMARY + 500)])).summary.length, MAX_SUMMARY)
  assert.equal(textOf({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(textOf(undefined), '')
})

test('notificação identifica Boo, projeto, sessão e resultado, e avisa que é automática', () => {
  const text = notificationText(base(), analyze(turn({ kind: 'completed' }, ['Pronto, login corrigido.'])))
  assert.match(text, /DELEGAÇÃO CONCLUÍDA — mensagem automática do Boobot, não é do usuário/)
  assert.match(text, /Boo: Dev \(dev\) \| Projeto: bubbledesk \| Conversa do Boo: S1/)
  assert.match(text, /Tarefa delegada: Corrigir o login/)
  assert.match(text, /Resultado:\nPronto, login corrigido\./)
  assert.match(notificationText(base(), analyze(turn({ kind: 'error', error: { message: 'x' } }))), /DELEGAÇÃO FALHOU[\s\S]*Motivo: x/)
  assert.match(notificationText(base(), analyze(turn({ kind: 'blocked' }, []))), /PRECISA DE VOCÊ[\s\S]*não deixou um resumo/)
})

test('prompt da tarefa cita quem delegou, a pasta e como devolver o resultado', () => {
  const text = taskPrompt({ chiefName: 'Chief', project: { title: 'bubbledesk', path: 'D:/p/bubbledesk' }, task: 'Corrigir o login' })
  assert.match(text, /Tarefa delegada por Chief/)
  assert.match(text, /D:\/p\/bubbledesk/)
  assert.match(text, /Corrigir o login/)
  assert.match(text, /entregue ao Chief automaticamente/)
})

test('criar exige tarefa; aplicar resultado não reabre estados finais e blocked não finaliza', () => {
  assert.throws(() => createDelegation({ task: '  ' }), /Informe a tarefa/)
  assert.throws(() => createDelegation({ task: 'x'.repeat(4001) }), /passa de 4000/)
  const running = base()
  assert.equal(applyOutcome(running, { state: 'running' }), running)
  const blocked = applyOutcome(running, analyze(turn({ kind: 'blocked' })))
  assert.deepEqual([blocked.status, blocked.finishedAt], ['blocked', null])
  const done = applyOutcome(blocked, analyze(turn({ kind: 'completed' }, ['ok'])), '2026-01-01T00:00:00.000Z')
  assert.deepEqual([done.status, done.summary, done.finishedAt], ['done', 'ok', '2026-01-01T00:00:00.000Z'])
  assert.equal(applyOutcome(done, analyze(turn({ kind: 'error', error: {} }))), done)
})

test('prune descarta as concluídas mais antigas e nunca as em andamento; pending lista o que falta avisar', () => {
  const make = (i, status) => ({ ...base(), id: `d${i}`, status, startedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(Math.floor(i / 60)).padStart(3, '0')}Z` })
  const list = [make(0, 'running'), ...Array.from({ length: MAX_DELEGATIONS + 5 }, (_, i) => make(i + 1, 'done'))]
  const pruned = prune(list)
  assert.equal(pruned.length, MAX_DELEGATIONS)
  assert.ok(pruned.some(item => item.id === 'd0'))
  assert.equal(prune(list.slice(0, 3)).length, 3)
  const waiting = [{ ...base(), status: 'running' }, { ...base(), status: 'done', notified: null }, { ...base(), status: 'done', notified: 'done' }, { ...base(), status: 'done', notified: null, originSessionId: null }]
  assert.equal(pending(waiting).length, 2)
  assert.equal(needsNotice({ ...base(), status: 'done', notified: 'blocked' }), true)
  assert.equal(needsNotice({ ...base(), status: 'blocked', notified: 'blocked' }), false)
})
