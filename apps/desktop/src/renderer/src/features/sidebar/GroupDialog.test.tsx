import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GroupDialog } from './GroupDialog'

it('cria uma pasta em diálogo DSH e permite cancelar sem confirmar', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(<GroupDialog draft={{ mode: 'create', value: '' }} onChange={vi.fn()} onCancel={onCancel} onConfirm={onConfirm} />)

  expect(screen.getByRole('dialog', { name: 'Nova pasta de projetos' })).toHaveAttribute('data-dsh-modal', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onConfirm).not.toHaveBeenCalled()
})
