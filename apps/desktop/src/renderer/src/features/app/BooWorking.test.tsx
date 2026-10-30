import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BooWorking } from './BooWorking'

describe('Boo trabalhando no notebook', () => {
  it('usa as cores do agente e monta notebook e fone', () => {
    const { container } = render(<BooWorking label="Atlas está trabalhando" colors={{ body: '#7565e8', accent: '#ff9a3c' }} />)
    const svg = container.querySelector<SVGSVGElement>('svg.boo-work')!
    expect(svg).toHaveAttribute('aria-label', 'Atlas está trabalhando')
    expect(svg.style.getPropertyValue('--boo-body')).toBe('#7565e8')
    expect(svg.style.getPropertyValue('--boo-accent')).toBe('#ff9a3c')
    expect(container.querySelector('.boo-work__laptop .boo-work__lid')).not.toBeNull()
    expect(container.querySelectorAll('.boo-work__headset')).toHaveLength(2)
    expect(container.querySelectorAll('.boo__hand')).toHaveLength(2)
  })

  it('parado: sem códigos subindo e sem animação ligada', () => {
    const { container } = render(<BooWorking label="Boo" animate={false} />)
    expect(container.querySelector('svg')).toHaveAttribute('data-animate', 'false')
    expect(container.querySelector('.boo-work__code')).toBeNull()
  })
})
