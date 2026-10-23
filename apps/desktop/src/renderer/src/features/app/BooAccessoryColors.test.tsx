import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { validateBooAccessoryColors } from '../../../../shared/boo-accessory-colors'
import { BooHeadAccessory, BooFaceAccessory } from './BooAccessories'
import { PoliCustomizer } from './PoliCustomizer'
import { shapeBounds, shapeLineAt, shapeWidthAt } from './boo-pet-geometry'

// These integration tests exercise persistence and palette propagation; the actual
// React Color popup has dedicated tests in ReactColorField.test.tsx.
vi.mock('@/components/ui/ReactColorField', () => ({
  ReactColorField: ({label,value,onChange}: {label:string;value:string;onChange:(hex:string)=>void}) =>
    <input type="color" aria-label={label} value={value} onChange={e=>onChange(e.target.value)} />,
}))
const agent: Agent = {
  id: 'custom-color-1', name: 'Boo', alias: 'boo', description: '', instructions: '',
  runtime: 'codex', model: '', color: '#786bea', avatar: '',
  canWrite: true, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '',
  pitsHeadAccessory: 'cap', pitsFaceAccessory: 'sunglasses',
}

function EditorHarness() {
  const [current, setCurrent] = useState(agent)
  return <><PoliCustomizer agent={current} onChange={patch => setCurrent(old => ({ ...old, ...patch }))} />
    <output data-testid="saved-palettes">{JSON.stringify(current.pitsAccessoryColors || {})}</output>
  </>
}

describe('Personalização vetorial por acessório', () => {
  it('altera cores de cada peça, preserva paletas independentes e restaura somente o item escolhido', () => {
    render(<EditorHarness />)
    const cap = screen.getByLabelText('cap — Copa')
    fireEvent.change(cap, { target: { value: '#ea3456' } })
    expect(screen.getByTestId('saved-palettes').textContent).toContain('#ea3456')

    const glasses = screen.getByLabelText('sunglasses — Armação')
    fireEvent.change(glasses, { target: { value: '#123456' } })
    const stored = JSON.parse(screen.getByTestId('saved-palettes').textContent || '{}')
    expect(stored.cap[0]).toBe('#ea3456')
    expect(stored.sunglasses[0]).toBe('#123456')

    // Mudar de chapéu não pode apagar a personalização do anterior.
    fireEvent.click(screen.getByRole('button', { name: 'Bruxa' }))
    expect(screen.getByLabelText('witch-hat — Chapéu')).toHaveValue('#6b46c1')
    fireEvent.click(screen.getByRole('button', { name: 'Boné' }))
    expect(screen.getByLabelText('cap — Copa')).toHaveValue('#ea3456')

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar cores de cap' }))
    const restored = JSON.parse(screen.getByTestId('saved-palettes').textContent || '{}')
    expect(restored.cap).toBeUndefined()
    expect(restored.sunglasses[0]).toBe('#123456')
    expect(screen.getByLabelText('cap — Copa')).toHaveValue('#4a90e2')
  })

  it('pinta acessórios reais com os overrides sem perder IDs de gradientes por instância', () => {
    const { container } = render(<svg>
      <BooHeadAccessory kind="cap" colors={{ cap: ['#ee1133', '#103355', '#ffe077'] }} />
      <BooHeadAccessory kind="cap" />
      <BooFaceAccessory kind="glasses" colors={{ glasses: ['#22aa55', '#ffeecc'] }} />
    </svg>)
    expect(container.querySelectorAll('g[data-boo-accessory="cap"]')).toHaveLength(2)
    expect(container.innerHTML).toContain('#ee1133')
    expect(container.innerHTML).toContain('#22aa55')
    const ids = [...container.querySelectorAll('[id]')].map(el => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('eleva bruxa e fones pelo contorno real sem esticar as peças', () => {
    for (const shape of ['round', 'ghost-wave', 'drop', 'little-cat']) {
      for (const [kind, anchorY, lift] of [['witch-hat', 54, 8], ['headphones', 83, 7]] as const) {
        const { container, unmount } = render(<svg><BooHeadAccessory kind={kind} shape={shape} bodyHeight={0.9} /></svg>)
        const t = container.querySelector('[data-boo-accessory] g[transform]')?.getAttribute('transform') || ''
        const renderedY = Number(t.match(/translate\(120 ([\d.-]+)/)?.[1])
        const y = shapeLineAt(shape, shapeWidthAt('round', anchorY) / shapeBounds('round').width)
        const baselineY = 100 + (y - 100) * 0.9
        expect(renderedY).toBeCloseTo(baselineY - lift * .9, 4)
        unmount()
      }
    }
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
