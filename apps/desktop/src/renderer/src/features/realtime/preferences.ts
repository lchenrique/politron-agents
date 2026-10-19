import { useCallback, useEffect, useState } from 'react'
import type { RealtimeMode } from '../../../../shared/realtime'
const EVENT = 'boobot:voice-settings-changed'
export function notifyVoiceSettings(): void {
  localStorage.setItem('politron.realtime.settings-version', String(Date.now()))
  window.dispatchEvent(new Event(EVENT))
}
export function useVoicePreferences() {
  const read = () => ({ mode: (localStorage.getItem('politron.realtime.mode') === 'free' ? 'free' : 'gemini') as RealtimeMode, headphones: localStorage.getItem('politron.realtime.headphones') === 'true' })
  const [preferences, setPreferences] = useState(read), [refreshToken, setRefreshToken] = useState(0)
  useEffect(() => {
    const sync = () => { setPreferences(read()); setRefreshToken(value => value + 1) }
    const storage = (event: StorageEvent) => { if (event.key?.startsWith('politron.realtime.')) sync() }
    window.addEventListener(EVENT, sync); window.addEventListener('storage', storage)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', storage) }
  }, [])
  const setMode = useCallback((mode: RealtimeMode) => { localStorage.setItem('politron.realtime.mode', mode); notifyVoiceSettings() }, [])
  const setHeadphones = useCallback((value: boolean) => { localStorage.setItem('politron.realtime.headphones', String(value)); notifyVoiceSettings() }, [])
  return { ...preferences, refreshToken, setMode, setHeadphones }
}
