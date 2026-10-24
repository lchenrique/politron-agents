import type { CSSProperties } from 'react'
import { Minus, Square, X, PanelsTopLeft, PanelLeftClose, PanelLeftOpen, PanelRight, Files, Terminal, Globe, UserRound, FileDiff, MessageSquare, PictureInPicture2 } from 'lucide-react'
import { ThemeSelector } from './ThemeSelector'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { DockTool, DockZone } from '../../features/panels/DockWorkspace'
import logo from '../../../public/boobot-mascot.svg?url'

interface TitleBarProps {
  onOpenTool: (kind: DockTool, zone: DockZone) => void
  onDevelopmentLayout?: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  className?: string
  browserMode?: boolean
  browserCanReadFiles?: boolean
}
const tools = [
  { kind: 'files', label: 'Arquivos', icon: Files },
  { kind: 'terminal', label: 'Terminal', icon: Terminal },
  { kind: 'browser', label: 'Navegador do agente', icon: Globe },
  { kind: 'mascot', label: 'Mascote', icon: UserRound },
  { kind: 'diff', label: 'Alterações', icon: FileDiff },
  { kind: 'chat', label: 'Chat', icon: MessageSquare },
] as const

function OpenToolsMenu({ onOpenTool, onDevelopmentLayout, browserMode = false, browserCanReadFiles = false }: Pick<TitleBarProps, 'onOpenTool' | 'onDevelopmentLayout' | 'browserMode' | 'browserCanReadFiles'>) {
  const availableTools = browserMode ? tools.filter(tool => tool.kind === 'diff' || tool.kind === 'chat' || tool.kind === 'files' && browserCanReadFiles) : tools
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" aria-label="Abrir painéis e abas" title="Abrir arquivos, terminal, navegador ou mascote" className="flex h-full min-h-9 w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"><PanelsTopLeft className="size-4" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>Abrir painel</DropdownMenuLabel>
      <DropdownMenuGroup>{availableTools.map(tool => { const Icon = tool.icon; return <DropdownMenuItem key={tool.kind} onSelect={() => onOpenTool(tool.kind, tool.kind === 'chat' ? 'main' : 'side')}><Icon />{tool.label}</DropdownMenuItem> })}</DropdownMenuGroup>
      {!browserMode && <><DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem onSelect={onDevelopmentLayout}><PanelsTopLeft />Layout de programação</DropdownMenuItem></DropdownMenuGroup></>}
    </DropdownMenuContent>
  </DropdownMenu>
}

function NavigationButtons({ sidebarCollapsed, onToggleSidebar, onOpenTool, panelTool }: { sidebarCollapsed: boolean; onToggleSidebar: () => void; onOpenTool: TitleBarProps['onOpenTool']; panelTool: DockTool }) {
  return <>
    <button type="button" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'} title="Recolher/expandir sidebar · Ctrl+B" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">{sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button>
    <button type="button" onClick={() => onOpenTool(panelTool, 'side')} aria-label="Abrir painel direito" title="Abrir painel direito · Arquivos, Terminal, Navegador, Mascote e Alterações" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PanelRight className="size-4" /></button>
  </>
}

export default function TitleBar({ onOpenTool, onDevelopmentLayout, sidebarCollapsed, onToggleSidebar, className, browserMode = false, browserCanReadFiles = false }: TitleBarProps) {
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const drag = { WebkitAppRegion: 'drag' } as CSSProperties
  const isWindows = window.vibeAPI?.platform === 'win32'
  if (browserMode) return <div className={'glass-header flex h-10 shrink-0 items-center justify-between border-b border-border/50 px-3 ' + (className || '')}>
    <div className="flex min-w-0 items-center gap-2"><img src="/icon.svg" alt="" width={16} height={14} className="shrink-0" /><span className="text-xs font-bold tracking-tight">BOOBOT</span><NavigationButtons sidebarCollapsed={sidebarCollapsed} onToggleSidebar={onToggleSidebar} onOpenTool={onOpenTool} panelTool={browserCanReadFiles ? 'files' : 'diff'} /></div>
    <div className="flex items-center gap-1"><ThemeSelector /><OpenToolsMenu browserMode browserCanReadFiles={browserCanReadFiles} onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} /></div>
  </div>
  if (isWindows) return <div className={'glass-header flex h-10 shrink-0 select-none items-stretch ' + (className || '')} style={drag}>
    <div className="flex min-w-0 flex-1 items-center gap-5 px-4" />
      <div className="flex items-center gap-1" style={noDrag}><ThemeSelector /><button type="button" onClick={() => void window.vibeAPI.windowControls.showMascot()} aria-label="Abrir mascote flutuante" title="Abrir mascote flutuante" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PictureInPicture2 className="size-4" /></button><OpenToolsMenu onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} /></div>
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
    <div className="flex items-center" style={noDrag}><ThemeSelector /><button type="button" onClick={() => void window.vibeAPI.windowControls.showMascot()} aria-label="Abrir mascote flutuante" title="Abrir mascote flutuante" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><PictureInPicture2 className="size-4" /></button><OpenToolsMenu onOpenTool={onOpenTool} onDevelopmentLayout={onDevelopmentLayout} /></div>
  </div>
}
