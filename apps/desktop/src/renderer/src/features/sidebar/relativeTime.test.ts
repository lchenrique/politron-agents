import { describe, expect, it } from 'vitest'
import { listTime, relativeTime } from './relativeTime'

describe('hora da lista de conversas', () => {
  const now = new Date(2026, 10, 6, 18, 30).getTime()
  it('hoje mostra a hora; ontem, a palavra; na semana, o dia; antes, a data', () => {
    expect(listTime(new Date(2026, 10, 6, 9, 5).toISOString(), now)).toBe('09:05')
    expect(listTime(new Date(2026, 10, 5, 23, 0).toISOString(), now)).toBe('ontem')
    expect(listTime(new Date(2026, 10, 3, 12, 0).toISOString(), now)).toMatch(/^ter/)
    expect(listTime(new Date(2026, 9, 28, 12, 0).toISOString(), now)).toBe('28/10')
    expect(listTime('', now)).toBe('')
  })
})

describe('tempo relativo das sessões', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('segue os limites do DSH', () => {
    expect(relativeTime(ago(59_000), now)).toBe('agora')
    expect(relativeTime(ago(3 * 60_000), now)).toBe('3min')
    expect(relativeTime(ago(59 * 60_000 + 59_000), now)).toBe('59min')
    expect(relativeTime(ago(3_600_000), now)).toBe('1h')
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe('4d')
    expect(relativeTime(ago(29 * 86_400_000), now)).toBe('29d')
    expect(relativeTime(ago(60 * 86_400_000), now)).toBe('2 meses')
    expect(relativeTime(ago(31 * 86_400_000), now)).toBe('1 mês')
    expect(relativeTime(ago(800 * 86_400_000), now)).toBe('2a')
  })
  it('não mostra tempo futuro nem data inválida', () => {
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe('agora')
    expect(relativeTime('', now)).toBe('')
  })
})
