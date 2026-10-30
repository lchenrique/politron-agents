import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BooFigure, BOO_MOODS } from './BooFigure'
import { BOO_DETAILS } from '../../../../shared/boo-details'

describe('detalhes nas expressões do Boo', () => {
  it('mantém o rosto e a silhueta de cada estado ao trocar o detalhe', () => {
    for (const mood of BOO_MOODS) {
      const { container, unmount } = render(<BooFigure mood={mood} size={120} label={mood} />)
      const body = container.querySelector('.boo__body')!.getAttribute('d')
      unmount()
      for (const detail of BOO_DETAILS) {
        const view = render(<BooFigure mood={mood} size={120} label={mood} headAccessory={detail.id} />)
        expect(view.container.querySelector('.boo__body')).toHaveAttribute('d', body)
        expect(view.container.querySelectorAll('[data-boo-accessory]')).toHaveLength(detail.id === 'none' ? 0 : 1)
        expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/)
        view.unmount()
      }
    }
  })
  it('não depende de IDs globais ou gradientes que conflitam entre instâncias', () => {
    const { container } = render(<><BooFigure mood="idle" size={120} label="a" headAccessory="boo-noel" /><BooFigure mood="idle" size={120} label="b" headAccessory="boo-noel" /></>)
    const ids = [...container.querySelectorAll('[id]')].map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(container.querySelector('linearGradient')).toBeNull()
  })
})
