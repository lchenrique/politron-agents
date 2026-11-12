import { useEffect, useState } from 'react'
import { ClipboardList, Paperclip, Plus } from 'lucide-react'
import { Menu, type MenuEntry } from '@/components/dsh'
import { Button } from '@/components/ui/button'

/**
 * Menu do "+" do composer, como no mock ("Anexar arquivo, comando ou permissão"):
 * o anexo e o modo planejamento dividem o mesmo gatilho, então a prancheta sai da
 * linha do campo sem perder o acesso ao estado de planejamento.
 */
export function AttachMenu({ openFiles, planMode, onTogglePlanMode, disabled = false, className }: {
  /** Abre o seletor de arquivos nativo do PromptInput. */
  openFiles: () => void
  /** Planejamento ligado: o item aparece marcado e o gatilho fica destacado. */
  planMode: boolean
  onTogglePlanMode: () => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  // Ordem do mock: anexar primeiro, autonomia depois.
  const items: MenuEntry[] = [
    { id: 'files', label: 'Anexar arquivos', icon: <Paperclip aria-hidden="true" className="size-3.5" /> },
    { id: 'plan', label: 'Modo planejamento', icon: <ClipboardList aria-hidden="true" className="size-3.5" /> },
  ]

  return <Menu
    open={open}
    onClose={() => setOpen(false)}
    side="top"
    align="start"
    portal
    items={items}
    selectedIds={planMode ? ['plan'] : []}
    onSelect={id => {
      setOpen(false)
      if (id === 'files') openFiles()
      else if (id === 'plan') onTogglePlanMode()
    }}
    className={className}
    anchor={<Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Anexar arquivo, comando ou permissão"
      title="Anexar arquivo, comando ou permissão"
      data-plan-mode={planMode ? 'true' : undefined}
      onClick={() => setOpen(current => !current)}
    ><Plus aria-hidden="true" className="size-4" /></Button>}
  />
}
