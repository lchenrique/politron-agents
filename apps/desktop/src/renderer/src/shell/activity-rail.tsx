import { Bot, ChevronDown, ChevronRight, Columns3, Database, FolderKanban, GitPullRequest, GripVertical, Layers, MoreHorizontal, PanelLeft, Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Modos do sidebar, iguais aos do HTML. */
export type SidebarMode = 'all' | 'workspaces' | 'boos' | 'queue' | 'memory'

const MODES: ReadonlyArray<{ id: SidebarMode; label: string; title: string; icon: typeof Layers }> = [
  { id: 'all', label: 'Visão Unificada (Equipe Ativa + Workspaces)', title: 'Visão Geral', icon: Layers },
  { id: 'workspaces', label: 'Workspaces & Projetos', title: 'Projetos & Pastas', icon: FolderKanban },
  { id: 'boos', label: 'Equipe de Boos & Especialistas', title: 'Equipe de Boos', icon: Bot },
  { id: 'queue', label: 'Fila de Tarefas & Automações', title: 'Fila & Automações', icon: GitPullRequest },
  { id: 'memory', label: 'Memória Persistente & MCP', title: 'Memória & MCP', icon: Database },
]

/** Activity rail de 46px: troca o modo do sidebar; recolher e configurações embaixo. */
export function ActivityRail({ mode, onModeChange, onToggleSidebar, onOpenSettings, queueBadge }: {
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  onToggleSidebar: () => void
  onOpenSettings: () => void
  queueBadge: boolean
}) {
  return (
    <nav aria-label="Modos do sidebar" className="boobot-chrome z-20 flex w-[46px] shrink-0 flex-col items-center justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-rail)] py-2.5">
      <div className="flex flex-col items-center gap-1.5">
        {MODES.map(item => {
          const Icon = item.icon
          const active = mode === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              aria-pressed={active}
              title={item.label}
              className={cn(
                'relative flex size-8 items-center justify-center rounded-lg transition',
                active
                  ? 'border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
              )}
            >
              {active ? <span className="absolute -left-[7px] h-4 w-[3px] rounded-r bg-[var(--accent-primary)]" /> : null}
              <Icon className="size-4" />
              {item.id === 'queue' && queueBadge ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-400 animate-pulse-dot" /> : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <button type="button" onClick={onToggleSidebar} title="Mostrar/Ocultar Sidebar (Ctrl B)" className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]">
          <PanelLeft className="size-4" />
        </button>
        <button type="button" onClick={onOpenSettings} title="Configurações do Boobot (Ctrl ,)" className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-primary)]">
          <Settings className="size-4" />
        </button>
      </div>
    </nav>
  )
}

/** Ícones auxiliares reexportados para o sidebar não importar direto do lucide. */
export const SidebarIcons = { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus, Columns3 }
