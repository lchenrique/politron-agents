import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavRail, railItems, type NavRailProps } from './NavRail'

const props = (overrides: Partial<NavRailProps> = {}): NavRailProps => ({ view: 'home', chiefName: 'Lyra', attentionCount: 2, openTasks: 5, enabledRoutines: 0, onOpenHome: vi.fn(), ...overrides })

describe('faixa de ícones', () => {
  it('é uma navegação rotulada com as visões globais e Configurações no fim', () => {
    render(<NavRail {...props()} />)
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const names = within(nav).getAllByRole('button').map(item => item.getAttribute('aria-label'))
    expect(names).toEqual(['Central do Lyra, 2 pendências', 'Board da empresa, 5 tarefas abertas', 'Rotinas', 'Configurações'])
    expect(railItems(props()).map(item => item.id)).toEqual(['home', 'board', 'routines', 'settings'])
  })

  it('marca a visão ativa com aria-current e abre cada visão', () => {
    const onOpenHome = vi.fn()
    render(<NavRail {...props({ view: 'board', onOpenHome })} />)
    expect(screen.getByRole('button', { name: /^Board da empresa/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^Central/ })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Rotinas' }))
    expect(onOpenHome).toHaveBeenCalledExactlyOnceWith('routines')
  })

  it('Configurações é uma página como as outras: abre a visão e marca aria-current', () => {
    const onOpenHome = vi.fn()
    render(<NavRail {...props({ view: 'settings', onOpenHome })} />)
    const settings = screen.getByRole('button', { name: 'Configurações' })
    expect(settings).toHaveAttribute('data-active', 'true')
    expect(settings).toHaveAttribute('aria-current', 'page')
    expect(settings).not.toHaveAttribute('aria-haspopup')
    fireEvent.click(settings)
    expect(onOpenHome).toHaveBeenCalledExactlyOnceWith('settings')
  })

  it('setas, Home e End andam entre os ícones', () => {
    render(<NavRail {...props()} />)
    const buttons = screen.getAllByRole('button')
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowDown' })
    expect(buttons[1]).toHaveFocus()
    fireEvent.keyDown(buttons[1], { key: 'End' })
    expect(buttons[3]).toHaveFocus()
    fireEvent.keyDown(buttons[3], { key: 'ArrowDown' })
    expect(buttons[0]).toHaveFocus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowUp' })
    expect(buttons[3]).toHaveFocus()
  })
})
