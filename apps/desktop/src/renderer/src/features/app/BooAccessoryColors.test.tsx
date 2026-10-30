import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { validateBooAccessoryColors } from '../../../../shared/boo-accessory-colors'
import { BooFigure } from './BooFigure'

describe('cores e compatibilidade dos detalhes do Boo', () => {
  it('muda a cor do corpo sem recolorir o detalhe sazonal ou restaurar paletas antigas', () => {
    const { container } = render(<BooFigure mood="idle" size={120} label="Boo" colors={{ body: '#4098eb' }} headAccessory="boo-noel" accessoryColors={{ cap: ['#ff0000'] }} />)
    expect((container.querySelector('svg') as SVGElement).style.getPropertyValue('--boo-body')).toBe('#4098eb')
    expect(container.querySelector('[data-boo-accessory="boo-noel"]')).toBeInTheDocument()
    expect(container.querySelector('[data-boo-accessory="cap"]')).toBeNull()
  })
  it('rejeita cores malformadas, IDs não permitidos e carga excessiva', () => {
    expect(validateBooAccessoryColors({ cap: ['#ABCDEF'], sunglasses: ['#765432'] })).toMatchObject({
      cap: ['#abcdef'], sunglasses: ['#765432'],
    })
    for (const invalid of [null, [], 'red', { random: ['#abcdef'] }, { cap: ['red'] },
      { cap: ['#abcdef', '#abcdef', '#abcdef', '#abcdef'] }, { cap: [123] }]) {
      expect(() => validateBooAccessoryColors(invalid)).toThrow()
    }
  })
})
