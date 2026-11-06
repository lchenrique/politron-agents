import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Navegação entre turnos pelo DOM real: cada turno marca o primeiro elemento com `data-turn-start`. */
export function useTurnNavigation(viewport: RefObject<HTMLElement | null>) {
  const [activeIndex, setActiveIndex] = useState(0)
  const frame = useRef<number | null>(null)
  const starts = () => Array.from(viewport.current?.querySelectorAll<HTMLElement>('[data-turn-start]') ?? [])
  const measure = useCallback(() => {
    frame.current = null
    const root = viewport.current
    if (!root) return
    const line = root.getBoundingClientRect().top + 8
    let index = 0
    starts().forEach((element, position) => { if (element.getBoundingClientRect().top <= line) index = position })
    setActiveIndex(index)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = useCallback(() => { if (frame.current === null) frame.current = requestAnimationFrame(measure) }, [measure])
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  const navigate = useCallback((index: number) => {
    const target = starts()[index]
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    setActiveIndex(index)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { activeIndex, onScroll, navigate }
}
