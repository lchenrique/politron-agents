import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { MENU_SURFACE_CLASS } from './menu-styles'

// O Modal do design system (Configurações) usa z-index 1000. Superfícies em portal (Select, menus,
// popovers) com z-50 abriam atrás dele: o clique funcionava, mas a lista ficava invisível.
const modalCss = readFileSync(join(__dirname, '../dsh/Modal.module.css'), 'utf8')
const modalZ = Number(/\.root\s*{[^}]*?z-index:\s*(\d+)/s.exec(modalCss)?.[1])

function zOf(className: string): number {
  return Number(/(?:^|\s)z-\[(\d+)\]/.exec(className)?.[1])
}

describe('camadas das superfícies flutuantes', () => {
  it('o conteúdo do Select fica acima do Modal', () => {
    render(<Select open value="a">
      <SelectTrigger aria-label="Modo"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="a">Opção A</SelectItem></SelectContent>
    </Select>)
    const listbox = screen.getByRole('listbox')
    expect(modalZ).toBeGreaterThanOrEqual(1000)
    expect(zOf(listbox.className)).toBeGreaterThan(modalZ)
  })

  it('menus, popovers e tooltips ficam acima do Modal', () => {
    expect(zOf(MENU_SURFACE_CLASS)).toBeGreaterThan(modalZ)
    for (const file of ['popover.tsx', 'tooltip.tsx', 'ReactColorField.tsx']) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      expect(source).not.toMatch(/\bz-50\b[^"']*(?:w-72|w-fit)/)
      expect(zOf(/z-\[\d+\]/.exec(source)?.[0] ?? '')).toBeGreaterThan(modalZ)
    }
  })
})
