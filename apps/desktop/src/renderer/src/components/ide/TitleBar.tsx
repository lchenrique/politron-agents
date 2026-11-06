import type { CSSProperties, ReactNode } from 'react'
import { Minus, Square, X, PanelsTopLeft, PanelLeftClose, PanelLeftOpen, Files, Terminal, Globe, UserRound, FileDiff, MessageSquare, PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeSelector } from './ThemeSelector'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { DockTool, DockZone } from '../../features/panels/DockWorkspace'
import logo from '../../../public/boobot-mascot.svg?url'

interface TitleBarProps {
  onOpenTool: (kind: DockTool, zone: DockZone) => void
  onDevelopmentLayout?: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenHome?: () => void
  search?: ReactNode
  /** Onde o usuário está: projeto da conversa, Central, Rotinas ou visão do projeto. */
  location?: { label: string; detail?: string }
  className?: string
}
const tools = [
  { kind: 'files', label: 'Arquivos', icon: Files },
  { kind: 'terminal', label: 'Terminal', icon: Terminal },
  { kind: 'web', label: 'Navegador', icon: Globe },
  { kind: 'mascot', label: 'Mascote', icon: UserRound },
  { kind: 'diff', label: 'Alterações', icon: FileDiff },
  { kind: 'chat', label: 'Chat', icon: MessageSquare },
] as const

// Botões do chrome: mesma medida e estados em toda a barra, sobre a superfície contínua da janela.
const chromeButton = 'dsh-chrome-button flex shrink-0 items-center justify-center'

function OpenToolsMenu({ onOpenTool, onDevelopmentLayout }: Pick<TitleBarProps, 'onOpenTool' | 'onDevelopmentLayout'>) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size={null} aria-label="Abrir painéis e abas" title="Abrir arquivos, terminal, navegador ou mascote" className={chromeButton}><PanelsTopLeft className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>Abrir painel</DropdownMenuLabel>
      <DropdownMenuGroup>{tools.map(tool => { const Icon = tool.icon; return <DropdownMenuItem key={tool.kind} onSelect={() => onOpenTool(tool.kind, tool.kind === 'chat' ? 'main' : 'side')}><Icon />{tool.label}</DropdownMenuItem> })}</DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem onSelect={onDevelopmentLayout}><PanelsTopLeft />Layout de programação</DropdownMenuItem></DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

// Texto da janela, não um controle: continua arrastável no desktop e trunca antes dos controles.
function WindowLocation({ location }: Pick<TitleBarProps, 'location'>) {
  if (!location) return <div className="min-w-0 flex-1" />
  return <div data-testid="window-location" className="flex min-w-0 flex-1 items-center gap-2 self-center pr-2 text-[12.5px]" title={location.detail ? `${location.label} · ${location.detail}` : location.label}>
    <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border-strong" />
    <span className="truncate font-semibold tracking-[-0.005em] text-foreground">{location.label}</span>
    {location.detail && <><span aria-hidden="true" className="hidden text-faint-foreground sm:inline">/</span><span className="hidden shrink truncate text-muted-foreground sm:inline">{location.detail}</span></>}
  </div>
}

export default function TitleBar({ onOpenTool, onDevelopmentLayout, sidebarCollapsed, onToggleSidebar, onOpenHome, search, location, className }: TitleBarProps) {
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const drag = { WebkitAppRegion: 'drag' } as CSSProperties
  const isWindows = window.vibeAPI?.platform === 'win32'
  // A barra da janela é parte do chrome (mesma superfície da navegação), sem borda: o canvas abaixo traz o contorno.
  const navigation = <div className="flex shrink-0 items-center gap-0.5 px-1.5" style={noDrag}>
    <Button type="button" variant="ghost" size={null} onClick={onOpenHome} aria-label="Ir para a central" title="Central do Chief" className={chromeButton}><img src={logo} alt="" width={18} height={16} /></Button>
    <Button type="button" variant="ghost" size={null} onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'} title="Recolher/expandir barra lateral · Ctrl+B" className={chromeButton}>{sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</Button>
    {search}
  </div>
  const globalControls = <div className="flex shrink-0 items-center gap-1" style={noDrag}>
    <ThemeSelector compact className="mr-1" />
    <Button type="button" variant="ghost" size={null} onClick={() => void window.vibeAPI.windowControls.showMascot()} aria-label="Abrir mascote flutuante" title="Abrir mascote flutuante" className={chromeButton}><PictureInPicture2 className="size-4" /></Button>
    <OpenToolsMenu onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} />
  </div>
  if (isWindows) return <div role="toolbar" aria-label="Barra da janela" className={'relative z-40 flex h-10 shrink-0 select-none items-stretch bg-chrome ' + (className || '')} style={drag}>
    {navigation}
    <WindowLocation location={location} />
    {globalControls}
    <div className="ml-2 flex shrink-0 items-stretch" style={noDrag}>
      <Button type="button" variant="ghost" size={null} title="Minimizar" aria-label="Minimizar" onClick={() => window.vibeAPI.windowControls.minimize()} className="flex h-auto w-11 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"><Minus className="size-3.5" /></Button>
      <Button type="button" variant="ghost" size={null} title="Maximizar" aria-label="Maximizar" onClick={() => window.vibeAPI.windowControls.maximize()} className="flex h-auto w-11 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"><Square className="size-3" /></Button>
      <Button type="button" variant="ghost" size={null} title="Ocultar na bandeja" aria-label="Ocultar Boobot na bandeja" onClick={() => window.vibeAPI.windowControls.close()} className="flex h-auto w-11 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-[#c42b1c] hover:text-white"><X className="size-3.5" /></Button>
    </div>
  </div>
  return <div role="toolbar" aria-label="Barra da janela" className={'relative z-40 flex h-[42px] shrink-0 items-center gap-2 bg-chrome px-3 ' + (className || '')} style={drag}>
    <div className="flex gap-2 px-1" style={noDrag}>
      <Button variant={null} size={null} aria-label="Ocultar Boobot na bandeja" onClick={() => window.vibeAPI.windowControls.close()} className="size-3 rounded-full bg-[#ff5f57]" />
      <Button variant={null} size={null} aria-label="Minimizar" onClick={() => window.vibeAPI.windowControls.minimize()} className="size-3 rounded-full bg-[#febc2e]" />
      <Button variant={null} size={null} aria-label="Maximizar" onClick={() => window.vibeAPI.windowControls.maximize()} className="size-3 rounded-full bg-[#28c840]" />
    </div>
    {navigation}
    <WindowLocation location={location} />
    {globalControls}
  </div>
}
