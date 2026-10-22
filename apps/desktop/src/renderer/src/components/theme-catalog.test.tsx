import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { THEME_GROUPS, THEMES, resolveThemeName } from './theme-catalog'
import { ThemeProvider, useTheme } from './theme-provider'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark', 'light')
  localStorage.removeItem('test-palette-name')
  localStorage.removeItem('test-palette-mode')
})

describe('curadoria de temas', () => {
  it('oferece 11 opções únicas e com amostra de cor', () => {
    expect(THEMES).toHaveLength(11)
    expect(new Set(THEMES.map(item => item.id)).size).toBe(THEMES.length)
    expect(THEME_GROUPS.flatMap(group => group.themes)).toEqual(THEMES)
    for (const item of THEMES) {
      expect(item.label.length).toBeGreaterThan(1)
      expect(item.swatch).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('mantém os nomes válidos e migra os removidos', () => {
    expect(resolveThemeName('nordic')).toBe('nordic')
    expect(resolveThemeName('evergreen')).toBe('evergreen')
    expect(resolveThemeName('ember')).toBe('ember')
    expect(resolveThemeName('candyland')).toBe('t3chat')
    expect(resolveThemeName('tangerine')).toBe('ember')
    expect(resolveThemeName('cyberpunk')).toBe('violet-bloom')
    expect(resolveThemeName('omegon')).toBe('nordic')
    expect(resolveThemeName('msn')).toBe('nordic')
    expect(resolveThemeName('melancholik')).toBe('zen')
    expect(resolveThemeName('unknown-legacy-theme')).toBe('default')
  })

  it('define CSS light e dark para cada tema listado', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/index.css'), 'utf8')
    for (const theme of THEMES) {
      if (theme.id === 'default') continue
      expect(css).toContain('[data-theme="' + theme.id + '"] {')
      expect(css).toContain('.dark[data-theme="' + theme.id + '"] {')
    }
    for (const removed of ['candyland','tangerine','cyberpunk','omegon','msn','melancholik']) {
      expect(css).not.toContain('[data-theme="' + removed + '"]')
    }
  })

  it('recupera uma preferência antiga e persiste um tema substituto válido', () => {
    localStorage.setItem('test-palette-name','omegon')
    render(
      <ThemeProvider storageKey="test-palette" defaultMode="dark">
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme-name')).toHaveTextContent('nordic')
    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic')
    expect(localStorage.getItem('test-palette-name')).toBe('nordic')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

function Probe() {
  const { theme } = useTheme()
  return <div data-testid="theme-name">{theme}</div>
}
