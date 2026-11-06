import type { ReactNode } from 'react'
import { MoveHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CONTENT_WIDTHS, useContentWidth, type ContentWidth } from './content-width'

/** Controle de largura da coluna: a escolha vale para todas as páginas, o chat e o composer. */
export function WidthControl({ className }: { className?: string }) {
  const [width, setWidth] = useContentWidth()
  const current = CONTENT_WIDTHS.find(item => item.id === width)
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size={null} aria-label={`Largura do conteúdo: ${current?.label}`} title="Largura do conteúdo"
        className={cn('h-8 gap-1.5 rounded-md px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground', className)}>
        <MoveHorizontal aria-hidden="true" className="size-4" /><span className="hidden @[40rem]/page:inline">{current?.label}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuRadioGroup value={width} onValueChange={value => setWidth(value as ContentWidth)}>
        {CONTENT_WIDTHS.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.label}{item.id !== 'full' && <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{item.px}</span>}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

export interface PageHeaderProps {
  title: ReactNode
  /** Linha opcional de contexto abaixo do título. */
  subtitle?: ReactNode
  /** Avatar ou ícone antes do título. */
  leading?: ReactNode
  /** Ações à direita, antes do controle de largura. */
  actions?: ReactNode
  /** Página larga (Board): a largura é sempre total, então o controle some. */
  wide?: boolean
  titleId?: string
  testId?: string
}

/** Barra de cabeçalho de 56 px, igual em todas as páginas. O conteúdo dela alinha com a coluna do corpo. */
export function PageHeader({ title, subtitle, leading, actions, wide = false, titleId, testId }: PageHeaderProps) {
  return <header data-page-header data-testid={testId} className="@container/page shrink-0 border-b border-border bg-background" style={{ height: 'var(--header-height)' }}>
    <div className={cn('flex h-full items-center gap-3', wide ? 'px-8 max-[720px]:px-4' : 'ds-content')}>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <h1 id={titleId} className="ds-page-title truncate">{title}</h1>
        {subtitle && <p className="ds-page-lede truncate">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {!wide && <WidthControl />}
      </div>
    </div>
  </header>
}

export interface PageShellProps extends PageHeaderProps {
  children: ReactNode
  /** Navegação lateral da própria página (Configurações). */
  aside?: ReactNode
  className?: string
}

/**
 * Esqueleto único das páginas: cabeçalho de 56 px e, abaixo, o conteúdo numa coluna de largura `--content-width`.
 * `wide` mantém o mesmo cabeçalho mas deixa o corpo ocupar a largura toda, com rolagem própria.
 */
export function PageShell({ children, aside, className, ...header }: PageShellProps) {
  const { wide = false } = header
  return <div data-page-shell data-variant={wide ? 'wide' : 'column'} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <PageHeader {...header} />
    <div className="flex min-h-0 min-w-0 flex-1">
      {aside}
      {wide
        ? <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', className)}>{children}</div>
        : <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className={cn('ds-content py-8', className)}>{children}</div>
          </div>}
    </div>
  </div>
}
