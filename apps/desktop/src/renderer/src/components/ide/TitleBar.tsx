import type { CSSProperties } from 'react'
import { Minus, Square, X, PanelsTopLeft, PanelLeftClose, PanelLeftOpen, Files, Terminal, Globe, UserRound, FileDiff, MessageSquare, PictureInPicture2 } from 'lucide-react'
import { ThemeSelector } from './ThemeSelector'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { DockTool, DockZone } from '../../features/panels/DockWorkspace'

interface TitleBarProps {
  onOpenTool: (kind: DockTool, zone: DockZone) => void
  onDevelopmentLayout?: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  className?: string
}
const tools = [
  { kind: 'files', label: 'Arquivos', icon: Files },
  { kind: 'terminal', label: 'Terminal', icon: Terminal },
  { kind: 'browser', label: 'Navegador do agente', icon: Globe },
  { kind: 'mascot', label: 'Mascote', icon: UserRound },
  { kind: 'diff', label: 'Alterações', icon: FileDiff },
  { kind: 'chat', label: 'Chat', icon: MessageSquare },
] as const

function OpenToolsMenu({ onOpenTool, onDevelopmentLayout }: Pick<TitleBarProps, 'onOpenTool' | 'onDevelopmentLayout'>) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" aria-label="Abrir painéis e abas" title="Abrir arquivos, terminal, navegador ou mascote" className="flex h-full min-h-9 w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"><PanelsTopLeft className="size-4" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>Abrir painel</DropdownMenuLabel>
      <DropdownMenuGroup>{tools.map(tool => { const Icon = tool.icon; return <DropdownMenuItem key={tool.kind} onSelect={() => onOpenTool(tool.kind, tool.kind === 'chat' ? 'main' : 'side')}><Icon />{tool.label}</DropdownMenuItem> })}</DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem onSelect={onDevelopmentLayout}><PanelsTopLeft />Layout de programação</DropdownMenuItem></DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

export default function TitleBar({ onOpenTool, onDevelopmentLayout, sidebarCollapsed, onToggleSidebar, className }: TitleBarProps) {
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const drag = { WebkitAppRegion: 'drag' } as CSSProperties
  const isWindows = window.vibeAPI?.platform === 'win32'
  if (isWindows) return <div className={'glass-header flex h-10 shrink-0 select-none items-stretch ' + (className || '')} style={drag}>
    <div className="flex min-w-0 flex-1 items-center gap-5 px-4">
      <div className="flex shrink-0 items-center gap-2"><img src="./boobot-mascot.svg" alt="" width={16} height={14} className="shrink-0" /><span className="text-xs font-bold tracking-tight text-ide-text/90">BOOBOT</span></div>
    </div>
    <div className="flex items-center gap-1" style={noDrag}><button type="button" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'} title="Recolher/expandir sidebar · Ctrl+B" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">{sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button><ThemeSelector /><button type="button" onClick={() => void window.vibeAPI.windowControls.showMascot()} aria-label="Abrir mascote flutuante" title="Abrir mascote flutuante" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PictureInPicture2 className="size-4" /></button><OpenToolsMenu onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} /></div>
    <div className="ml-2 flex items-stretch" style={noDrag}>
      <button type="button" title="Minimizar" aria-label="Minimizar" onClick={() => window.vibeAPI.windowControls.minimize()} className="flex w-11 items-center justify-center text-ide-text-dim hover:bg-white/5"><Minus className="size-3.5" /></button>
      <button type="button" title="Maximizar" aria-label="Maximizar" onClick={() => window.vibeAPI.windowControls.maximize()} className="flex w-11 items-center justify-center text-ide-text-dim hover:bg-white/5"><Square className="size-3" /></button>
      <button type="button" title="Ocultar na bandeja" aria-label="Ocultar Boobot na bandeja" onClick={() => window.vibeAPI.windowControls.close()} className="flex w-11 items-center justify-center text-ide-text-dim hover:bg-[#c42b1c] hover:text-white"><X className="size-3.5" /></button>
    </div>
  </div>
  return <div className={'glass-header flex h-[42px] shrink-0 items-center gap-3 px-4 ' + (className || '')} style={drag}>
    <div className="flex gap-2" style={noDrag}>
      <button aria-label="Ocultar Boobot na bandeja" onClick={() => window.vibeAPI.windowControls.close()} className="size-3 rounded-full bg-[#ff5f57]" />
      <button aria-label="Minimizar" onClick={() => window.vibeAPI.windowControls.minimize()} className="size-3 rounded-full bg-[#febc2e]" />
      <button aria-label="Maximizar" onClick={() => window.vibeAPI.windowControls.maximize()} className="size-3 rounded-full bg-[#28c840]" />
    </div>
    <div className="flex items-center" style={noDrag}><button type="button" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'} title="Recolher/expandir sidebar · Ctrl+B" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">{sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button><ThemeSelector /><button type="button" onClick={() => void window.vibeAPI.windowControls.showMascot()} aria-label="Abrir mascote flutuante" title="Abrir mascote flutuante" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PictureInPicture2 className="size-4" /></button><OpenToolsMenu onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} /></div>
  </div>
}
