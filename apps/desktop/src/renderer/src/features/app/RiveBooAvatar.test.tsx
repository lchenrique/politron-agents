import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RiveBooAvatar } from './RiveBooAvatar'

const state = vi.hoisted(() => ({ number: vi.fn(), color: vi.fn(), onReady: vi.fn(), play: vi.fn(), pause: vi.fn() }))

vi.mock('@rive-app/canvas', () => ({
  RuntimeLoader: { setWasmUrl: vi.fn(), setWasmFallbackUrl: vi.fn() },
}))
vi.mock('@rive-app/react-canvas', () => ({
  Fit: { Contain: 'contain' },
  Layout: class Layout {},
  useRive: () => ({ rive: { play: state.play, pause: state.pause }, RiveComponent: () => <canvas data-testid="rive" /> }),
  useViewModel: () => ({}),
  useViewModelInstance: () => ({}),
  useViewModelInstanceColor: (name: string) => ({ setRgb: (...args: unknown[]) => state.color(name, ...args), setRgba: (...args: unknown[]) => state.color(name, ...args) }),
  useViewModelInstanceNumber: (name: string) => ({ setValue: (value: number) => state.number(name, value) }),
}))
const props = {
  shape: 'ghost-wave',
  color: '#786bea',
  eyeColor: '#ffffff',
  cheekColor: '#f5a5d1',
  blushOpacity: .45,
  headAccessory: 'cap',
  faceAccessory: 'none',
  speaking: false,
  expression: 'idle' as const,
  mood: 'idle', eyeSize: 8, eyeSpacing: 26, mouthSize: 1, bodyWidth: 1, bodyHeight: 1, showAura: true, showBlush: true,
  playing: true,
  visible: true,
  onReady: state.onReady,
}

beforeEach(() => { vi.clearAllMocks() })

describe('Rive experimental: motion composite and state overlays', () => {
  it('draws stationary shadow as a sibling of the shared float/lean (with the cap inside)', () => {
    const { container } = render(<RiveBooAvatar {...props} />)
    const shadow = container.querySelector('.poli-avatar__rive-shadow')
    const float = container.querySelector('.poli-avatar__rive-float')
    const lean = container.querySelector('.poli-avatar__rive-lean')
    expect(shadow).toBeInTheDocument()
    expect(shadow?.parentElement).toBe(float?.parentElement)
    expect(float?.contains(shadow)).toBe(false)
    expect(lean?.contains(screen.getByTestId('rive'))).toBe(true)
    expect(lean?.querySelector('[aria-label="Boné do Boo"]')).toBeTruthy()
    expect(shadow?.querySelector('ellipse')).toHaveAttribute('rx', '54')
    expect(state.onReady).toHaveBeenCalledWith(true)
    expect(state.number).toHaveBeenCalledWith('smileOpacity', 1)
  })

  it('maintains the same Rive body while working, thinking and finishing, with SVG-only details above it', () => {
    const { container, rerender } = render(<RiveBooAvatar {...props} expression="coding" />)
    expect(container.querySelectorAll('.poli-avatar__finger')).toHaveLength(3)
    expect(state.number).toHaveBeenCalledWith('smileOpacity', 0)
    rerender(<RiveBooAvatar {...props} expression="thinking" />)
    expect(container.querySelector('.poli-avatar__thought')).toBeInTheDocument()
    expect(container.querySelectorAll('.poli-avatar__finger')).toHaveLength(0)
    rerender(<RiveBooAvatar {...props} expression="done" />)
    expect(container.querySelector('path[d="M172 42 l8 8 14 -17"]')).toBeInTheDocument()
    expect(screen.getByTestId('rive')).toBeInTheDocument()
  })

  it('monta os mesmos acessórios do SVG com encaixe específico para formato e proporções no Rive', () => {
    const { container } = render(<RiveBooAvatar {...props} shape="little-cat" headAccessory="horns" faceAccessory="heart-glasses" bodyWidth={1.2} bodyHeight={.85} eyeSize={12} eyeSpacing={34} />)
    const layer = container.querySelector('.poli-avatar__rive-accessory')
    const head = layer?.querySelector('[data-boo-accessory="horns"]')
    const face = layer?.querySelector('[data-boo-accessory="heart-glasses"]')
    expect(head).toBeInTheDocument()
    expect(face).toBeInTheDocument()
    const position = head?.querySelector('g[transform]')?.getAttribute('transform')
    expect(position).toMatch(/^translate\(/)
    expect(position).not.toMatch(/NaN|Infinity/)
    expect(layer?.innerHTML).not.toMatch(/NaN|Infinity/)
  })
  it('mostra detalhes das reações no modo Rive sem desmontar o corpo', () => {
    const { container } = render(<RiveBooAvatar {...props} mood="love" />)
    expect(container.querySelector('.poli-avatar__heart')).toBeInTheDocument()
    expect(screen.getByTestId('rive')).toBeInTheDocument()
  })

  it('does not show a smile behind the speaking mouth', () => {
    render(<RiveBooAvatar {...props} expression="idle" speaking />)
    expect(state.number).toHaveBeenCalledWith('smileOpacity', 0)
    expect(state.number).toHaveBeenCalledWith('talkOpacity', 1)
  })
})
