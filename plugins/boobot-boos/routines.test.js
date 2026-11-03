import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState, normalizeState } from './store.js'
import { parseRoutine, parseRule, scheduleRequest, describeRule, addRoutine, removeRoutine, routinesOf, homeOf, setHome, MAX_ROUTINES_PER_AGENT } from './routines.js'

const zone = 'America/Sao_Paulo'
const input = rule => ({ title: 'Resumo', prompt: 'Faça o resumo', rule })

test('regra diária e semanal: horário HH:mm, fuso padrão e dias de 1 a 7', () => {
  assert.deepEqual(parseRule({ kind: 'daily', time: '09:30' }, zone), { kind: 'daily', time: '09:30', timeZone: zone })
  assert.deepEqual(parseRule({ kind: 'weekly', time: '08:00', weekdays: [5, 1, 1] }, zone).weekdays, [1, 5])
  assert.throws(() => parseRule({ kind: 'daily', time: '9:30' }, zone), /use HH:mm/)
  assert.throws(() => parseRule({ kind: 'daily', time: '24:00' }, zone), /use HH:mm/)
  assert.throws(() => parseRule({ kind: 'weekly', time: '08:00', weekdays: [] }, zone), /Dias da semana/)
  assert.throws(() => parseRule({ kind: 'weekly', time: '08:00', weekdays: [8] }, zone), /Dias da semana/)
  assert.throws(() => parseRule({ kind: 'monthly' }, zone), /Frequência inválida/)
})

test('intervalo e cron: minutos inteiros e expressão obrigatória', () => {
  assert.deepEqual(parseRule({ kind: 'every', minutes: 30 }, zone), { kind: 'every', minutes: 30 })
  assert.throws(() => parseRule({ kind: 'every', minutes: 0 }, zone), /Intervalo inválido/)
  assert.throws(() => parseRule({ kind: 'every', minutes: 1.5 }, zone), /Intervalo inválido/)
  assert.equal(parseRule({ kind: 'cron', expression: '*/15 9-17 * * 1-5' }, zone).timeZone, zone)
  assert.throws(() => parseRule({ kind: 'cron', expression: ' ' }, zone), /Informe expressão cron/i)
})

test('pedido do DSH: formato de cada tipo (segundos no horário, minutos viram segundos)', () => {
  const req = rule => scheduleRequest(parseRoutine(input(rule), zone))
  assert.deepEqual(req({ kind: 'daily', time: '09:30' }).daily, { time: '09:30:00', time_zone: zone })
  assert.deepEqual(req({ kind: 'weekly', time: '08:00', weekdays: [1, 3] }).weekly, { time: '08:00:00', time_zone: zone, weekdays: [1, 3] })
  assert.equal(req({ kind: 'every', minutes: 5 }).every_seconds, 300)
  assert.deepEqual(req({ kind: 'cron', expression: '0 9 * * 1' }).cron, { expression: '0 9 * * 1', time_zone: zone })
  assert.equal(req({ kind: 'daily', time: '09:30' }).title, 'Resumo')
})

test('título e instrução obrigatórios e limitados', () => {
  assert.throws(() => parseRoutine({ title: ' ', prompt: 'x', rule: { kind: 'every', minutes: 5 } }, zone), /Informe título/i)
  assert.throws(() => parseRoutine({ title: 'x', prompt: '', rule: { kind: 'every', minutes: 5 } }, zone), /Informe instrução/i)
  assert.throws(() => parseRoutine({ title: 'x'.repeat(121), prompt: 'x', rule: { kind: 'every', minutes: 5 } }, zone), /passa de 120/)
})

test('descrição legível da regra', () => {
  assert.match(describeRule({ kind: 'daily', time: '09:30', timeZone: zone }), /todo dia às 09:30/)
  assert.match(describeRule({ kind: 'weekly', time: '08:00', timeZone: zone, weekdays: [1, 5] }), /seg, sex às 08:00/)
  assert.equal(describeRule({ kind: 'every', minutes: 15 }), 'a cada 15 min')
})

test('estado: rotinas por agente com limite, remoção e sessão casa', () => {
  let state = emptyState()
  const parsed = parseRoutine(input({ kind: 'every', minutes: 60 }), zone)
  for (let i = 0; i < MAX_ROUTINES_PER_AGENT; i += 1) state = addRoutine(state, 'a1', parsed, `s${i}`, 'sess').state
  assert.throws(() => addRoutine(state, 'a1', parsed, 'x', 'sess'), /no máximo/)
  assert.equal(routinesOf(state, 'a1').length, MAX_ROUTINES_PER_AGENT)
  assert.equal(addRoutine(state, 'a2', parsed, 'x', 'sess').state.routines.length, MAX_ROUTINES_PER_AGENT + 1)
  const removed = removeRoutine(state, routinesOf(state, 'a1')[0].id)
  assert.equal(routinesOf(removed.state, 'a1').length, MAX_ROUTINES_PER_AGENT - 1)
  assert.throws(() => removeRoutine(state, 'nada'), /não encontrada/)
  assert.equal(homeOf(emptyState(), 'a1'), undefined)
  assert.equal(homeOf(setHome(emptyState(), 'a1', 'S1'), 'a1'), 'S1')
  assert.deepEqual([normalizeState({}).homes, normalizeState({}).routines], [{}, []])
})
