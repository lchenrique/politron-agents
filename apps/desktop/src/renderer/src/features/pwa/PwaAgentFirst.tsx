import { useMemo } from 'react'
import { Check, FolderKanban, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Agent } from '../../../../shared/v9'
import { Avatar } from '../app/Avatar'
import { isDelegationActive, type PwaBoo, type PwaDelegation, type PwaPresence, type PwaTab } from './pwa-agent-model'

const RECENT_MS = 30 * 60 * 1000

const presenceLabel: Record<PwaPresence, string> = { idle: 'Disponível', working: 'Ocupado', waiting: 'Aguardando você' }
const presenceDot: Record<PwaPresence, string> = { idle: 'bg-success', working: 'bg-primary animate-pulse', waiting: 'bg-warning' }

/** Barra inferior da PWA no celular: Chief, Boos e Projetos (projetos e sessões ficam no menu lateral). */
export function PwaBottomNav({ tab, attention, onSelect }: { tab: PwaTab; attention: { chief: number; boos: number }; onSelect: (tab: PwaTab) => void }) {
  const items: { id: PwaTab; label: string; icon: typeof Sparkles; badge: number }[] = [
    { id: 'chief', label: 'Chief', icon: Sparkles, badge: attention.chief },
    { id: 'boos', label: 'Boos', icon: Users, badge: attention.boos },
    { id: 'projects', label: 'Projetos', icon: FolderKanban, badge: 0 },
  ]
  return <nav aria-label="Navegação principal" className="pwa-bottom-nav relative z-30 shrink-0 border-t border-border bg-chrome pb-[env(safe-area-inset-bottom)]">
    <ul className="mx-auto flex max-w-xl">
      {items.map(({ id, label, icon: Icon, badge }) => {
        const current = tab === id
        return <li key={id} className="flex-1">
          <Button type="button" variant="ghost" size={null} aria-current={current ? 'page' : undefined} onClick={() => onSelect(id)}
            className={cn('relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-none px-2 text-[11px] font-medium hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              current ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground')}>
            <span className="relative"><Icon aria-hidden className="size-5" />
              {badge > 0 && <span aria-label={`${badge} pendentes`} className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">{badge}</span>}
            </span>
            {label}
          </Button>
        </li>
      })}
    </ul>
  </nav>
}

/** Faixa de Boos no topo da conversa do Chief: avatar, estado e acesso direto à conversa de cada um. */
export function PwaAgentStrip({ boos, onOpenAgent }: { boos: PwaBoo[]; onOpenAgent: (agent: Agent) => void }) {
  if (boos.length < 2) return null
  return <nav aria-label="Boos da equipe" className="shrink-0 border-b border-border/60">
    <ul className="flex gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
      {boos.map(({ agent, state, detail }) => <li key={agent.id} className="shrink-0">
        <Button type="button" variant="ghost" size={null} onClick={() => onOpenAgent(agent)} aria-label={`${agent.name}: ${detail}`} title={detail}
          className="flex h-auto w-16 flex-col items-center gap-1 rounded-lg px-1 py-1.5 font-normal hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <span className="relative">
            <Avatar agent={agent} size="sm" state={state} />
            <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-chrome', presenceDot[state])} />
          </span>
          <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">{agent.name}</span>
        </Button>
      </li>)}
    </ul>
  </nav>
}

/** "Trabalhando agora": delegações do Chief em andamento e as concluídas há pouco, como chips tocáveis. */
export function PwaWorkingNow({ delegations, onOpenConversation, now = Date.now() }: { delegations: PwaDelegation[]; onOpenConversation: (id: string) => void; now?: number }) {
  const visible = useMemo(() => {
    const active = delegations.filter(isDelegationActive)
    const recent = delegations.filter(item => !isDelegationActive(item) && now - Date.parse(item.at) < RECENT_MS).slice(0, 3)
    return { active, recent }
  }, [delegations, now])
  if (!visible.active.length && !visible.recent.length) return null
  return <section aria-label="Trabalhando agora" className="shrink-0 border-b border-border/60 px-3 py-2">
    <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      Trabalhando agora{visible.active.length > 0 && <span className="ds-count">{visible.active.length}</span>}
    </h2>
    <ul className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {[...visible.active, ...visible.recent].map(item => <li key={item.id} className="shrink-0">
        <Button type="button" variant="outline" size={null} onClick={() => onOpenConversation(item.conversationId)} data-state={item.state}
          aria-label={`${item.agentName}, ${item.state === 'working' ? 'trabalhando' : item.state === 'waiting' ? 'aguardando você' : item.state === 'done' ? 'concluiu' : 'não concluiu'}: ${item.title}`}
          className={cn('flex h-9 max-w-[16rem] items-center gap-2 rounded-full px-2.5 text-xs font-normal focus-visible:ring-2 focus-visible:ring-ring',
            item.state === 'waiting' && 'border-warning/40 bg-warning-soft/50', item.state === 'failed' && 'border-destructive/40', item.state === 'done' && 'text-muted-foreground')}>
          <Avatar agent={item.agent} size="xxs" state={item.state === 'working' ? 'working' : item.state === 'waiting' ? 'waiting' : 'idle'} />
          <span className="min-w-0 truncate"><span className="font-medium">{item.agentName}</span> · {item.title}</span>
          {item.state === 'done' && <Check aria-hidden className="size-3.5 shrink-0 text-success" />}
          {item.state === 'failed' && <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />}
        </Button>
      </li>)}
    </ul>
  </section>
}

/** Aba Boos: toda a equipe, quem está ocupado e no quê; tocar abre a conversa privada. */
export function PwaBoosPage({ boos, onOpenAgent }: { boos: PwaBoo[]; onOpenAgent: (agent: Agent) => void }) {
  const busy = boos.filter(item => item.state !== 'idle').length
  return <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto max-w-xl px-3 py-4">
      <h1 className="ds-page-title">Boos</h1>
      <p className="ds-page-lede mt-1">{busy ? `${busy} ${busy === 1 ? 'Boo está' : 'Boos estão'} trabalhando.` : 'Toque em um Boo para conversar.'}</p>
      {boos.length ? <ul className="ds-list mt-4">
        {boos.map(({ agent, state, detail }) => <li key={agent.id}>
          <Button type="button" variant="ghost" size={null} onClick={() => onOpenAgent(agent)}
            className="flex h-auto min-h-16 w-full items-center justify-start gap-3 whitespace-normal rounded-none px-3 py-2.5 text-left font-normal text-inherit hover:bg-accent/40 hover:text-inherit focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <Avatar agent={agent} size="md" state={state} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{agent.name}</span>{agent.role === 'chief' && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">Chief</span>}</span>
              <span className="block truncate text-xs text-muted-foreground">{agent.role === 'chief' && state === 'idle' ? 'Coordenação da equipe' : detail}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span aria-hidden className={cn('size-2 rounded-full', presenceDot[state])} />{presenceLabel[state]}</span>
          </Button>
        </li>)}
      </ul> : <p className="ds-empty mt-4 px-4 py-6 text-sm">Nenhum Boo cadastrado ainda. O Chief cria especialistas quando o trabalho pedir.</p>}
    </div>
  </div>
}
