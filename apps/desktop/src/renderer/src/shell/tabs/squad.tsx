import { Bot, Cpu, MessageSquarePlus, Pencil, Users } from 'lucide-react'
import type { Agent, Run } from '../../../../shared/v9'
import type { AgentAvatarState } from '@/features/app/Avatar'
import { MiniBoo, normalizeVariant, safeHex } from '@/shell/primitives'
import { cn } from '@/lib/utils'

/**
 * Aba "Equipe de Boos": cartões com identidade, papel, modelo e estado real de
 * cada agente — o mesmo painel de gerenciamento de equipe do HTML.
 */

const STATE_META: Record<AgentAvatarState, { label: string; dot: string; text: string }> = {
  idle: { label: 'Ocioso', dot: 'bg-[var(--border-strong)]', text: 'text-[var(--text-muted)]' },
  working: { label: 'Trabalhando', dot: 'bg-[var(--accent-primary)]', text: 'text-[var(--accent-primary)]' },
  waiting: { label: 'Aguardando decisão', dot: 'bg-amber-400 animate-pulse-dot', text: 'text-amber-400' },
  speaking: { label: 'Falando', dot: 'bg-sky-400', text: 'text-sky-400' },
}

export function SquadTab({ assistant, agents, agentStates, runs, onEdit, onStartConversation }: {
  assistant?: Agent
  agents: Agent[]
  agentStates?: Record<string, AgentAvatarState>
  runs: Run[]
  onEdit?: (agentId: string) => void
  onStartConversation?: (agentId: string) => void
}) {
  const team = assistant ? [assistant, ...agents] : agents
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <Users className="size-3.5 text-[var(--accent-primary)]" />
          <span className="font-medium text-[var(--text-primary)]">Equipe de Boos</span>
          <span className="font-mono text-[10.5px] text-[var(--text-muted)]">{team.length} agentes</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {team.map(agent => {
            const state = agentStates?.[agent.id] || 'idle'
            const meta = STATE_META[state]
            const color = safeHex(agent.color, '#10B981')
            const activeRuns = runs.filter(run => run.agentId === agent.id && ['queued', 'running', 'waiting'].includes(run.status)).length
            const isChief = agent.id === assistant?.id || agent.role === 'chief'
            return (
              <article key={agent.id} className="group flex flex-col gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                <div className="flex items-start gap-2.5">
                  <MiniBoo color={color} variant={normalizeVariant(agent.avatar)} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{agent.name}</h3>
                      {isChief ? <span className="rounded border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] px-1 py-0.5 font-mono text-[9px] text-[var(--accent-primary)]">LÍDER</span> : null}
                    </div>
                    <p className="truncate text-[11.5px] text-[var(--text-secondary)]">{agent.alias || 'Boo da equipe'}</p>
                  </div>
                  <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', meta.dot)} />
                </div>

                <dl className="space-y-1 font-mono text-[10.5px] text-[var(--text-muted)]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1"><Cpu className="size-3" /> Modelo</dt>
                    <dd className="truncate text-[var(--text-secondary)]">{agent.model || agent.runtime}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1"><Bot className="size-3" /> Runtime</dt>
                    <dd className="truncate text-[var(--text-secondary)]">{agent.runtime}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>Estado</dt>
                    <dd className={cn('truncate', meta.text)}>{meta.label}{activeRuns ? ` · ${activeRuns} run` : ''}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center gap-1.5">
                  <button type="button" onClick={() => onStartConversation?.(agent.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]">
                    <MessageSquarePlus className="size-3" /> Conversar
                  </button>
                  <button type="button" onClick={() => onEdit?.(agent.id)} title={`Editar ${agent.name}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                    <Pencil className="size-3" /> Editar
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
