import { useEffect, useState, type RefObject } from 'react'

const avatars = new Map<Element, { visible: boolean; notify: (active: boolean) => void }>()
let observer: IntersectionObserver | null = null
const pageVisible = () => document.visibilityState !== 'hidden'
function onVisibilityChange() {
  for (const avatar of avatars.values()) avatar.notify(avatar.visible && pageVisible())
}

/** Um observador e um listener por janela, somente para mascotes que podem animar. */
export function useAvatarActivity(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [active, setActive] = useState(pageVisible)
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    if (!avatars.size) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const avatar = avatars.get(entry.target)
          if (!avatar) continue
          avatar.visible = entry.isIntersecting
          avatar.notify(avatar.visible && pageVisible())
        }
      })
    }
    avatars.set(element, { visible: true, notify: setActive })
    setActive(pageVisible())
    observer?.observe(element)
    return () => {
      observer?.unobserve(element)
      avatars.delete(element)
      if (!avatars.size) {
        observer?.disconnect(); observer = null
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  }, [ref, enabled])
  return enabled && active
}
