import { useRef, useState } from 'react'
import {
  ChevronDown, Columns2, Columns3, Database, FileDiff, Folder, FolderGit2, Globe, Grid2x2, LayoutPanelLeft,
  Maximize2, MessageSquare, Minus, RotateCcw, Search, Settings, Sparkles, Square, Terminal, Users, X,
} from 'lucide-react'
import { Dropdown, triggerClass } from './dropdown'
import { Kbd, MenuDivider, MenuItem, MenuSection, StatusPill } from './primitives'
import { useTheme } from '@/components/theme-provider'
import { THEME_PRESETS } from '@/components/theme-catalog'
import type { LayoutPreset } from '@/features/panels/dock-layout'

/**
 * Top bar de 44px do design: marca, seletor de projeto, status quieto, busca de
 * comandos, configurações e o menu único de layout/painéis/tema.
 */

export interface TopBarProject { id: string; name: string; branch: string }

export function TopBar({ project, projects, onSelectProject, status, onOpenCommand, onOpenSettings, onOpenTool, onApplyPreset, onResetLayout }: {
  project: { name: string; branch: string }
  projects: TopBarProject[]
  onSelectProject: (id: string) => void
  status: { text: string; tone: 'default' | 'warning' | 'success' } | null
  onOpenCommand: () => void
  onOpenSettings: () => void
  onOpenTool: (tool: 'files' | 'terminal' | 'web' | 'squad' | 'memory') => void
  onApplyPreset: (preset: LayoutPreset) => void
  onResetLayout: () => void
}) {
  const [menu, setMenu] = useState<'project' | 'layout' | null>(null)
  const projectTrigger = useRef<HTMLButtonElement>(null)
  const layoutTrigger = useRef<HTMLButtonElement>(null)
  const { theme, resolvedMode, setTheme, setMode } = useTheme()
  const activePreset = THEME_PRESETS.find(preset => preset.theme === theme && preset.mode === resolvedMode)?.id

  return (
    <header className="boobot-chrome window-drag z-30 flex h-[44px] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] pr-3 pl-3">
      <div className="window-no-drag flex min-w-0 items-center gap-2.5">
        <div className="flex items-center gap-2 pr-1">
          <div className="flex size-6 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)]">
            <span className="block size-2.5 rounded-xs bg-[var(--accent-primary)]" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">Boobot</span>
        </div>

        <span className="text-[var(--border-strong)]">/</span>        <div className="relative">
          <button
            ref={projectTrigger}
            type="button"
            onClick={() => setMenu(current => current === 'project' ? null : 'project')}
            className="flex items-center gap-2 rounded-md border border-transparent px-2.5 py-1 text-[12px] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
            aria-haspopup="menu"
            aria-expanded={menu === 'project'}
          >
            <FolderGit2 className="size-3.5 text-[var(--accent-primary)]" />
            <span className="max-w-56 truncate font-medium text-[var(--text-primary)]">{project.name}</span>
            <span className="rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-muted)]">{project.branch}</span>
            <ChevronDown className="size-3 text-[var(--text-muted)]" />
          </button>
          <Dropdown open={menu === 'project'} onClose={() => setMenu(null)} anchor={projectTrigger} width={256}>
            <MenuSection>Workspaces Locais</MenuSection>
            {projects.map(item => (
              <MenuItem
                key={item.id}
                icon={<Folder className={item.name === project.name ? 'size-3.5 text-[var(--accent-primary)]' : 'size-3.5 text-[var(--text-muted)]'} />}
                label={<span className={item.name === project.name ? 'text-[var(--text-primary)]' : undefined}>{item.name}</span>}
                hint={<span className={item.name === project.name ? 'text-[var(--accent-primary)]' : undefined}>{item.name === project.name ? 'Ativo' : item.branch}</span>}
                onClick={() => { setMenu(null); onSelectProject(item.id) }}
              />
            ))}
            <MenuDivider />
            <MenuItem icon={<MessageSquare className="size-3.5" />} label="Conversa sem projeto" onClick={() => { setMenu(null); onSelectProject('') }} />
          </Dropdown>
        </div>

      </div>

      <div className="window-no-drag flex items-center gap-2">
        <button type="button" onClick={onOpenCommand} className="hidden items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-pane)] px-2.5 py-1 text-[11.5px] text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] sm:flex">
          <Search className="size-3" />
          <span>Buscar ou comando...</span>
          <Kbd className="border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">Ctrl K</Kbd>
        </button>



        <div className="relative">
          <button
            ref={layoutTrigger}
            type="button"
            onClick={() => setMenu(current => current === 'layout' ? null : 'layout')}
            className={triggerClass(menu === 'layout', 'solid')}
            aria-haspopup="menu"
            aria-expanded={menu === 'layout'}
            title="Opções de Layout, Colunas e Aparência"
          >
            <Columns3 className="size-3.5 text-[var(--accent-primary)]" />
            <span className="hidden sm:inline">Layout &amp; Painéis</span>
            <ChevronDown className="size-3 text-[var(--text-muted)]" />
          </button>
          <Dropdown open={menu === 'layout'} onClose={() => setMenu(null)} anchor={layoutTrigger} align="right" width={272}>
            <MenuSection>Disposição de Colunas</MenuSection>
            <MenuItem icon={<Columns2 className="size-3.5 text-[var(--accent-primary)]" />} label="2 Colunas (Chat + Código)" hint="Padrão" onClick={() => { setMenu(null); onApplyPreset('two-cols') }} />
            <MenuItem icon={<Columns3 className="size-3.5" />} label="3 Colunas (Chat + Diff + Terminal)" onClick={() => { setMenu(null); onApplyPreset('three-cols') }} />
            <MenuItem icon={<LayoutPanelLeft className="size-3.5" />} label="Split 2D (Chat + Diff acima / Term abaixo)" onClick={() => { setMenu(null); onApplyPreset('ide-split') }} />
            <MenuItem icon={<Grid2x2 className="size-3.5" />} label="Grade 2x2 (4 Painéis)" onClick={() => { setMenu(null); onApplyPreset('quad-grid') }} />
            <MenuItem icon={<Maximize2 className="size-3.5" />} label="Foco 1 Coluna (Apenas Chief)" onClick={() => { setMenu(null); onApplyPreset('focus-chat') }} />

            <MenuDivider />
            <MenuSection>Abrir Aba de Ferramenta</MenuSection>
            <MenuItem icon={<Sparkles className="size-3.5" />} label="Chief · Orquestração" onClick={() => { setMenu(null); onOpenCommand() }} />
            <MenuItem icon={<FileDiff className="size-3.5" />} label="Arquivos & Diff Viewer" onClick={() => { setMenu(null); onOpenTool('files') }} />
            <MenuItem icon={<Terminal className="size-3.5" />} label="Terminal Integrado" onClick={() => { setMenu(null); onOpenTool('terminal') }} />
            <MenuItem icon={<Globe className="size-3.5" />} label="Navegador / Preview Web" onClick={() => { setMenu(null); onOpenTool('web') }} />
            <MenuItem icon={<Users className="size-3.5" />} label="Equipe de Boos" onClick={() => { setMenu(null); onOpenTool('squad') }} />
            <MenuItem icon={<Database className="size-3.5" />} label="Memória & MCP" onClick={() => { setMenu(null); onOpenTool('memory') }} />

            <MenuDivider />
            <div className="px-2 pb-1">
              <button type="button" onClick={() => { setMenu(null); onOpenSettings() }} className="flex w-full items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-2.5 py-1.5 text-[11.5px] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]">
                <span className="flex items-center gap-2">
                  <Settings className="size-3.5 text-[var(--accent-primary)]" />
                  <span>Configurações da Plataforma</span>
                </span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">Ctrl ,</span>
              </button>
            </div>

            <MenuDivider />
            <MenuSection>Tema da Interface</MenuSection>
            <div className="flex items-center gap-1.5 px-3 py-1">
              {THEME_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => { setTheme(preset.theme); setMode(preset.mode); setMenu(null) }}
                  className={
                    'flex-1 rounded border py-1 text-[11px] transition ' +
                    (activePreset === preset.id
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <MenuDivider />
            <MenuItem icon={<RotateCcw className="size-3.5 text-amber-400" />} label={<span className="text-amber-400">Restaurar Layout Inicial</span>} onClick={() => { setMenu(null); onResetLayout() }} />
          </Dropdown>
        </div>
        <div className="ml-1 flex items-center gap-0.5 border-l border-[var(--border-subtle)] pl-1.5">
          <button type="button" onClick={() => void window.vibeAPI?.windowControls?.minimize?.()} title="Minimizar" aria-label="Minimizar" className="flex size-7 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"><Minus className="size-3.5" /></button>
          <button type="button" onClick={() => void window.vibeAPI?.windowControls?.maximize?.()} title="Maximizar" aria-label="Maximizar" className="flex size-7 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"><Square className="size-3" /></button>
          <button type="button" onClick={() => void window.vibeAPI?.windowControls?.close?.()} title="Fechar" aria-label="Fechar janela" className="flex size-7 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-rose-500/90 hover:text-white"><X className="size-3.5" /></button>
        </div>
      </div>
    </header>
  )
}
