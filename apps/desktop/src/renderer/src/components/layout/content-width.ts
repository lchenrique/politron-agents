import { useEffect, useSyncExternalStore } from 'react'

/** Largura da coluna de conteúdo escolhida pelo usuário; vale para Central, Rotinas, Configurações, chat e composer. */
export const CONTENT_WIDTH_KEY = 'politron.layout.content-width'
export const CONTENT_WIDTHS = [
  { id: 'narrow', label: 'Estreita', px: 720 },
  { id: 'medium', label: 'Média', px: 880 },
  { id: 'wide', label: 'Larga', px: 1080 },
  { id: 'full', label: 'Total', px: 10000 },
] as const
export type ContentWidth = (typeof CONTENT_WIDTHS)[number]['id']
export const DEFAULT_CONTENT_WIDTH: ContentWidth = 'medium'

const isWidth = (value: unknown): value is ContentWidth => CONTENT_WIDTHS.some(item => item.id === value)
const listeners = new Set<() => void>()

export function readContentWidth(): ContentWidth {
  try { const stored = localStorage.getItem(CONTENT_WIDTH_KEY); return isWidth(stored) ? stored : DEFAULT_CONTENT_WIDTH } catch { return DEFAULT_CONTENT_WIDTH }
}

export function applyContentWidth(width: ContentWidth) {
  const px = CONTENT_WIDTHS.find(item => item.id === width)?.px ?? 880
  document.documentElement.style.setProperty('--content-width', `${px}px`)
}

export function setContentWidth(width: ContentWidth) {
  try { localStorage.setItem(CONTENT_WIDTH_KEY, width) } catch { /* preferência opcional */ }
  applyContentWidth(width)
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Lê a preferência, mantém `--content-width` em <html> e atualiza todos os consumidores quando ela muda. */
export function useContentWidth(): [ContentWidth, (width: ContentWidth) => void] {
  const width = useSyncExternalStore(subscribe, readContentWidth, () => DEFAULT_CONTENT_WIDTH)
  useEffect(() => { applyContentWidth(width) }, [width])
  return [width, setContentWidth]
}
