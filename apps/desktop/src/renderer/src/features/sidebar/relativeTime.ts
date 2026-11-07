/** Hora da lista de conversas, como num mensageiro: hoje "16:53", ontem "ontem", na semana "seg", antes "28/10". */
export function listTime(at: string, now: number): string {
  const date = new Date(at)
  if (!at || Number.isNaN(date.getTime())) return ''
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((day(new Date(now)) - day(date)) / 86_400_000)
  if (days <= 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'ontem'
  if (days < 7) return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

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
