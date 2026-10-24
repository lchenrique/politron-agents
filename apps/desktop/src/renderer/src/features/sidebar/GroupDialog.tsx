import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface GroupDraft { mode: 'create' | 'rename'; value: string; original?: string; workspaceId?: string }

/** Dialog de criacao e renomeacao de pasta de projetos. */
export function GroupDialog({ draft, onChange, onCancel, onConfirm }: {
  draft: GroupDraft | null
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return <Dialog open={!!draft} onOpenChange={open => { if (!open) onCancel() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{draft?.mode === 'rename' ? 'Renomear pasta' : 'Nova pasta de projetos'}</DialogTitle>
        <DialogDescription>{draft?.mode === 'rename' ? 'O novo nome organiza os projetos desta pasta no sidebar.' : 'Agrupe projetos sob um nome para organizar o sidebar.'}</DialogDescription>
      </DialogHeader>
      <Input autoFocus value={draft?.value || ''} onChange={event => onChange(event.target.value)} placeholder="Nome da pasta" aria-label="Nome da pasta" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onConfirm() } }} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onConfirm}>Salvar</Button>
      </div>
    </DialogContent>
  </Dialog>
}
