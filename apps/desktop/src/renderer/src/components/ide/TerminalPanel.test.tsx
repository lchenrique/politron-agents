import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xterm/xterm', () => ({ Terminal: class {} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }))
import TerminalPanel from './TerminalPanel'

describe('TerminalPanel', () => {
  it('mantém o terminal interativo como padrão e deixa as saídas acessíveis manualmente', () => {
    render(<TerminalPanel conversationId="c1" showLogs={false} />)
    expect(screen.getByRole('button', { name: 'Terminal' })).toHaveClass('text-foreground')
    const outputsTab = screen.getByRole('button', { name: 'Saída dos agentes' })
    expect(outputsTab).not.toHaveClass('text-foreground')
    expect(screen.queryByRole('button', { name: 'Agentes' })).not.toBeInTheDocument()
    fireEvent.click(outputsTab)
    expect(outputsTab).toHaveClass('text-foreground')
  })
})
