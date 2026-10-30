import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { BOO_DETAILS } from '../../../../shared/boo-details'
import { BooHeadAccessory, BooFaceAccessory } from './BooAccessories'
import { PoliAvatar } from './PoliAvatar'
import { PoliCustomizer } from './PoliCustomizer'

const agent = { id: 'detail-check', name: 'Boo', color: '#ffffff', runtime: 'codex' } as Agent

describe('detalhes da nova identidade do Boo', () => {
  it('desenha os três detalhes originais sem usar a coleção antiga', () => {
    for (const detail of BOO_DETAILS.filter(item => item.id !== 'none')) {
      const { container, unmount } = render(<svg><BooHeadAccessory kind={detail.id} /></svg>)
      expect(container.querySelector('[data-boo-accessory]')).toHaveAttribute('data-boo-accessory', detail.id)
      expect(container.querySelectorAll('path').length).toBeGreaterThan(1)
      unmount()
    }
  })
  it('não restaura óculos, fones ou chapéus de perfis antigos', () => {
    const { container } = render(<svg><BooHeadAccessory kind="headphones" /><BooHeadAccessory kind="cap" /><BooFaceAccessory kind="glasses" /></svg>)
    expect(container.querySelector('[data-boo-accessory]')).toBeNull()
  })
  it('mantém o detalhe no grupo do corpo, fora da camada de olhos e boca', () => {
    const { container } = render(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'boo-noel' }} size={128} />)
    const detail = screen.getByLabelText('Gorro de Natal do Boo')
    expect(container.querySelector('.boo__pose')).toContainElement(detail)
    expect(container.querySelector('.boo__face')).not.toContainElement(detail)
  })
  it('envia o identificador novo ao formulário sem o legado de rosto', () => {
    const change = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gorro de Natal' }))
    expect(change).toHaveBeenCalledWith({ pitsHeadAccessory: 'boo-noel', pitsFaceAccessory: 'none', pitsAccessory: 'none' })
  })
})
