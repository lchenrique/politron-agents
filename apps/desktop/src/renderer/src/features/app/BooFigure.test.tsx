import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BOO_MOODS, BooFigure, type BooMood } from './BooFigure'

const draw = (mood: BooMood, size = 200) => render(<BooFigure mood={mood} size={size} label={mood} animate />).container

describe('Boo / 11 estados', () => {
  it('cada estado monta as partes que o caracterizam', () => {
    const parts: Record<BooMood, string[]> = {
      idle: ['.boo__eye', '.boo__tongue'],
      coding: ['[data-boo-prop="keyboard"]', '[data-boo-prop="code"]', '.boo__brow'],
      thinking: ['[data-boo-prop="bulb"]', '.boo__q', '.boo__brow'],
      speaking: ['.boo__talk', '.boo__talk-lines'],
      done: ['[data-boo-prop="check"]', '.boo__eye-line'],
      happy: ['[data-boo-prop="confetti"]', '.boo__eye-line'],
      boop: ['[data-boo-prop="confetti"]', '[data-boo-prop="finger"]'],
      dizzy: ['.boo__spiral', '[data-boo-prop="stars"]'],
      love: ['.boo__heart-eye', '[data-boo-prop="hearts"]'],
      surprised: ['[data-boo-prop="sparks"]', '.boo__brow'],
      sleep: ['[data-boo-prop="zzz"]', '.boo__eye-line'],
    }
    expect(BOO_MOODS).toHaveLength(11)
    for (const mood of BOO_MOODS) {
      const container = draw(mood)
      expect(container.querySelector('svg')).toHaveAttribute('data-mood', mood)
      for (const selector of parts[mood]) expect(container.querySelector(selector), `${mood}: ${selector}`).not.toBeNull()
      // Nenhum texto de legenda: o único texto permitido são os "z" do cochilo.
      expect(container.querySelector('svg')?.textContent).toBe(mood === 'sleep' ? 'zZZ' : '')
    }
  })

  it('posa os braços por estado e deita o corpo para dormir', () => {
    const arm = (mood: BooMood) => draw(mood).querySelector('.boo__arm--r') as SVGGElement
    expect(arm('idle').style.transform).toContain('rotate(-38deg)')
    expect(arm('done').dataset.front).toBe('true')
    expect(arm('love').dataset.front).toBe('true')
    expect(arm('idle').dataset.front).toBe('false')
    const sleep = draw('sleep')
    expect(sleep.querySelectorAll('.boo__z')).toHaveLength(3)
    // A pose horizontal vem do CSS para [data-mood="sleep"] .boo__pose.
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
    expect(draw('idle', 200).querySelector('.boo__prompt')).not.toBeNull()
  })

  it('aceita cores por propriedade e sem headset', () => {
    const { container } = render(<BooFigure mood="idle" size={64} label="Boo" headset={false} colors={{ body: '#112233', accent: '#00ff00' }} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.style.getPropertyValue('--boo-body')).toBe('#112233')
    expect(svg.style.getPropertyValue('--boo-accent')).toBe('#00ff00')
    expect(svg.style.getPropertyValue('--boo-outline')).toBe('#1a1a1f')
    expect(container.querySelector('[data-boo-accessory="headset"]')).toBeNull()
  })
})
