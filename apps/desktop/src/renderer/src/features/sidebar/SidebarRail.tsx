import { PanelLeftClose, PanelLeftOpen, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import logo from '../../../public/boobot-mascot.svg?url'

/** Rail estreito fixo, no padrao do MiniMax Code: marca a esquerda e os controles sempre acessiveis. */
export function SidebarRail({ collapsed, onToggle, onOpenHome, onOpenPanel }: { collapsed: boolean; onToggle: () => void; onOpenHome?: () => void; onOpenPanel: () => void }) {
  return <nav aria-label="Navegação rápida" className="boobot-rail flex w-11 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border/75 bg-sidebar py-2 text-sidebar-foreground">
    <button type="button" onClick={onOpenHome} aria-label="Ir para a central" title="Central do Chief" className="flex size-8 items-center justify-center rounded-lg hover:bg-accent/50">
      <img src={logo} alt="" width={18} height={16} className="shrink-0" />
    </button>
    <Button variant="ghost" size="icon" className="size-8" onClick={onToggle} aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'} title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}>
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
    </Button>
    <Button variant="ghost" size="icon" className="size-8" onClick={onOpenPanel} aria-label="Abrir painel direito" title="Abrir painel direito · Arquivos, Terminal, Navegador, Mascote e Alterações">
      <PanelRight className="size-4" />
    </Button>
  </nav>
}
