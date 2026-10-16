import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar } from './PoliAvatar'
import { PoliCustomizer } from './PoliCustomizer'

const agent: Agent = {
  id: 'poli-1', name: 'Poli', alias: 'poli', description: '', instructions: 'Responder.',
  runtime: 'codex', model: '', color: '#786bea', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: ''
}

describe('Poli / avatar de agente', () => {
  it('usa o rosto original SVG e altera expressão de acordo com trabalho e espera', () => {
    const { rerender } = render(<PoliAvatar agent={agent} size={48} state="working" />)
    expect(screen.getByRole('img', { name: 'Poli — coding' })).toBeInTheDocument()
    rerender(<PoliAvatar agent={agent} size={48} state="waiting" />)
    expect(screen.getByRole('img', { name: 'Poli — thinking' })).toBeInTheDocument()
  })
  it('respeita opções visuais e animação desligada', () => {
    const { container } = render(<PoliAvatar agent={{ ...agent, pitsAura: false, pitsBlush: false, pitsAnimate: false, pitsEyeSize: 10, pitsEyeSpacing: 34 }} />)
    expect(container.querySelector('.poli-avatar__aura')).toBeNull()
    expect(container.querySelector('[data-animate="false"]')).not.toBeNull()
    expect(container.querySelectorAll('ellipse[fill="#f5a5d1"]')).toHaveLength(0)
    expect(container.querySelector('ellipse[cx="86"]')).not.toBeNull()
  })
  it('expõe no Studio as opções com atualizações ao vivo', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher cor #4098eb' }))
    expect(onChange).toHaveBeenCalledWith({ color: '#4098eb' })
    fireEvent.click(screen.getByRole('tab', { name: 'Animação' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar animações' }))
    expect(onChange).toHaveBeenCalledWith({ pitsAnimate: false })
    fireEvent.click(screen.getByRole('tab', { name: 'Estados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluído' }))
    expect(screen.getByRole('img', { name: 'Poli — done' })).toBeInTheDocument()
  })
})
