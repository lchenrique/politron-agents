import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Composer } from './Composer'

beforeEach(() => sessionStorage.clear())

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const props: React.ComponentProps<typeof Composer> = {
    conversationId: 'compact-test',
    models: [{ name: 'Modelo real', efforts: ['Medium'], defaultEffort: 'Medium' }],
    defaultModelName: 'Modelo real', onModelChange: vi.fn(), onSubmit, onStop: vi.fn(), ...overrides,
  }
  render(<Composer {...props} />)
  const textarea = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  return { textarea, onSubmit }
}

describe('Composer compacto e elástico', () => {
  it('começa em uma única linha, sem abrir espaço vazio e sem texto auxiliar redundante', () => {
    const { textarea } = setup()
    expect(textarea).toHaveClass('min-h-[36px]')
    expect(textarea.style.height).toBe('36px')
    expect(screen.queryByText(/Agentes podem errar/)).not.toBeInTheDocument()
  })

  it('cresce automaticamente com múltiplas linhas até o limite de 220px', () => {
    const { textarea } = setup()
    let measuredHeight = 126
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => measuredHeight })
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha' } })
    expect(textarea.style.height).toBe('126px')
    measuredHeight = 400
    fireEvent.change(textarea, { target: { value: 'uma linha\nsegunda linha\nterceira linha\nquarta' } })
    expect(textarea.style.height).toBe('220px')
    measuredHeight = 30
    fireEvent.change(textarea, { target: { value: '' } })
    expect(textarea.style.height).toBe('36px')
  })

  it('Enter envia e Shift+Enter permite nova linha', async () => {
    const { textarea, onSubmit } = setup()
    fireEvent.change(textarea, { target: { value: 'primeira' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(textarea, { target: { value: 'primeira\nsegunda' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith('primeira\nsegunda', 'Modelo real', expect.objectContaining({ files: [] }))
  })
})
