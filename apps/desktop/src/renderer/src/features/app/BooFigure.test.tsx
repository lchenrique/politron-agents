import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BOO_MOODS, BooFigure, type BooMood } from './BooFigure'

const draw = (mood: BooMood, size = 200) => render(<BooFigure mood={mood} size={size} label={mood} animate />).container

describe('Boo / 11 estados', () => {
  it('pensa com o sorriso original e um olhar atento, sem sobrancelha de irritação', () => {
    const { container, rerender } = render(<BooFigure mood="idle" size={200} label="Boo" />)
    const smile = container.querySelector('.boo__reference-mouth')!.getAttribute('d')
    rerender(<BooFigure mood="thinking" size={200} label="Boo" />)
    expect(container.querySelector('.boo__reference-mouth')).toHaveAttribute('d', smile)
    expect(container.querySelector('.boo__brow')).toBeNull()
    expect(container.querySelector('.boo__thought-gaze')).not.toBeNull()
    expect(container.querySelectorAll('.boo__shine')).toHaveLength(2)
  })
  it('cada estado monta as partes que o caracterizam', () => {
    const parts: Record<BooMood, string[]> = {
      idle: ['.boo__eye', '.boo__reference-mouth'],
      coding: ['.boo__typing', '.boo__eye'],
      thinking: ['.boo__reference-mouth', '.boo__thought-gaze', '[data-boo-prop="thought"]'],
      speaking: ['.boo__talk', '.boo__talk-lines'],
      done: ['[data-boo-prop="check"]', '.boo__eye-line'],
      happy: ['.boo__reference-mouth', '.boo__eye-line'],
      boop: ['.boo__eye-line', '.boo__reference-mouth'],
      dizzy: ['.boo__spiral', '[data-boo-prop="stars"]'],
      love: ['.boo__heart-eye', '[data-boo-prop="hearts"]'],
      surprised: ['[data-boo-prop="sparks"]', '.boo__brow'],
      sleep: ['.boo__snore', '.boo__eye-line', '[data-boo-prop="zzz"]'],
    }
    expect(BOO_MOODS).toHaveLength(11)
    for (const mood of BOO_MOODS) {
      const container = draw(mood)
      expect(container.querySelector('svg')).toHaveAttribute('data-mood', mood)
      for (const selector of parts[mood]) expect(container.querySelector(selector), `${mood}: ${selector}`).not.toBeNull()
      expect(container.querySelector('[data-boo-prop="finger"]')).toBeNull()
      expect(container.querySelector('svg')?.textContent).toBe('')
    }
  })

  it('mostra mãos soltas somente nos estados que pedem um gesto', () => {
    expect(draw('idle').querySelectorAll('.boo__hand')).toHaveLength(0)
    expect(draw('boop').querySelectorAll('.boo__hand')).toHaveLength(0)
    expect(draw('coding').querySelectorAll('.boo__hand')).toHaveLength(2)
    expect(draw('thinking').querySelectorAll('.boo__hand')).toHaveLength(0)
    expect(draw('done').querySelectorAll('.boo__hand')).toHaveLength(1)
    const sleep = draw('sleep')
    expect(sleep.querySelectorAll('.boo__hand')).toHaveLength(0)
    // A cabeça continua montada; dormir usa respiração e olhos fechados.
    expect(sleep.querySelector('svg[data-mood="sleep"] .boo__pose')).not.toBeNull()
  })

  it('simplifica em tamanhos pequenos: sem efeitos nem detalhes finos', () => {
    for (const mood of BOO_MOODS) {
      const container = draw(mood, 20)
      expect(container.querySelector('svg')).toHaveAttribute('data-size', 's')
      expect(container.querySelector('[data-boo-prop]'), mood).toBeNull()
      expect(container.querySelector('.boo__prompt')).toBeNull()
      expect(container.querySelector('.boo__cup-icon')).toBeNull()
    }
    expect(draw('idle', 64).querySelector('svg')).toHaveAttribute('data-size', 'm')
    expect(draw('idle', 200).querySelector('.boo__headset')).toBeNull()
  })

  it('aceita cores por propriedade e mantém a cabeça livre', () => {
    const { container } = render(<BooFigure mood="idle" size={64} label="Boo" colors={{ body: '#112233', accent: '#00ff00' }} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.style.getPropertyValue('--boo-body')).toBe('#112233')
    expect(svg.style.getPropertyValue('--boo-accent')).toBe('#00ff00')
    expect(svg.style.getPropertyValue('--boo-outline')).toBe('#1a1a1f')
    expect(container.querySelector('[data-boo-accessory="headset"]')).toBeNull()
  })
})
