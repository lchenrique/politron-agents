import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TopBar } from './top-bar'

afterEach(cleanup)

/** Props mínimas: o top bar só precisa do projeto e dos callbacks para montar. */
function props(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return {
    project: { name: 'agendamentos-api', branch: 'main' },
    projects: [],
    onSelectProject: vi.fn(),
    status: { text: 'Chief aguardando sua decisão (1 gate)', tone: 'warning' as const },
    onOpenCommand: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenTool: vi.fn(),
    onApplyPreset: vi.fn(),
    onResetLayout: vi.fn(),
    ...overrides,
  }
}

it('não repete o acesso às Configurações: ele mora na rail do sidebar', () => {
  render(<TopBar {...props()} />)
  expect(screen.queryByRole('button', { name: 'Configurações' })).toBeNull()
  expect(screen.queryByText('Config')).toBeNull()
})

it('mantém o menu de painéis só como ícone, sem nome no topo', () => {
  render(<TopBar {...props()} />)
  // O nome acessível vem do title, não de um rótulo visível.
  const gatilho = screen.getByRole('button', { name: /Opções de Layout/ })
  expect(gatilho.textContent).toBe('')
  expect(screen.queryByText('Layout & Painéis')).toBeNull()
  fireEvent.click(gatilho)
  expect(screen.queryByText('Layout & Painéis')).toBeNull()
})

it('mostra a busca, o status quieto do projeto e o nome do workspace', () => {
  render(<TopBar {...props()} />)
  expect(screen.getByText('Buscar ou comando...')).toBeTruthy()
  expect(screen.getByText('Ctrl K')).toBeTruthy()
  expect(screen.getByText('Chief aguardando sua decisão (1 gate)')).toBeTruthy()
  expect(screen.getByText('agendamentos-api')).toBeTruthy()
})
