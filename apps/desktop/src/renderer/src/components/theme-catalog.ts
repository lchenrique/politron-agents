/**
 * Registry de temas. O sistema visual é o Carbon & Graphite, portado do design
 * de referência (boobot_agent_workspace_desktop.html): superfícies neutras de
 * carbono com acento esmeralda.
 *
 * - `boobot` — o tema base, em dois modos: Paper (claro) e Carbon (escuro).
 * - `warm`   — Warm Graphite, a variante quente escura do mesmo sistema.
 *
 * Para adicionar um tema: inclua o id em ThemeId e em THEMES e defina os tokens
 * de paleta em index.css/styles/carbon.css sob `[data-theme="id"]`.
 * Componentes não mudam.
 */
export type ThemeId = 'boobot' | 'warm'
export type ColorMode = 'light' | 'dark'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  description: string
  modes: readonly ColorMode[]
}

export const DEFAULT_THEME: ThemeId = 'boobot'

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'boobot', label: 'Boobot', description: 'Carbon & Graphite — carbono com acento esmeralda', modes: ['light', 'dark'] },
  { id: 'warm', label: 'Warm', description: 'Carbon & Graphite na variante quente', modes: ['dark'] },
]

/** Os únicos modos oferecidos na interface. */
export const COLOR_MODES: ReadonlyArray<{ id: ColorMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/**
 * Presets do seletor de tema do top bar, iguais aos do HTML.
 * Cada preset fixa tema e modo de uma vez.
 */
export const THEME_PRESETS: ReadonlyArray<{ id: 'carbon' | 'warm' | 'paper'; label: string; theme: ThemeId; mode: ColorMode }> = [
  { id: 'carbon', label: 'Carbon', theme: 'boobot', mode: 'dark' },
  { id: 'warm', label: 'Warm', theme: 'warm', mode: 'dark' },
  { id: 'paper', label: 'Paper', theme: 'boobot', mode: 'light' },
]

/**
 * IDs de paletas aposentadas, mantidos só para migrar preferências salvas.
 * Todas convergem para o tema único; o modo claro/escuro salvo é preservado à parte.
 */
export const LEGACY_THEME_IDS: readonly string[] = [
  'default', 'dark-matter', 'zen', 'cafeine', 'claude', 'ember', 'nordic', 'evergreen', 'violet-bloom', 't3chat', 'terminal-muted',
  'candyland', 'tangerine', 'cyberpunk', 'omegon', 'msn', 'melancholik',
]

/** Preferências antigas ou desconhecidas resolvem para um tema registrado em vez de ficar sem estilo. */
export function resolveThemeName(value: string | null | undefined): ThemeId {
  const existing = THEMES.find(theme => theme.id === value)
  return existing ? existing.id : DEFAULT_THEME
}
