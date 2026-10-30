import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { PoliCustomizer } from './PoliCustomizer'
import { PoliAvatar } from './PoliAvatar'

const agent = { id: 'boo-editor', name: 'Boo', color: '#ffffff', avatar: '', runtime: 'codex' } as Agent

describe('editor simplificado do Boo', () => {
  it('mostra cor e detalhes sem formatos, parâmetros do rosto ou abas técnicas', () => {
    render(<PoliCustomizer agent={agent} onChange={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: 'Animação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Boné' })).not.toBeInTheDocument()
    expect(screen.queryByText('Formato')).not.toBeInTheDocument()
    expect(screen.queryByText('Intensidade do rosado')).not.toBeInTheDocument()
    expect(screen.queryByText('SVG animado')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Pequenos detalhes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher cor #4098eb' })).toBeInTheDocument()
  })

  it('seleciona um detalhe novo sem acumular acessórios antigos no rosto', () => {
    const change = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Brotinho' }))
    expect(change).toHaveBeenCalledWith({ pitsHeadAccessory: 'boo-sprout', pitsFaceAccessory: 'none', pitsAccessory: 'none' })
  })

  it('não desenha os acessórios antigos em perfis já salvos', () => {
    const { container } = render(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'headphones', pitsFaceAccessory: 'sunglasses' }} size={160} />)
    expect(container.querySelector('[data-boo-accessory]')).toBeNull()
  })
})
