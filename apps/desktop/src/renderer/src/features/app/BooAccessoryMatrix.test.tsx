import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BooHeadAccessory, BooFaceAccessory } from './BooAccessories'
import { heads, faces } from './BooPetAccessories'
import { BOO_BODY_PATHS } from './boo-appearance'
import { shapeBounds, shapeLineAt } from './boo-pet-geometry'

describe('Acessórios unificados SVG / Rive', () => {
  it('cobre toda a coleção ativa sem voltar para o desenho fixo antigo', () => {
    expect(heads.map(([id]) => id)).toEqual(expect.arrayContaining([
      'antenna', 'horns', 'cap', 'cap-flat', 'cap-back', 'beanie', 'bucket',
      'top-hat', 'witch-hat', 'headphones', 'crown', 'party-hat', 'chef-hat',
      'bow', 'flower', 'halo',
    ]))
    expect(faces.map(([id]) => id)).toEqual(expect.arrayContaining([
      'glasses', 'round-glasses', 'sunglasses', 'heart-glasses',
      'star-glasses', 'monocle', 'mustache', 'star-mask',
    ]))
  })

  it('posiciona todos os acessórios sobre todas as 12 silhuetas sem coordenadas inválidas', () => {
    for (const shape of Object.keys(BOO_BODY_PATHS)) {
      const bounds = shapeBounds(shape)
      expect(bounds.width).toBeGreaterThan(75)
      expect(bounds.bottom).toBeGreaterThan(bounds.top)
      const y = shapeLineAt(shape, .72)
      expect(y).toBeGreaterThanOrEqual(bounds.top)
      expect(y).toBeLessThan(bounds.bottom)

      for (const [kind] of heads.filter(([id]) => id !== 'none')) {
        const { container, unmount } = render(
          <svg><BooHeadAccessory kind={kind} shape={shape} bodyWidth={1.2} bodyHeight={.85} /></svg>
        )
        const layer = container.querySelector('[data-boo-accessory]')
        expect(layer).toHaveAttribute('data-boo-accessory', kind)
        const position = layer?.querySelector('g[transform]')
        expect(position?.getAttribute('transform')).toMatch(/^translate\(/)
        expect(position?.getAttribute('transform')).not.toMatch(/NaN|Infinity/)
        unmount()
      }
      for (const [kind] of faces.filter(([id]) => id !== 'none')) {
        const { container, unmount } = render(
          <svg><BooFaceAccessory kind={kind} shape={shape} eyeSize={12} eyeSpacing={35} bodyHeight={.9} /></svg>
        )
        expect(container.querySelector('[data-boo-accessory]')).toHaveAttribute('data-boo-accessory', kind)
        expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
        unmount()
      }
    }
  })

  it('não mistura gradientes SVG entre duas instâncias personalizadas', () => {
    const { container } = render(<svg>
      <BooHeadAccessory kind="cap-flat" shape="drop" />
      <BooHeadAccessory kind="cap-flat" shape="drop" />
    </svg>)
    const ids = [...container.querySelectorAll('[id]')].map(el => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
