import { Columns2, Database, FileDiff, Globe, Grid2x2, History, Plus, Sparkles, Terminal, Users } from 'lucide-react'
import type { DockTool } from '@/features/panels/dock-layout'

/**
 * Aba "Nova Aba": o lançador de conteúdo do painel. Ocupa o lugar das abas
 * fechadas e reaparece no "+" de cada painel, como no HTML de referência.
 */

const OPTIONS: ReadonlyArray<{ kind: DockTool; title: string; description: string; icon: typeof Sparkles }> = [
  { kind: 'chat', title: 'Chief · Orquestração', description: 'A conversa com o líder e o histórico de decisões.', icon: Sparkles },
  { kind: 'files', title: 'Arquivos & Diff', description: 'Navegue no projeto e revise as alterações do run.', icon: FileDiff },
  { kind: 'terminal', title: 'Terminal Local', description: 'Shell na pasta da conversa, com o log do agente.', icon: Terminal },
  { kind: 'web', title: 'Preview Web', description: 'Navegador real com as abas em que os Boos trabalham.', icon: Globe },
  { kind: 'squad', title: 'Equipe de Boos', description: 'Especialistas, modelos e estado de cada agente.', icon: Users },
  { kind: 'memory', title: 'Memória & MCP', description: 'Decisões guardadas e servidores de ferramentas.', icon: Database },
  { kind: 'report', title: 'O que os Boos fizeram', description: 'Execuções do dia por Boo, com arquivos, falhas e desfazer.', icon: History },
]

export function LauncherTab({ onPick }: { workspaceId?: string | null; onPick: (kind: DockTool) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-auto p-6">
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
          <Plus className="size-4" />
        </div>
        <h2 className="text-[13.5px] font-semibold text-[var(--text-primary)]">Escolha o conteúdo deste painel</h2>
        <p className="max-w-sm text-[12px] text-[var(--text-muted)]">Cada painel tem a própria pilha de abas. Arraste uma aba para qualquer borda para dividir de novo.</p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map(option => {
          const Icon = option.icon
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() => onPick(option.kind)}
              className="group flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition group-hover:text-[var(--accent-primary)]">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-[var(--text-primary)]">{option.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--text-muted)]">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-5 flex items-center gap-1.5 font-mono text-[10.5px] text-[var(--text-muted)]">
        <Columns2 className="size-3" /> Arraste abas para dividir
        <Grid2x2 className="ml-2 size-3" /> Grade 2x2 no menu de layout
      </p>
    </div>
  )
}
