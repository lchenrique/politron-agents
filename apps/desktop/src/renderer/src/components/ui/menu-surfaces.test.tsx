import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from './dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Command, CommandGroup, CommandItem, CommandList } from './command'

// Utilitários colados (ex.: "rounded-mdpx-2") não geram CSS e deixam o item encostado na borda.
const MALFORMED = /\brounded-(?:sm|md|lg|xl)(?:p[xylr]?|m[xy]?)-/

function expectNoMalformedClasses() {
  for (const element of document.body.querySelectorAll<HTMLElement>('[class]')) {
    expect(element.getAttribute('class')).not.toMatch(MALFORMED)
  }
}

describe('espaçamento das superfícies flutuantes', () => {
  it('dá recuo ao menu, aos itens marcáveis e ao submenu aberto', () => {
    render(<DropdownMenu open>
      <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Ações">
        <DropdownMenuLabel>Grupo</DropdownMenuLabel>
        <DropdownMenuItem>Renomear</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>Fixar</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="a"><DropdownMenuRadioItem value="a">Opção A</DropdownMenuRadioItem></DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
          <DropdownMenuSubContent><DropdownMenuItem>Projeto X</DropdownMenuItem></DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>)
    const menus = screen.getAllByRole('menu')
    expect(menus.length).toBeGreaterThanOrEqual(2)
    for (const menu of menus) expect(menu).toHaveClass('p-1.5', 'rounded-lg', 'border')
    for (const name of ['Renomear', 'Mover para', 'Projeto X']) {
      const item = screen.getByRole('menuitem', { name })
      expect(item).toHaveClass('px-2.5', 'py-1.5', 'rounded-[10px]')
    }
    expect(screen.getByRole('menuitemcheckbox', { name: 'Fixar' })).toHaveClass('pl-8', 'pr-2.5', 'rounded-[10px]')
    expect(screen.getByRole('menuitemradio', { name: 'Opção A' })).toHaveClass('pl-8', 'pr-2.5', 'rounded-[10px]')
    expect(screen.getByText('Grupo')).toHaveClass('px-2.5')
    expect(within(menus[0]).getByRole('separator')).toHaveClass('-mx-1.5')
    expectNoMalformedClasses()
  })

  it('preserva o className do chamador sobre o recuo padrão', () => {
    render(<DropdownMenu open>
      <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
      <DropdownMenuContent className="p-3"><DropdownMenuItem className="px-4">Item</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>)
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('p-3')
    expect(menu).not.toHaveClass('p-1.5')
    expect(screen.getByRole('menuitem', { name: 'Item' })).toHaveClass('px-4')
  })

  it('aplica o mesmo recuo à lista do select', () => {
    render(<Select open value="ask">
      <SelectTrigger aria-label="Modo"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="ask">Perguntar</SelectItem><SelectItem value="automatic">Automático</SelectItem></SelectContent>
    </Select>)
    const listbox = screen.getByRole('listbox')
    // O recuo fica no viewport do Radix, que envolve as opções.
    expect(listbox.querySelector('[data-radix-select-viewport]')).toHaveClass('p-1.5')
    for (const name of ['Perguntar', 'Automático']) expect(screen.getByRole('option', { name })).toHaveClass('pl-8', 'pr-2.5', 'rounded-[10px]')
    expectNoMalformedClasses()
  })

  it('mantém recuo em popovers e nas listas de comando dentro deles', () => {
    render(<Popover open>
      <PopoverTrigger>Abrir</PopoverTrigger>
      <PopoverContent aria-label="Seletor">
        <Command><CommandList><CommandGroup heading="CLIs"><CommandItem>Codex</CommandItem></CommandGroup></CommandList></Command>
      </PopoverContent>
    </Popover>)
    expect(screen.getByRole('dialog', { name: 'Seletor' })).toHaveClass('p-4', 'rounded-lg')
    const option = screen.getByRole('option', { name: 'Codex' })
    expect(option).toHaveClass('px-2.5', 'rounded-[10px]')
    expect(option.closest('[data-slot="command-group"]')).toHaveClass('p-1.5')
    expectNoMalformedClasses()
  })
})
