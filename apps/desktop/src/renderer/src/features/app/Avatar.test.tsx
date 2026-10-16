import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { Avatar } from './Avatar'

const agent: Agent = {
  id: 'pits-1', name: 'Pits', alias: 'pits', description: '', instructions: 'Responda.',
  runtime: 'codex', model: '', color: '#786bea', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask',
  revision: 1, createdAt: '',
}

describe('dimensões do avatar de agente', () => {
  it.each([
    ['sm', 42],
    ['md', 56],
    ['lg', 88],
  ] as const)('mostra o Poli no tamanho %s com %i pixels', (size, pixels) => {
    const { container } = render(<Avatar agent={agent} size={size} />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveStyle({ width: pixels + 'px', height: pixels + 'px' })
    expect(screen.getByRole('img', { name: 'Pits — idle' })).toHaveAttribute('viewBox', '28 0 185 200')
  })

  it('mantém o tamanho também ao usar imagem personalizada', () => {
    const { container } = render(<Avatar agent={{ ...agent, avatar: 'data:image/png;base64,AAAA' }} size="md" />)
    expect(container.firstElementChild).toHaveStyle({ width: '56px', height: '56px' })
    expect(screen.getByRole('img', { name: 'Avatar de Pits' })).toBeInTheDocument()
  })
})
