import { useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Users } from 'lucide-react'
import { Dropdown } from '@/shell/dropdown'
import { MenuItem, MenuSection } from '@/shell/primitives'
import type { Agent } from '../../../../shared/v9'

/**
 * Pílula `● @Boo ⌄` do composer: mostra e troca quem recebe a mensagem.
 * Agrupa em "Nesta conversa", "Neste workspace" e "Outros Boos". Escolher alguém da
 * conversa direciona a mensagem; escolher alguém de fora o coloca na sessão e mantém
 * o menu aberto, para montar um grupo com vários de uma vez. Sem escolha, num grupo, a
 * mensagem vai para a equipe e o roteamento da conversa decide quem responde.
 */
export function AgentChip({ agents, selected, onSelect, onClear, sessionIds, workspaceIds = [] }: {
  agents: Agent[]
  /** Agente escolhido; sem escolha, mostra o primeiro da conversa. */
  selected?: Agent | null
  onSelect: (agent: Agent) => void
  /** Volta para "Equipe decide": tira o destinatário fixo. */
  onClear?: () => void
  /** Quem já participa da conversa; sem isso, todos contam como participantes. */
  sessionIds?: string[]
  /** Equipe padrão do workspace da conversa. */
  workspaceIds?: string[]
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const inSession = (agent: Agent) => !sessionIds || sessionIds.includes(agent.id)
  const atual = selected ?? agents.find(inSession) ?? agents[0]
  if (!agents.length || !atual) return null

  const conversa = agents.filter(inSession)
  const equipe = !selected && conversa.length > 1
  const workspace = agents.filter(agent => !inSession(agent) && workspaceIds.includes(agent.id))
  const outros = agents.filter(agent => !inSession(agent) && !workspaceIds.includes(agent.id))
  const item = (agent: Agent) => {
    const member = inSession(agent)
    return <MenuItem
      key={agent.id}
      icon={<span className="block size-2 rounded-full" style={{ background: agent.color || 'var(--accent-primary)' }} />}
      label={agent.name}
      hint={member ? (selected && agent.id === atual.id ? <Check aria-hidden="true" className="size-3 text-[var(--accent-primary)]" /> : agent.alias ? `@${agent.alias}` : agent.role) : <span className="flex items-center gap-0.5"><Plus aria-hidden="true" className="size-3" />adicionar</span>}
      // Participante: direciona e fecha. De fora: entra na sessão e o menu fica aberto para somar mais.
      onClick={() => { if (member) setOpen(false); onSelect(agent) }}
    />
  }

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
      {equipe ? <Users aria-hidden="true" className="size-3 text-[var(--text-muted)]" /> : <span className="size-1.5 rounded-full" style={{ background: atual.color || 'var(--accent-primary)' }} />}
      <span>{equipe ? `Equipe · ${conversa.length}` : `@${atual.name}`}</span>
      {!equipe && conversa.length > 1 ? <span className="text-[var(--text-muted)]">+{conversa.length - 1}</span> : null}
      <ChevronDown className="size-3 text-[var(--text-muted)]" />
    </button>
    <Dropdown open={open} onClose={() => setOpen(false)} anchor={trigger} align="left" side="top" width={240} className="max-h-80 overflow-y-auto">
      <MenuSection>Nesta conversa</MenuSection>
      {conversa.length > 1 && onClear ? <MenuItem
        icon={<Users aria-hidden="true" className="size-3" />}
        label="Equipe decide"
        hint={!selected ? <Check aria-hidden="true" className="size-3 text-[var(--accent-primary)]" /> : 'líder ou roteador'}
        onClick={() => { setOpen(false); onClear() }}
      /> : null}
      {conversa.map(item)}
      {workspace.length > 0 && <><MenuSection>Neste workspace</MenuSection>{workspace.map(item)}</>}
      {outros.length > 0 && <><MenuSection>Outros Boos</MenuSection>{outros.map(item)}</>}
    </Dropdown>
  </>
}
