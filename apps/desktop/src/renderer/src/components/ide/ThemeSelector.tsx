import { useTheme } from '@/components/theme-provider'
import { THEME_GROUPS } from '@/components/theme-catalog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Moon, Palette, Sun } from 'lucide-react'

/** Compact, categorized selector. All entries have a light and a dark palette. */
export function ThemeSelector() {
  const { theme, setTheme, mode, setMode } = useTheme()

  return (
    <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger aria-label="Selecionar tema" className="h-8 w-[158px] gap-1.5 rounded-md border-border/70 bg-card/70 px-2 text-xs font-medium shadow-none transition-colors hover:bg-accent/50 focus:ring-1 focus:ring-ring/40">
          <Palette aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Tema" />
        </SelectTrigger>
        <SelectContent align="end" className="max-h-[min(75vh,490px)] min-w-[230px] border-border/70 bg-popover p-1 shadow-xl">
          {THEME_GROUPS.map((group, index) => (
            <SelectGroup key={group.label}>
              {index > 0 && <SelectSeparator className="my-1.5" />}
              <SelectLabel className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </SelectLabel>
              {group.themes.map(item => (
                <SelectItem key={item.id} value={item.id} className="min-h-9 rounded-md py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full border border-black/10 ring-1 ring-white/15" style={{ backgroundColor: item.swatch }} />
                    <span className="truncate font-medium" title={item.description}>{item.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        className="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        aria-label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        title={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      >
        {mode === 'dark' ? <Moon aria-hidden="true" className="size-4" /> : <Sun aria-hidden="true" className="size-4" />}
      </Button>
    </div>
  )
}
