import type { KeyboardEvent } from 'react'
import { CalendarClock, ClipboardList, LayoutDashboard, Settings2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Visões globais da área principal; as sessões e projetos ficam na barra lateral. */
export type HomeView = 'home' | 'routines' | 'board' | 'settings'

interface RailItem {
  id: string
  label: string
  icon: LucideIcon
  /** `top`: visões globais; `bottom`: no fim da faixa (Configurações). */
  placement: 'top' | 'bottom'
  active: boolean
  onSelect: () => void
  /** Contagem no canto do ícone (pendências, tarefas abertas...). */
  badge?: number
  badgeLabel?: string
}

export interface NavRailProps {
  view: HomeView | null
  chiefName?: string
  attentionCount: number
  openTasks: number
  enabledRoutines: number
  onOpenHome: (view: HomeView) => void
}

/** Faixa vertical de ícones à esquerda: para novo item, acrescente uma entrada em `railItems`. */
export function railItems(props: NavRailProps): RailItem[] {
  return [
    { id: 'home', label: `Central do ${props.chiefName || 'Chief'}`, icon: LayoutDashboard, placement: 'top', active: props.view === 'home', onSelect: () => props.onOpenHome('home'), badge: props.attentionCount, badgeLabel: `${props.attentionCount} pendências` },
    { id: 'board', label: 'Board da empresa', icon: ClipboardList, placement: 'top', active: props.view === 'board', onSelect: () => props.onOpenHome('board'), badge: props.openTasks, badgeLabel: `${props.openTasks} tarefas abertas` },
    { id: 'routines', label: 'Rotinas', icon: CalendarClock, placement: 'top', active: props.view === 'routines', onSelect: () => props.onOpenHome('routines'), badge: props.enabledRoutines, badgeLabel: `${props.enabledRoutines} rotinas ativas` },
    { id: 'settings', label: 'Configurações', icon: Settings2, placement: 'bottom', active: props.view === 'settings', onSelect: () => props.onOpenHome('settings') },
  ]
}

/** Setas e Home/End andam entre os botões; Tab continua funcionando por todos. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}

export function NavRail(props: NavRailProps) {
  const items = railItems(props)
  const button = (item: RailItem) => {
    const Icon = item.icon
    return <Tooltip key={item.id}>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size={null} data-rail-item={item.id} data-active={item.active} aria-label={item.badge ? `${item.label}, ${item.badgeLabel}` : item.label}
          aria-current={item.active ? 'page' : undefined} onClick={item.onSelect}
          className="relative size-9 rounded-xl p-0 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-primary/15 data-[active=true]:text-primary">
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
          {!!item.badge && <span aria-label={item.badgeLabel} className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">{item.badge > 9 ? '9+' : item.badge}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  }
  return <TooltipProvider delayDuration={300}>
    <nav aria-label="Navegação principal" data-nav-rail onKeyDown={moveFocus} className="flex w-12 flex-none flex-col items-center gap-1 border-r border-border/60 bg-chrome px-1.5 py-2">
      {items.filter(item => item.placement === 'top').map(button)}
      <div className="mt-auto flex flex-col items-center gap-1">{items.filter(item => item.placement === 'bottom').map(button)}</div>
    </nav>
  </TooltipProvider>
}
