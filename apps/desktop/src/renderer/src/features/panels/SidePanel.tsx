import { FileDiff, Globe, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TerminalPanel from '@/components/ide/TerminalPanel'
import type { Agent, BrowserFrame } from '../../../../shared/v9'
import { BrowserPanel } from './BrowserPanel'

export function SidePanel({ computerOpen, onCloseComputer, browserFrames, agents, onRefreshBrowser, onChanged, workspaceId, workspaceDiff = '' }: {
  computerOpen: boolean
  onCloseComputer: () => void
  browserFrames: BrowserFrame[]
  agents: Agent[]
  onRefreshBrowser: () => void
  onChanged: (value: string) => void
  workspaceId?: string | null
  workspaceDiff?: string
}) {
  return <aside className="w-[380px] shrink-0 border-l border-border/60 bg-card/30">
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      {computerOpen && <section className="flex min-h-[160px] flex-[1.1] flex-col overflow-hidden rounded-lg border border-border/60"><div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3"><h2 className="flex items-center gap-2 text-xs font-medium"><Globe className="size-3.5" /> Navegador</h2><Button size="icon" variant="ghost" className="size-7" aria-label="Ocultar navegador" title="Ocultar navegador" onClick={onCloseComputer}><X className="size-3.5" /></Button></div><BrowserPanel frames={browserFrames} agents={agents} onRefresh={onRefreshBrowser} onChanged={onChanged} /></section>}
      <section className="flex min-h-[120px] flex-1 flex-col overflow-hidden rounded-lg border border-border/60"><h2 className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs font-medium"><FileDiff className="size-3.5" /> Arquivos alterados vs HEAD</h2><pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[10px] leading-5 text-muted-foreground">{workspaceDiff || 'Nenhuma alteração rastreada.'}</pre></section>
      <section className="flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-lg border border-border/60"><h2 className="flex h-9 shrink-0 items-center border-b border-border/60 px-3 text-xs font-medium">Terminal</h2><TerminalPanel workspaceId={workspaceId} showLogs={false} /></section>
    </div>
  </aside>
}
