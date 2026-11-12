import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Dropdown } from '@/shell/dropdown'
import { MenuItem, MenuSection } from '@/shell/primitives'
import type { Agent } from '../../../../shared/v9'

/**
 * Pílula `● @Boo ⌄` do composer do mock: mostra e troca quem recebe a mensagem.
 * A escolha vira uma menção no texto, então o roteamento existente continua valendo.
 */
export function AgentChip({ agents, selected, onSelect }: {
  agents: Agent[]
  /** Agente escolhido; sem escolha, mostra o primeiro da equipe da conversa. */
  selected?: Agent | null
  onSelect: (agent: Agent) => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const atual = selected ?? agents[0]
  if (!agents.length || !atual) return null

  return <>
    <button
      ref={trigger}
      type="button"
      onClick={() => setOpen(current => !current)}
      aria-haspopup="menu"
      aria-expanded={open}
      title="Escolher agente destinatário"
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-hover)] px-2.5 text-[11.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-active)]"
    >
      <span className="size-1.5 rounded-full" style={{ background: atual.color || 'var(--accent-primary)' }} />
      <span>@{atual.name}</span>
      <ChevronDown className="size-3 text-[var(--text-muted)]" />
    </button>
    <Dropdown open={open} onClose={() => setOpen(false)} anchor={trigger} align="left" side="top" width={220}>
      <MenuSection>Enviar para</MenuSection>
      {agents.map(agent => <MenuItem
        key={agent.id}
        icon={<span className="block size-2 rounded-full" style={{ background: agent.color || 'var(--accent-primary)' }} />}
        label={agent.name}
        hint={agent.alias ? `@${agent.alias}` : agent.role}
        onClick={() => { setOpen(false); onSelect(agent) }}
      />)}
    </Dropdown>
  </>
}
