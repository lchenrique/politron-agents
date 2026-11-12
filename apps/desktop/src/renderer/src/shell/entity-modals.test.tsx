import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BooModal, WorkspaceModal } from './entity-modals'

const noop = async () => undefined

describe('modais do shell', () => {
  it('fecha o modal de Boo com Esc', () => {
    const onClose = vi.fn()
    render(<BooModal models={[]} onClose={onClose} onSave={noop} onDelete={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Novo Agente Especialista (Boo)' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fecha o modal de projeto com Esc', () => {
    const onClose = vi.fn()
    render(<WorkspaceModal color="#10b981" onClose={onClose} onSave={noop} onDelete={vi.fn()} onPickFolder={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
