import { useSyncExternalStore } from 'react'

/** O SVG é o renderer de produção até o Rive reproduzir as animações e acessórios com fidelidade. */
const KEY = 'boobot.avatar.renderer'
const EVENT = 'boobot:avatar-renderer-changed'
const listeners = new Set<() => void>()
let registered = false

function notify() { for (const listener of listeners) listener() }
function onStorage(event: StorageEvent) { if (event.key === KEY) notify() }
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!registered) {
    window.addEventListener(EVENT, notify)
    window.addEventListener('storage', onStorage)
    registered = true
  }
  return () => {
    listeners.delete(listener)
    if (registered && !listeners.size) {
      window.removeEventListener(EVENT, notify)
      window.removeEventListener('storage', onStorage)
      registered = false
    }
  }
}
function getSnapshot() {
  try { return localStorage.getItem(KEY) === 'rive' }
  catch { return false }
}
export function useRivePreview() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
export function setRivePreview(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(KEY, 'rive')
    else localStorage.removeItem(KEY)
  } catch { /* fallback SVG */ }
  window.dispatchEvent(new Event(EVENT))
}
