import { Globe, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TerminalPanel from '@/components/ide/TerminalPanel'
import type { Agent, BrowserFrame } from '../../../../shared/v9'
import { BrowserPanel } from './BrowserPanel'

export function SidePanel({ computerOpen, onCloseComputer, browserFrames, agents, onRefreshBrowser, onChanged, directory }: {
  computerOpen: boolean
  onCloseComputer: () => void
  browserFrames: BrowserFrame[]
  agents: Agent[]
  onRefreshBrowser: () => void
  onChanged: (value: string) => void
  directory?: string | null
}) {
  return <aside className="w-[380px] shrink-0 border-l border-border/60 bg-card/30">
    {computerOpen
      ? <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-3">
            <span className="flex items-center gap-2 text-xs font-medium"><Globe className="size-3.5" /> Browser computer use</span>
            <Button size="icon" variant="ghost" className="size-7" aria-label="Mostrar terminal" onClick={onCloseComputer}><Settings2 className="size-3.5" /></Button>
          </div>
          <BrowserPanel frames={browserFrames} agents={agents} onRefresh={onRefreshBrowser} onChanged={onChanged} />
        </div>
      : <div className="h-full p-3"><TerminalPanel directory={directory} showLogs={false} /></div>}
  </aside>
}
