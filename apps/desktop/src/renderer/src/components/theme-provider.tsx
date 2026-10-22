import { createContext, useContext, useEffect, useState } from 'react'
import { resolveThemeName, type ThemeId } from '@/components/theme-catalog'

type ThemeMode = 'dark' | 'light' | 'system'
type ThemeName = ThemeId

type ThemeProviderProps = {
  children: React.ReactNode
  defaultMode?: ThemeMode
  defaultTheme?: string
  storageKey?: string
}

type ThemeProviderState = {
  mode: ThemeMode
  theme: ThemeName
  setMode: (mode: ThemeMode) => void
  setTheme: (theme: string) => void
}

const initialState: ThemeProviderState = {
  mode: 'system',
  theme: 'default',
  setMode: () => null,
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultMode = 'system',
  defaultTheme = 'default',
  storageKey = 'politron-ui-theme',
}: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(storageKey + '-mode')
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : defaultMode
  })
  const [theme, setThemeState] = useState<ThemeName>(() =>
    resolveThemeName(localStorage.getItem(storageKey + '-name') || defaultTheme),
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove('light', 'dark')
    if (mode === 'system') {
      root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } else {
      root.classList.add(mode)
    }

    root.setAttribute('data-theme', theme)
    // Migrate obsolete/unknown saved theme IDs after an app update.
    localStorage.setItem(storageKey + '-name', theme)
  }, [mode, theme, storageKey])

  const value: ThemeProviderState = {
    mode,
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
