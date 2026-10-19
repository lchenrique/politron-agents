import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/v9'
import { PoliAvatar } from './PoliAvatar'

afterEach(() => vi.unstubAllGlobals())

it('pausa fora da tela e com a janela oculta; retoma o mascote visível sem exigir hover', () => {
  let notify!: IntersectionObserverCallback
  const observe = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = callback }
    observe = observe
    unobserve = vi.fn()
    disconnect = vi.fn()
  })
  const agent = { id: 'a', name: 'Poli', color: '#786bea' } as Agent
  render(<><PoliAvatar agent={agent} size={160} /><PoliAvatar agent={{ ...agent, name: 'Pequeno' }} size={30} state="working" motionPolicy="never" /></>)
  const element = screen.getByRole('img', { name: 'Poli — idle' }).parentElement!
  const small = screen.getByRole('img', { name: 'Pequeno — coding' }).parentElement!
  expect(observe).toHaveBeenCalledTimes(1)
  expect(small.dataset.motionActive).toBe('false')
  expect(element.dataset.motionActive).toBe('true')
  const intersect = (visible: boolean) => act(() => notify([{
    target: element, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
    time: 0, boundingClientRect: element.getBoundingClientRect(), intersectionRect: element.getBoundingClientRect(), rootBounds: null,
  }], {} as IntersectionObserver))
  intersect(false)
  expect(element.dataset.motionActive).toBe('false')
  intersect(true)
  expect(element.dataset.motionActive).toBe('true')
  const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(element.dataset.motionActive).toBe('false')
  hidden.mockReturnValue('visible')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(element.dataset.motionActive).toBe('true')
  hidden.mockRestore()
})
