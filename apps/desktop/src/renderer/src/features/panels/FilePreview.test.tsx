import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePreview, type FileDraft } from './FilePreview'

vi.mock('./MonacoCodeEditor', () => ({
  MonacoCodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <textarea aria-label="Código Monaco simulado" value={value} onChange={event => onChange(event.target.value)} />,
}))

const readProjectFile = vi.fn()
const writeProjectFile = vi.fn()
const HASH = 'a'.repeat(64)
const NEW_HASH = 'b'.repeat(64)
function TestEditor() {
  const [draft, setDraft] = useState<FileDraft | undefined>()
  return <FilePreview workspaceId="workspace-1" path="src/index.ts" draft={draft} onDraftChange={updater => setDraft(updater)} />
}

beforeEach(() => {
  readProjectFile.mockReset().mockResolvedValue({ content: 'const original = true', hash: HASH, path: 'src/index.ts', name: 'index.ts' })
  writeProjectFile.mockReset().mockResolvedValue({ path: 'src/index.ts', hash: NEW_HASH })
  vi.stubGlobal('appAPI', { readProjectFile, writeProjectFile })
})

describe('Monaco Editor dentro das abas', () => {
  it('carrega arquivo real, indica alterações, salva com hash e limpa o indicador', async () => {
    render(<TestEditor />)
    const editor = await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    expect(editor).toHaveValue('const original = true')
    fireEvent.change(editor, { target: { value: 'const original = false' } })
    expect(screen.getByLabelText('Alterações não salvas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar arquivo' }))
    await waitFor(() => expect(writeProjectFile).toHaveBeenCalledWith('workspace-1', 'src/index.ts', 'const original = false', HASH))
    await waitFor(() => expect(screen.queryByLabelText('Alterações não salvas')).not.toBeInTheDocument())
  })

  it('mantém o rascunho e mostra conflito quando o agente altera o mesmo arquivo', async () => {
    writeProjectFile.mockRejectedValueOnce(new Error('Arquivo alterado no disco'))
    render(<TestEditor />)
    const editor = await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    fireEvent.change(editor, { target: { value: 'minha alteração' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar arquivo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo alterado no disco')
    expect(editor).toHaveValue('minha alteração')
    expect(screen.getByLabelText('Alterações não salvas')).toBeInTheDocument()
  })

  it('não recarrega um rascunho modificado sem confirmação', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TestEditor />)
    const editor = await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    fireEvent.change(editor, { target: { value: 'texto importante' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar arquivo' }))
    expect(confirm).toHaveBeenCalled()
    expect(editor).toHaveValue('texto importante')
    expect(readProjectFile).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
