import { Button } from '@/components/ui/button'
import { Modal } from '@/components/dsh'
import { Input } from '@/components/ui/input'

export interface GroupDraft { mode: 'create' | 'rename'; value: string; original?: string; workspaceId?: string }

/** Dialog de criacao e renomeacao de pasta de projetos. */
export function GroupDialog({ draft, onChange, onCancel, onConfirm }: {
  draft: GroupDraft | null
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const title = draft?.mode === 'rename' ? 'Renomear pasta' : 'Nova pasta de projetos'
  const description = draft?.mode === 'rename' ? 'O novo nome organiza os projetos desta pasta no sidebar.' : 'Agrupe projetos sob um nome para organizar o sidebar.'
  return <Modal open={!!draft} onClose={onCancel} title={title} description={description} closeLabel="Fechar"
    footer={<><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button onClick={onConfirm}>Salvar</Button></>}>
    <Input data-modal-autofocus value={draft?.value || ''} onChange={event => onChange(event.target.value)} placeholder="Nome da pasta" aria-label="Nome da pasta" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onConfirm() } }} />
  </Modal>
}
