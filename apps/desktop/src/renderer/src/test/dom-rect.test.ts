import { describe, expect, it } from 'vitest'
import { TestDOMRect } from './dom-rect'

describe('geometria do ambiente de testes', () => {
  it('preserva posição e dimensões ao calcular os limites', () => {
    expect(new TestDOMRect(10, 20, 30, 40).toJSON()).toEqual({
      x: 10, y: 20, width: 30, height: 40, top: 20, right: 40, bottom: 60, left: 10,
    })
  })

  it('normaliza somente os limites quando a dimensão é negativa', () => {
    expect(new TestDOMRect(10, 20, -30, -40).toJSON()).toEqual({
      x: 10, y: 20, width: -30, height: -40, top: -20, right: 10, bottom: 20, left: -20,
    })
  })

  it('aceita retângulos parciais e recalcula limites após edição', () => {
    const rect = TestDOMRect.fromRect({ width: 12 })
    rect.x = 4
    expect(rect.left).toBe(4)
    expect(rect.right).toBe(16)
    expect(rect.height).toBe(0)
  })
})
