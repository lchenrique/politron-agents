import type { CSSProperties } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { COLOR_MODES, type ColorMode } from '@/components/theme-catalog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ICONS: Record<ColorMode, typeof Sun> = { light: Sun, dark: Moon }

/**
 * Light e Dark do sistema Boobot. `compact` mostra só ícones (barra da janela);
 * o padrão mostra rótulos (Configurações). O tema em si vem do registry e não é escolhido aqui.
 */
export function ThemeSelector({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { resolvedMode, setMode } = useTheme()
  return <div role="radiogroup" aria-label="Modo de cor" className={cn('ds-segmented', compact ? 'w-[60px]' : 'w-56', className)} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
    {COLOR_MODES.map(option => {
      const Icon = ICONS[option.id]
      const checked = resolvedMode === option.id
      return <Button key={option.id} type="button" variant={null} size={null} role="radio" aria-checked={checked} aria-label={option.label} title={option.label}
        tabIndex={checked ? 0 : -1}
        onClick={() => setMode(option.id)}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const next = COLOR_MODES.find(item => item.id !== option.id)!
          setMode(next.id)
          ;(event.currentTarget.parentElement?.querySelector(`[aria-label="${next.label}"]`) as HTMLElement | null)?.focus()
        }}
        className={cn('gap-1.5 rounded-[calc(var(--radius)-1px)] text-xs font-medium focus-visible:ring-0', compact && 'h-6 px-0')}>
        <Icon aria-hidden="true" className="size-3.5" />{!compact && option.label}
      </Button>
    })}
  </div>
}
