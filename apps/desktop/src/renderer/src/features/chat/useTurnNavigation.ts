import { useCallback, useLayoutEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Turn } from './turns'

/** Mantém a navegação entre turnos alinhada ao layout real da lista virtualizada. */
export function useTurnNavigation({ turns, offsets, visibleTurns, scrollTop, scrollRef, turnNodes, setScrollTop, setHasNewMessages, stickToBottom }: {
  turns: Turn[]
  offsets: number[]
  visibleTurns: Turn[]
  scrollTop: number
  scrollRef: RefObject<HTMLDivElement | null>
  turnNodes: RefObject<Map<string, HTMLDivElement>>
  setScrollTop: Dispatch<SetStateAction<number>>
  setHasNewMessages: Dispatch<SetStateAction<boolean>>
  stickToBottom: RefObject<boolean>
}) {
  const pendingTurnNavigation = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = pendingTurnNavigation.current
    const element = scrollRef.current
    const node = id ? turnNodes.current.get(id) : undefined
    if (!id || !element || !node) return
    pendingTurnNavigation.current = null
    const top = element.scrollTop + node.getBoundingClientRect().top - element.getBoundingClientRect().top + 1
    if (Math.abs(element.scrollTop - top) > 1) {
      element.scrollTop = top
      setScrollTop(top)
    }
  }, [scrollTop, visibleTurns, scrollRef, turnNodes, setScrollTop])

  return useCallback((index: number) => {
    const element = scrollRef.current
    if (!element || index < 0 || index >= turns.length) return
    const id = turns[index]!.id
    pendingTurnNavigation.current = id
    const targetNode = turnNodes.current.get(id)
    const targetRect = targetNode?.getBoundingClientRect()
    const scrollRect = element.getBoundingClientRect()
    const hasMeasuredLayout = !!targetRect && (targetRect.top !== 0 || scrollRect.top !== 0 || element.scrollTop !== 0 || index === 0)
    const top = hasMeasuredLayout
      ? element.scrollTop + targetRect!.top - scrollRect.top + 1
      : (offsets[index] || 0) + 1
    stickToBottom.current = index === turns.length - 1
    element.scrollTop = top
    setScrollTop(top)
    setHasNewMessages(false)
  }, [turns, offsets, scrollRef, turnNodes, setScrollTop, setHasNewMessages, stickToBottom])
}
