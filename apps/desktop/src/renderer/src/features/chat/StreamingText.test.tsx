import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { StreamingText } from './StreamingText'

describe('texto durante streaming', () => {
  it('mantém o texto anterior estável e apresenta novos fragmentos em blocos animados', async () => {
    const { container, rerender } = render(<StreamingText text="Olá" />)
    expect(container.textContent).toBe('Olá')

    rerender(<StreamingText text="Olá mundo" />)

    await waitFor(() => expect(container.querySelector('.chat-stream-text-chunk')?.textContent).toBe(' mundo'))
    expect(container.textContent).toBe('Olá mundo')
  })

  it('substitui a sequência se o texto recebido deixar de ser um prefixo', async () => {
    const { container, rerender } = render(<StreamingText text="Resposta parcial" />)
    rerender(<StreamingText text="Resposta corrigida" />)

    await waitFor(() => expect(container.textContent).toBe('Resposta corrigida'))
    expect(container.querySelector('.chat-stream-text-chunk')).toBeNull()
  })
})
