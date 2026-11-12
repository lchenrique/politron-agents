import { useRef, useState } from 'react'
import { ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Dropdown } from '@/shell/dropdown'
import { MenuItem, MenuSection } from '@/shell/primitives'
import type { Agent } from '../../../../shared/v9'
import { APPROVAL_MODE_LABEL } from '../app/appShellShared'

const MODES: Array<{ id: Agent['approvalMode']; label: string; hint: string }> = [
  { id: 'ask', label: 'Perguntar', hint: 'Pede aprovação antes de cada ação sensível' },
  { id: 'automatic', label: 'Automático', hint: 'Trabalha sozinho dentro das permissões' },
  { id: 'bypass', label: 'Acesso total', hint: 'Sem confirmação, inclusive no terminal' },
]

/**
 * Chip de autonomia do composer, como o "Acesso total" da referência:
 * mostra o modo do Boo que vai receber a mensagem e permite trocar ali mesmo.
 */
export function PermissionChip({ mode, disabled = false, onSelect }: {
  mode: Agent['approvalMode']
  disabled?: boolean
  onSelect: (mode: Agent['approvalMode']) => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const label = APPROVAL_MODE_LABEL[mode]
  const Icon = mode === 'bypass' ? ShieldAlert : ShieldCheck

  return <>
    <button
      ref={trigger}
      type="button"
      disabled={disabled}
      onClick={() => setOpen(current => !current)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Permissão do Boo: ${label}`}
      title={`Permissão do Boo: ${label}`}
      data-approval-mode={mode}
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--composer-chip-border,var(--border-default))] px-2.5 text-[11.5px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--composer-hover-surface,var(--bg-hover))] hover:text-[var(--text-primary)] disabled:opacity-60"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{label}</span>
      <ChevronDown aria-hidden="true" className="size-3 text-[var(--text-muted)]" />
    </button>
    <Dropdown open={open} onClose={() => setOpen(false)} anchor={trigger} align="left" width={260}>
      <MenuSection>Permissão do Boo</MenuSection>
      {MODES.map(item => <MenuItem
        key={item.id}
        label={item.label}
        hint={item.hint}
        onClick={() => { setOpen(false); if (item.id !== mode) onSelect(item.id) }}
      />)}
    </Dropdown>
  </>
}
