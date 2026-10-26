import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_THEME, resolveThemeName, type ColorMode, type ThemeId } from '@/components/theme-catalog'

// 'system' continua aceito para preferências já salvas; a interface oferece apenas Light e Dark.
type ThemeMode = ColorMode | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultMode?: ThemeMode
  defaultTheme?: string
  storageKey?: string
}

type ThemeProviderState = {
  mode: ThemeMode
  /** Modo efetivamente aplicado, já resolvido quando a preferência salva é 'system'. */
  resolvedMode: ColorMode
  theme: ThemeId
  setMode: (mode: ThemeMode) => void
  setTheme: (theme: string) => void
}

const initialState: ThemeProviderState = {
  mode: 'system',
  resolvedMode: 'dark',
  theme: DEFAULT_THEME,
  setMode: () => null,
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const systemMode = (): ColorMode => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export function ThemeProvider({
  children,
  defaultMode = 'system',
  defaultTheme = DEFAULT_THEME,
  storageKey = 'politron-ui-theme',
}: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(storageKey + '-mode')
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : defaultMode
  })
  const [theme, setThemeState] = useState<ThemeId>(() =>
    resolveThemeName(localStorage.getItem(storageKey + '-name') || defaultTheme),
  )
  const [system, setSystem] = useState<ColorMode>(systemMode)
  const resolvedMode = mode === 'system' ? system : mode

  useEffect(() => {
    if (mode !== 'system') return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const sync = () => setSystem(systemMode())
    media?.addEventListener?.('change', sync)
    return () => media?.removeEventListener?.('change', sync)
  }, [mode])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedMode)
    root.setAttribute('data-theme', theme)
    // Paletas aposentadas migram para o tema registrado; o modo salvo fica intacto.
    localStorage.setItem(storageKey + '-name', theme)
  }, [resolvedMode, theme, storageKey])

  const value: ThemeProviderState = {
    mode,
    resolvedMode,
    theme,
    setMode: nextMode => {
      localStorage.setItem(storageKey + '-mode', nextMode)
      setMode(nextMode)
    },
    setTheme: nextTheme => {
      const resolved = resolveThemeName(nextTheme)
      localStorage.setItem(storageKey + '-name', resolved)
      setThemeState(resolved)
    },
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export const useTheme = () => useContext(ThemeProviderContext)
