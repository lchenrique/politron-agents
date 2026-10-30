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

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Poli / avatar de agente', () => {
  it('usa o rosto original SVG e altera expressão de acordo com trabalho e espera', () => {
    const { rerender } = render(<PoliAvatar agent={agent} size={48} state="working" />)
    expect(screen.getByRole('img', { name: 'Poli — coding' })).toBeInTheDocument()
    rerender(<PoliAvatar agent={agent} size={48} state="waiting" />)
    expect(screen.getByRole('img', { name: 'Poli — thinking' })).toBeInTheDocument()
  })
  it('desenha o Boo com headset por padrão e mantém acessórios encaixados na cabeça nova', () => {
    const { container, rerender } = render(<PoliAvatar agent={{ ...agent, pitsShape: 'drop', pitsAccessory: 'glasses' }} size={80} />)
    expect(container.querySelector('[data-shape="drop"]')).toBeInTheDocument()
    expect(screen.getByLabelText('Headset do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos do Boo')).toBeInTheDocument()
    // Braços são caminhos separados (atrás e por cima do corpo) para posar em cada estado.
    expect(container.querySelectorAll('.boo__arm--l path')).toHaveLength(2)
    expect(container.querySelectorAll('.boo__arm--r path')).toHaveLength(2)
    // Sem filtro de turbulência do visual antigo.
    expect(container.querySelector('feTurbulence')).toBeNull()
    rerender(<PoliAvatar agent={{ ...agent, pitsAccessory: 'horns', pitsHeadset: false }} size={80} />)
    expect(screen.getByLabelText('Chifres do Boo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Headset do Boo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Óculos do Boo')).not.toBeInTheDocument()
  })
  it('expõe no Boo Studio as cores do corpo, olhos, bochechas, destaque e o headset', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher cor #ffffff' }))
    expect(onChange).toHaveBeenCalledWith({ color: '#ffffff' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Usar headset' }))
    expect(onChange).toHaveBeenCalledWith({ pitsHeadset: false })
    for (const name of ['Cor do Boo', 'Cor dos olhos', 'Cor das bochechas', 'Cor de destaque']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    // Olho branco era o padrão dos corpos coloridos antigos: aparece como o escuro novo.
    expect(screen.getByRole('button', { name: 'Cor dos olhos' })).toHaveTextContent('#0d0d12')
    expect(screen.queryByRole('group', { name: 'Formatos pré-definidos' })).toBeNull()
    expect(screen.queryByText('Largura do corpo')).toBeNull()
  })
  it('aplica as cores do agente pelas variáveis CSS do Boo', () => {
    const { container, rerender } = render(<PoliAvatar agent={{ ...agent, pitsEyeColor: '#ffffff' }} size={120} />)
    const svg = () => container.querySelector('svg.boo') as SVGElement
    expect(svg().style.getPropertyValue('--boo-body')).toBe('#786bea')
    expect(svg().style.getPropertyValue('--boo-eye')).toBe('#0d0d12')
    expect(svg().style.getPropertyValue('--boo-blush')).toBe('#f7a1b5')
    expect(svg().style.getPropertyValue('--boo-accent')).toBe('#3aa7ff')
    rerender(<PoliAvatar agent={{ ...agent, color: '', pitsEyeColor: '#223344', pitsCheekColor: '#ff0000', pitsAccentColor: '#ff8800' }} size={120} />)
    expect(svg().style.getPropertyValue('--boo-body')).toBe('#ffffff')
    expect(svg().style.getPropertyValue('--boo-eye')).toBe('#223344')
    expect(svg().style.getPropertyValue('--boo-blush')).toBe('#ff0000')
    expect(svg().style.getPropertyValue('--boo-accent')).toBe('#ff8800')
    expect(svg().style.getPropertyValue('--boo-accent-2')).toContain('#ff8800')
  })
  it('restaura os valores visuais do Boo novo, sem mudar identidade', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()
    render(<PoliCustomizer agent={{ ...agent, pitsShape: 'ghost-wave', pitsBodyWidth: 1.25, pitsMouthSize: 1.5 }} onChange={onChange} onReset={onReset} />)
    expect(screen.getByText('Intensidade do rosado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar aparência' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      color: '#ffffff', pitsEyeColor: '#0d0d12', pitsCheekColor: '#f7a1b5', pitsAccentColor: '#3aa7ff', pitsHeadset: true,
      pitsShape: 'ghost-wave', pitsBodyWidth: 1, pitsBodyHeight: 1, pitsMouthSize: 1, pitsBlushStrength: .45, pitsAccessory: 'none',
    }))
    expect(onReset).toHaveBeenCalledOnce()
  })
  it('permite combinar fone ou chapéu com óculos, mas não dois acessórios de cabeça', () => {
    const { rerender } = render(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'headphones', pitsFaceAccessory: 'glasses' }} size={100} />)
    expect(screen.getByLabelText('Fone de ouvido do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos do Boo')).toBeInTheDocument()
    // O fone de ouvido substitui o headset embutido.
    expect(screen.queryByLabelText('Headset do Boo')).not.toBeInTheDocument()
    rerender(<PoliAvatar agent={{ ...agent, pitsHeadAccessory: 'cap', pitsFaceAccessory: 'round-glasses' }} size={100} />)
    expect(screen.getByLabelText('Boné do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Óculos redondos do Boo')).toBeInTheDocument()
    expect(screen.getByLabelText('Headset do Boo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fone de ouvido do Boo')).not.toBeInTheDocument()
  })
  it('oferece cabeças e rostos separados', () => {
    const onChange = vi.fn()
    render(<PoliCustomizer agent={agent} onChange={onChange} />)
    fireEvent.click(screen.getByRole('group', { name: 'Acessórios de cabeça' }).querySelector('button:nth-child(11)')!)
    expect(onChange).toHaveBeenCalledWith({ pitsHeadAccessory: 'headphones', pitsAccessory: 'none' })
    fireEvent.click(screen.getByRole('group', { name: 'Acessórios de rosto' }).querySelector('button:nth-child(2)')!)
    expect(onChange).toHaveBeenCalledWith({ pitsFaceAccessory: 'glasses', pitsAccessory: 'none' })
  })
  it('respeita opções visuais e animação desligada', () => {
    const { container } = render(<PoliAvatar agent={{ ...agent, pitsBlush: false, pitsAnimate: false }} />)
    expect(container.querySelector('.poli-avatar[data-animate="false"]')).not.toBeNull()
    expect(container.querySelector('svg.boo[data-animate="false"]')).not.toBeNull()
    expect(container.querySelector('.boo__blush')).toBeNull()
    expect(container.querySelectorAll('.boo__eye')).toHaveLength(2)
  })
  it('marca o avatar quando o sistema prefere menos movimento', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
    render(<PoliAvatar agent={agent} size={56} />)
    expect(avatarOf().dataset.reducedMotion).toBe('true')
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
    expect(avatarOf().querySelectorAll('.boo__spiral')).toHaveLength(2)
    expect(avatarOf().querySelector('[data-boo-prop="stars"]')).not.toBeNull()
  })

  it('fica apaixonado com carinho de um lado para o outro', () => {
    render(<PoliAvatar agent={agent} size={56} />)
    fireEvent.pointerEnter(avatarOf(), { clientX: 100 })
    for (const x of [120, 100, 120, 100, 120, 100]) fireEvent.pointerMove(avatarOf(), { clientX: x })
    expect(screen.getByRole('img', { name: 'Poli — love' })).toBeInTheDocument()
    expect(avatarOf().querySelectorAll('.boo__heart')).toHaveLength(4)
    expect(avatarOf().querySelectorAll('.boo__heart-eye')).toHaveLength(2)
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
