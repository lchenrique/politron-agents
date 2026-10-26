/**
 * Registry de temas. Hoje existe um único sistema visual (Boobot) com dois modos.
 * Para adicionar um tema: inclua o id em ThemeId e em THEMES e defina os tokens de paleta
 * em index.css sob `[data-theme="id"]` e `.dark[data-theme="id"]`. Componentes não mudam.
 */
export type ThemeId = 'boobot'
export type ColorMode = 'light' | 'dark'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  description: string
  modes: readonly ColorMode[]
}

export const DEFAULT_THEME: ThemeId = 'boobot'

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'boobot', label: 'Boobot', description: 'Grafite com acento íris', modes: ['light', 'dark'] },
]

/** Os únicos modos oferecidos na interface. */
export const COLOR_MODES: ReadonlyArray<{ id: ColorMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
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
