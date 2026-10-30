import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar } from './PoliAvatar'
import { PoliCustomizer } from './PoliCustomizer'
import { applyGaze, GAZE_EVENT, SLEEP_AFTER_MS, STARTLE_EVENT } from './usePoliGaze'

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
  it('permite esculpir proporções, escolher silhuetas e acessórios no SVG', () => {
    const { container, rerender } = render(<PoliAvatar agent={{ ...agent, pitsShape: 'drop', pitsAccessory: 'glasses', pitsBodyWidth: 1.2, pitsBodyHeight: .85 }} size={80} />)
    expect(container.querySelector('[data-shape="drop"]')).toBeInTheDocument()
    const scaled = container.querySelector('.poli-avatar__body-transform')
    expect(scaled).toHaveAttribute('transform', 'translate(120 100) scale(1.2 0.85) translate(-120 -100)')
    expect(scaled?.querySelector('.poli-avatar__shape')).toBeInTheDocument()
    // Estilo chapado: sem aura, brilho nem gradiente no corpo.
    expect(scaled?.querySelector('.poli-avatar__aura')).toBeNull()
    expect(container.querySelector('.poli-avatar svg > defs radialGradient')).toBeNull()
    expect(container.querySelector('.poli-avatar__mouth-scale')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos do Boo')).toBeInTheDocument()
    rerender(<PoliAvatar agent={{ ...agent, pitsShape: 'bean', pitsAccessory: 'horns' }} size={80} />)
    expect(container.querySelector('[data-shape="bean"]')).toBeInTheDocument()
    expect(screen.getByLabelText('Chifres do Boo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Óculos do Boo')).not.toBeInTheDocument()
  })
  it('apresenta opções de silhueta, proporção e acessórios no Boo Studio', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gota' }))
    expect(onChange).toHaveBeenCalledWith({ pitsShape: 'drop' })
    fireEvent.click(screen.getByRole('button', { name: 'Óculos' }))
    expect(onChange).toHaveBeenCalledWith({ pitsFaceAccessory: 'glasses', pitsAccessory: 'none' })
    expect(screen.getByText('Largura do corpo')).toBeInTheDocument()
    expect(screen.getByText('Altura do corpo')).toBeInTheDocument()
  })
  it('redimensiona o corpo chapado sem deslocar o pivô central', () => {
    const { container, rerender } = render(<PoliAvatar agent={{ ...agent, pitsShape: 'ghost-wave', pitsBodyWidth: 1.25, pitsBodyHeight: .75, pitsMouthSize: 1.6, pitsBlushStrength: .8 }} size={120} />)
    const body = container.querySelector('.poli-avatar__body-transform')
    expect(body).toHaveAttribute('transform', 'translate(120 100) scale(1.25 0.75) translate(-120 -100)')
    expect(body?.querySelector('.poli-avatar__shape path')).toHaveAttribute('fill', agent.color || '#786bea')
    expect(body?.querySelector('.poli-avatar__shape')).toBeInTheDocument()
    expect(body?.querySelector('.poli-avatar__mouth-scale')).toHaveAttribute('transform', 'translate(120 128) scale(1.6) translate(-120 -128)')
    expect(container.querySelectorAll('ellipse[fill="#f5a5d1"]').length).toBe(2)
    rerender(<PoliAvatar agent={{ ...agent, pitsShape: 'ghost-puff', pitsBodyWidth: .75, pitsBodyHeight: 1.25, pitsAura: false }} size={120} />)
    expect(container.querySelector('.poli-avatar__body-transform')).toHaveAttribute('transform', 'translate(120 100) scale(0.75 1.25) translate(-120 -100)')
    expect(container.querySelector('.poli-avatar__aura')).toBeNull()
    expect(container.querySelector('.poli-avatar__glow')).toBeNull()
  })
  it('oferece presets de fantasminha e restaura os valores visuais, sem mudar identidade', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()
    render(<PoliCustomizer agent={{ ...agent, pitsShape: 'ghost-wave', pitsBodyWidth: 1.25, pitsMouthSize: 1.5 }} onChange={onChange} onReset={onReset} />)
    const presets = screen.getByRole('group', { name: 'Formatos pré-definidos' })
    expect(presets.querySelectorAll('button')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Fofinho' }))
    expect(onChange).toHaveBeenCalledWith({ pitsShape: 'ghost-puff' })
    expect(screen.getByText('Tamanho da boca')).toBeInTheDocument()
    expect(screen.getByText('Intensidade do rosado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar aparência' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      pitsShape: 'ghost-wave', pitsBodyWidth: 1, pitsBodyHeight: 1, pitsMouthSize: 1,
      pitsBlushStrength: .45, pitsAura: true, pitsAccessory: 'none',
    }))
    expect(onReset).toHaveBeenCalledOnce()
  })
  it('permite combinar fone ou chapéu com óculos, mas não dois acessórios de cabeça', () => {
    const { rerender } = render(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'headphones', pitsFaceAccessory: 'glasses' }} size={100} />)
    expect(screen.getByLabelText('Fone de ouvido do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos do Boo')).toBeInTheDocument()
    rerender(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'cap', pitsFaceAccessory: 'round-glasses' }} size={100} />)
    expect(screen.getByLabelText('Boné do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos redondos do Boo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fone de ouvido do Boo')).not.toBeInTheDocument()
  })
  it('oferece cabeças e rostos separados e presets animais', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lulinha' }))
    expect(onChange).toHaveBeenCalledWith({ pitsShape: 'cute-squid' })
    fireEvent.click(screen.getByRole('button', { name: 'Quadradinho' }))
    expect(onChange).toHaveBeenCalledWith({ pitsShape: 'soft-square' })
    fireEvent.click(screen.getByRole('group', { name: 'Acessórios de cabeça' }).querySelector('button:nth-child(11)')!)
    expect(onChange).toHaveBeenCalledWith({ pitsHeadAccessory: 'headphones', pitsAccessory: 'none' })
    fireEvent.click(screen.getByRole('group', { name: 'Acessórios de rosto' }).querySelector('button:nth-child(2)')!)
    expect(onChange).toHaveBeenCalledWith({ pitsFaceAccessory: 'glasses', pitsAccessory: 'none' })
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

  it('envia o deslocamento dos olhos ao renderer Rive quando está visível', () => {
    const element = document.createElement('span')
    element.dataset.riveActive = 'true'
    box(element, 100, 100, 100)
    const gaze = vi.fn()
    element.addEventListener(GAZE_EVENT, gaze)
    applyGaze(element, 260, 150)
    expect(gaze).toHaveBeenCalledOnce()
    expect((gaze.mock.calls[0][0] as CustomEvent).detail.x).toBeGreaterThan(0)
    applyGaze(element, 900, 900)
    expect((gaze.mock.calls[1][0] as CustomEvent).detail).toEqual({ x: 0, y: 0 })
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
