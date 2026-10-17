import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar } from './PoliAvatar'
import { PoliCustomizer } from './PoliCustomizer'
import { applyGaze, SLEEP_AFTER_MS, STARTLE_EVENT } from './usePoliGaze'

// jsdom não implementa PointerEvent; sem isso o Testing Library descarta clientX.
if (typeof window.PointerEvent === 'undefined') Object.defineProperty(window, 'PointerEvent', { configurable: true, value: class extends MouseEvent {} })

const agent: Agent = {
  id: 'poli-1', name: 'Poli', alias: 'poli', description: '', instructions: 'Responder.',
  runtime: 'codex', model: '', color: '#786bea', avatar: '',
  canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: ''
}

const box = (element: HTMLElement, left: number, top: number, size: number) =>
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left, top, width: size, height: size, right: left + size, bottom: top + size, x: left, y: top, toJSON: () => ({}) } as DOMRect)

const avatarOf = () => screen.getByRole('img').parentElement!

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

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

describe('interação do Pits com o mouse', () => {
  it('sorri ao passar o mouse e volta ao normal ao sair', () => {
    render(<PoliAvatar agent={agent} size={56} />)
    fireEvent.pointerEnter(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — happy' })).toBeInTheDocument()
    expect(avatarOf().dataset.hover).toBe('true')
    fireEvent.pointerLeave(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — idle' })).toBeInTheDocument()
  })

  it('mantém a expressão escolhida no editor mesmo com o mouse em cima ou clicando', () => {
    render(<PoliAvatar agent={agent} size={56} expression="coding" />)
    fireEvent.pointerEnter(avatarOf())
    fireEvent.pointerDown(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — coding' })).toBeInTheDocument()
  })

  it('olha e inclina na direção do cursor quando ele chega perto', () => {
    const element = document.createElement('span')
    box(element, 100, 100, 56)
    applyGaze(element, 228, 128)
    expect(Number(element.style.getPropertyValue('--poli-look-x'))).toBeGreaterThan(0)
    expect(Number(element.style.getPropertyValue('--poli-look-y'))).toBe(0)
    expect(parseFloat(element.style.getPropertyValue('--poli-lean'))).toBeGreaterThan(0)
    expect(element.dataset.near).toBe('true')
  })

  it('volta a olhar para frente quando o cursor está longe', () => {
    const element = document.createElement('span')
    box(element, 100, 100, 56)
    applyGaze(element, 900, 128)
    expect(element.style.getPropertyValue('--poli-look-x')).toBe('0')
    expect(element.dataset.near).toBe('false')
  })

  it('assusta só quando o cursor entra rápido no raio', () => {
    const element = document.createElement('span')
    const startled = vi.fn()
    element.addEventListener(STARTLE_EVENT, startled)
    box(element, 100, 100, 56)
    applyGaze(element, 228, 128, 0.5)
    applyGaze(element, 900, 128)
    applyGaze(element, 228, 128, 3)
    applyGaze(element, 200, 128, 3)
    expect(startled).toHaveBeenCalledTimes(1)
  })

  it('segue o ponteiro da janela quando montado', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1 })
    render(<PoliAvatar agent={agent} size={56} />)
    box(avatarOf(), 100, 100, 56)
    await act(async () => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 128, clientY: 20 })) })
    expect(Number(avatarOf().style.getPropertyValue('--poli-look-y'))).toBeLessThan(0)
  })
})

describe('reações do Pits', () => {
  it('leva um boop no clique e volta ao normal depois', () => {
    vi.useFakeTimers()
    render(<PoliAvatar agent={agent} size={56} />)
    fireEvent.pointerDown(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — boop' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByRole('img', { name: 'Poli — idle' })).toBeInTheDocument()
  })

  it('fica tonto com três cliques rápidos', () => {
    render(<PoliAvatar agent={agent} size={56} />)
    fireEvent.pointerDown(avatarOf())
    fireEvent.pointerDown(avatarOf())
    fireEvent.pointerDown(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — dizzy' })).toBeInTheDocument()
    expect(avatarOf().querySelectorAll('.poli-avatar__spin')).toHaveLength(2)
  })

  it('fica apaixonado com carinho de um lado para o outro', () => {
    render(<PoliAvatar agent={agent} size={56} />)
    fireEvent.pointerEnter(avatarOf(), { clientX: 100 })
    for (const x of [120, 100, 120, 100, 120, 100]) fireEvent.pointerMove(avatarOf(), { clientX: x })
    expect(screen.getByRole('img', { name: 'Poli — love' })).toBeInTheDocument()
    expect(avatarOf().querySelectorAll('.poli-avatar__heart')).toHaveLength(3)
  })

  it('leva um susto quando o cursor chega rápido', () => {
    render(<PoliAvatar agent={agent} size={56} />)
    act(() => { avatarOf().dispatchEvent(new CustomEvent(STARTLE_EVENT)) })
    expect(screen.getByRole('img', { name: 'Poli — surprised' })).toBeInTheDocument()
  })

  it('cochila quando o usuário fica parado e acorda ao mexer o mouse', () => {
    vi.useFakeTimers()
    render(<PoliAvatar agent={agent} size={56} />)
    act(() => { vi.advanceTimersByTime(SLEEP_AFTER_MS + 5_000) })
    expect(screen.getByRole('img', { name: 'Poli — sleep' })).toBeInTheDocument()
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 900 })) })
    expect(screen.getByRole('img', { name: 'Poli — idle' })).toBeInTheDocument()
  })

  it('não reage com animação desligada nem enquanto trabalha', () => {
    const { rerender } = render(<PoliAvatar agent={{ ...agent, pitsAnimate: false }} size={56} />)
    fireEvent.pointerDown(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — idle' })).toBeInTheDocument()
    rerender(<PoliAvatar agent={agent} size={56} state="working" />)
    fireEvent.pointerDown(avatarOf())
    expect(screen.getByRole('img', { name: 'Poli — coding' })).toBeInTheDocument()
  })
})
