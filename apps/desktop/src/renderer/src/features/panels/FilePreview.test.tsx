import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePreview, isBinaryImage, previewKind, type FileDraft } from './FilePreview'

vi.mock('./MonacoCodeEditor', () => ({
  MonacoCodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <textarea aria-label="Código Monaco simulado" value={value} onChange={event => onChange(event.target.value)} />,
}))

const readProjectFile = vi.fn()
const writeProjectFile = vi.fn()
const readProjectImage = vi.fn()
const openProjectPath = vi.fn()
const HASH = 'a'.repeat(64)
const NEW_HASH = 'b'.repeat(64)
function TestEditor({ path = 'src/index.ts' }: { path?: string }) {
  const [draft, setDraft] = useState<FileDraft | undefined>()
  return <FilePreview workspaceId="workspace-1" path={path} draft={draft} onDraftChange={updater => setDraft(updater)} />
}

beforeEach(() => {
  readProjectFile.mockReset().mockResolvedValue({ content: 'const original = true', hash: HASH, path: 'src/index.ts', name: 'index.ts' })
  writeProjectFile.mockReset().mockResolvedValue({ path: 'src/index.ts', hash: NEW_HASH })
  vi.stubGlobal('appAPI', { readProjectFile, writeProjectFile, readProjectImage, openProjectPath })
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

describe('pré-visualização de arquivos', () => {
  it('detecta os tipos com prévia', () => {
    expect(['README.md', 'docs/a.MDX', 'site/index.html', 'a.htm', 'img/x.PNG', 'y.jpeg', 'z.svg', 'w.webp', 'v.gif'].map(previewKind))
      .toEqual(['markdown', 'markdown', 'html', 'html', 'image', 'image', 'image', 'image', 'image'])
    expect(previewKind('src/index.ts')).toBeUndefined()
    expect(previewKind('Makefile')).toBeUndefined()
    expect(isBinaryImage('a.png')).toBe(true)
    expect(isBinaryImage('a.svg')).toBe(false)
  })

  it('alterna entre código e Markdown renderizado', async () => {
    readProjectFile.mockResolvedValue({ content: '# Título\n\ntexto', hash: HASH, path: 'README.md', name: 'README.md' })
    render(<TestEditor path="README.md" />)
    await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar' }))
    expect(await screen.findByRole('heading', { name: 'Título' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pré-visualizar' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renderiza HTML em iframe sem scripts', async () => {
    readProjectFile.mockResolvedValue({ content: '<script>alert(1)</script><p>oi</p>', hash: HASH, path: 'a.html', name: 'a.html' })
    render(<TestEditor path="a.html" />)
    await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar' }))
    const frame = await screen.findByTitle('Pré-visualização de a.html')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'")
  })

  it('abre imagens direto na prévia, sem ler como texto', async () => {
    readProjectImage.mockResolvedValue({ path: 'logo.png', dataUrl: 'data:image/png;base64,AA==' })
    render(<TestEditor path="img/logo.png" />)
    expect(await screen.findByRole('img', { name: 'logo.png' })).toHaveAttribute('src', 'data:image/png;base64,AA==')
    expect(readProjectFile).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Código' })).not.toBeInTheDocument()
  })

  it('pede ao processo principal para abrir o arquivo no VS Code e mostra o aviso de falha', async () => {
    openProjectPath.mockRejectedValue(new Error('VS Code não encontrado.'))
    render(<TestEditor />)
    await screen.findByRole('textbox', { name: 'Código Monaco simulado' })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no VS Code' }))
    expect(openProjectPath).toHaveBeenCalledWith('workspace-1', 'src/index.ts', 'vscode')
    expect(await screen.findByRole('alert')).toHaveTextContent('VS Code não encontrado.')
  })
})
