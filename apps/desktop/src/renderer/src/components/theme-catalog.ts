export type ThemeId =
  | 'default'
  | 'dark-matter'
  | 'zen'
  | 'cafeine'
  | 'claude'
  | 'ember'
  | 'nordic'
  | 'evergreen'
  | 'violet-bloom'
  | 't3chat'
  | 'terminal-muted'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  description: string
  swatch: string
}

export const THEME_GROUPS: ReadonlyArray<{ label: string; themes: readonly ThemeDefinition[] }> = [
  {
    label: 'Essenciais',
    themes: [
      { id: 'default', label: 'Vibe', description: 'Preto e branco', swatch: '#9BA3B5' },
      { id: 'dark-matter', label: 'Dark Matter', description: 'Grafite e cobre', swatch: '#D87943' },
      { id: 'zen', label: 'Zen', description: 'Neutros suaves', swatch: '#9F9885' },
    ],
  },
  {
    label: 'Aconchegantes',
    themes: [
      { id: 'cafeine', label: 'Cafeine', description: 'Café e creme', swatch: '#B68A6B' },
      { id: 'claude', label: 'Claude', description: 'Terracota', swatch: '#C46A4D' },
      { id: 'ember', label: 'Ember', description: 'Âmbar e bronze', swatch: '#DA9252' },
    ],
  },
  {
    label: 'Cores e personalidade',
    themes: [
      { id: 'nordic', label: 'Nordic', description: 'Azul glacial', swatch: '#78B3DE' },
      { id: 'evergreen', label: 'Evergreen', description: 'Verde floresta', swatch: '#64A77F' },
      { id: 'violet-bloom', label: 'Violet Bloom', description: 'Roxo vibrante', swatch: '#8C5CFF' },
      { id: 't3chat', label: 'T3 Rose', description: 'Rosa ameixa', swatch: '#A84370' },
      { id: 'terminal-muted', label: 'Terminal Green', description: 'Verde terminal', swatch: '#45A167' },
    ],
  },
]

export const THEMES = THEME_GROUPS.flatMap(group => group.themes)

export const LEGACY_THEME_MIGRATIONS: Readonly<Record<string, ThemeId>> = {
  candyland: 't3chat',
  tangerine: 'ember',
  cyberpunk: 'violet-bloom',
  omegon: 'nordic',
  msn: 'nordic',
  melancholik: 'zen',
}

/** Persisted names may outlive retired themes. Resolve instead of leaving an unstyled selection. */
export function resolveThemeName(value: string | null | undefined): ThemeId {
  if (value) {
    const replacement = LEGACY_THEME_MIGRATIONS[value]
    if (replacement) return replacement
    const existing = THEMES.find(theme => theme.id === value)
    if (existing) return existing.id
  }
  return 'default'
}
