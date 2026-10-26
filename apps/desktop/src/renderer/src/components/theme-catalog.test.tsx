import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { COLOR_MODES, LEGACY_THEME_IDS, THEMES, resolveThemeName } from './theme-catalog'
import { ThemeProvider, useTheme } from './theme-provider'
import { ThemeSelector } from './ide/ThemeSelector'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark', 'light')
  localStorage.removeItem('test-palette-name')
  localStorage.removeItem('test-palette-mode')
})

describe('sistema visual Boobot', () => {
  it('registra um único tema com os modos Light e Dark', () => {
    expect(THEMES.map(theme => theme.id)).toEqual(['boobot'])
    expect(THEMES[0].modes).toEqual(['light', 'dark'])
    expect(COLOR_MODES.map(mode => mode.label)).toEqual(['Light', 'Dark'])
  })

  it('migra qualquer paleta antiga para o tema único', () => {
    for (const legacy of LEGACY_THEME_IDS) expect(resolveThemeName(legacy)).toBe('boobot')
    expect(resolveThemeName('unknown-legacy-theme')).toBe('boobot')
    expect(resolveThemeName(null)).toBe('boobot')
  })

  it('define tokens light e dark do tema e nenhum seletor de paleta aposentada', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/index.css'), 'utf8')
    expect(css).toContain('[data-theme="boobot"] {')
    expect(css).toContain('.dark[data-theme="boobot"] {')
    for (const legacy of LEGACY_THEME_IDS) expect(css).not.toContain('[data-theme="' + legacy + '"]')
  })

  it('migra a preferência antiga sem perder o modo escuro salvo', () => {
    localStorage.setItem('test-palette-name', 'nordic')
    localStorage.setItem('test-palette-mode', 'dark')
    render(<ThemeProvider storageKey="test-palette" defaultMode="light"><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme-name')).toHaveTextContent('boobot')
    expect(document.documentElement.getAttribute('data-theme')).toBe('boobot')
    expect(localStorage.getItem('test-palette-name')).toBe('boobot')
    expect(localStorage.getItem('test-palette-mode')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('migra a preferência antiga sem perder o modo claro salvo', () => {
    localStorage.setItem('test-palette-name', 'claude')
    localStorage.setItem('test-palette-mode', 'light')
    render(<ThemeProvider storageKey="test-palette" defaultMode="dark"><Probe /></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('boobot')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('oferece só Light e Dark no seletor e persiste a escolha', () => {
    localStorage.setItem('test-palette-mode', 'dark')
    render(<ThemeProvider storageKey="test-palette"><ThemeSelector /></ThemeProvider>)
    const group = screen.getByRole('radiogroup', { name: 'Modo de cor' })
    const options = screen.getAllByRole('radio')
    expect(options.map(option => option.getAttribute('aria-label'))).toEqual(['Light', 'Dark'])
    expect(group).not.toHaveTextContent(/Nordic|Ember|Claude|Zen|Vibe/)
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('test-palette-mode')).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })
})

function Probe() {
  const { theme } = useTheme()
  return <div data-testid="theme-name">{theme}</div>
}
