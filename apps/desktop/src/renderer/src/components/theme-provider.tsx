import { createContext, useContext, useEffect, useState } from "react"

type ThemeMode = "dark" | "light" | "system"
type ThemeName = string // e.g. "default", "ocean", "politron"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultMode?: ThemeMode
  defaultTheme?: ThemeName
  storageKey?: string
}

type ThemeProviderState = {
  mode: ThemeMode
  theme: ThemeName
  setMode: (mode: ThemeMode) => void
  setTheme: (theme: ThemeName) => void
}

const initialState: ThemeProviderState = {
  mode: "system",
  theme: "default",
  setMode: () => null,
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultMode = "system",
  defaultTheme = "default",
  storageKey = "politron-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem(`${storageKey}-mode`) as ThemeMode) || defaultMode
  )
  const [theme, setTheme] = useState<ThemeName>(
    () => localStorage.getItem(`${storageKey}-name`) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement

    // Manage Mode (.light / .dark)
    root.classList.remove("light", "dark")
    if (mode === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(mode)
    }

    // Manage Theme Name (data-theme="...")
    root.setAttribute("data-theme", theme)
    
  }, [mode, theme])

  const value = {
    mode,
    theme,
    setMode: (mode: ThemeMode) => {
      localStorage.setItem(`${storageKey}-mode`, mode)
      setMode(mode)
    },
    setTheme: (theme: ThemeName) => {
      localStorage.setItem(`${storageKey}-name`, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
