/** Tempo relativo compacto das linhas de sessão, com os limites do DeepSeek Harness (MIT, ui-primitives/relative-time.ts). */
export function relativeTime(at: string, now: number): string {
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const time = Date.parse(at)
  if (!Number.isFinite(time)) return ''
  const diff = Math.max(0, now - time)
  if (diff < MIN) return 'agora'
  if (diff < HOUR) return Math.floor(diff / MIN) + 'min'
  if (diff < DAY) return Math.floor(diff / HOUR) + 'h'
  if (diff < 30 * DAY) return Math.floor(diff / DAY) + 'd'
  const months = Math.floor(diff / (30 * DAY))
  if (diff < 365 * DAY) return months === 1 ? '1 mês' : months + ' meses'
  return Math.floor(diff / (365 * DAY)) + 'a'
}
