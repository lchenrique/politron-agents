import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { ImportedBooPetAccessory, heads, faces } from './BooPetAccessories'
import { BooHeadAccessory, BooFaceAccessory } from './BooAccessories'
import { PoliAvatar } from './PoliAvatar'
import { PoliCustomizer } from './PoliCustomizer'

const agent: Agent = {
  id: 'boopet-check', name: 'Boo', alias: 'boo', description: '', instructions: '',
  runtime: 'codex', model: '', color: '#786bea', avatar: '',
  canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
}
const looks = {
  shape: 'round', head: 'cap', face: 'none',
  width: 1, height: 1, eyeSize: 8, eyeSpacing: 26, mouthSize: 1, colors: {},
}

describe('Coleção original de acessórios do Boo Pet', () => {
  it('recupera o desenho da coleção original para cada item, incluindo os novos', () => {
    for (const [kind] of heads.filter(([name]) => name !== 'none')) {
      const { container, unmount } = render(<svg><BooHeadAccessory kind={kind} /></svg>)
      expect(container.querySelector('g[aria-label]')).toBeTruthy()
      unmount()
    }
    for (const [kind] of faces.filter(([name]) => name !== 'none')) {
      const { container, unmount } = render(<svg><BooFaceAccessory kind={kind} /></svg>)
      expect(container.querySelector('g[aria-label]')).toBeTruthy()
      unmount()
    }
  })
  it('reposiciona os acessórios de acordo com formato e largura da cabeça, sem esticar o rosto', () => {
    const { container, rerender } = render(<svg><ImportedBooPetAccessory looks={looks} layer="head" /></svg>)
    const first = container.querySelector('g[aria-label="Boné"]')?.getAttribute('transform')
    expect(first).toMatch(/translate\(120 /)
    rerender(<svg><ImportedBooPetAccessory looks={{ ...looks, shape: 'drop', width: 1.2 }} layer="head" /></svg>)
    const next = container.querySelector('g[aria-label="Boné"]')?.getAttribute('transform')
    expect(next).toMatch(/scale\(/)
    expect(next).not.toBe(first)
  })
  it('usa o arquivo Boo Pet no corpo SVG do Boobot e oferece acessórios novos no estúdio', () => {
    const { container } = render(<PoliAvatar agent={{ ...agent, pitsShape: 'little-cat', pitsHeadAccessory: 'bow', pitsFaceAccessory: 'heart-glasses', pitsBodyWidth: 1.2 }} size={128} />)
    expect(container.querySelector('g[aria-label="Laço"]')).toBeInTheDocument()
    expect(container.querySelector('g[aria-label="Óculos de coração"]')).toBeInTheDocument()
    // Acessórios acompanham a pose (inclusive deitado), mas ficam fora do caminho do corpo.
    expect(container.querySelector('.boo__pose')?.contains(container.querySelector('g[aria-label="Laço"]'))).toBe(true)
    expect(container.querySelector('.boo__face')?.contains(container.querySelector('g[aria-label="Óculos de coração"]'))).toBe(true)
  })
  it('permite selecionar e persistir os identificadores novos através da UI', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('group', { name: 'Acessórios de cabeça' }).querySelector('button[aria-pressed="false"]:last-child')!)
    expect(onChange).toHaveBeenCalledWith({ pitsHeadAccessory: 'halo', pitsAccessory: 'none' })
    fireEvent.click(screen.getByRole('button', { name: 'Coração' }))
    expect(onChange).toHaveBeenCalledWith({ pitsFaceAccessory: 'heart-glasses', pitsAccessory: 'none' })
  })
})
