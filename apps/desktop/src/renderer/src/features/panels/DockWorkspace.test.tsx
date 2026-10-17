import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DockWorkspace, type DockWorkspaceHandle } from './DockWorkspace'

vi.mock('@/components/ide/TerminalPanel', () => ({ default: () => <div>Terminal de teste</div> }))
vi.mock('./MonacoCodeEditor', () => ({ MonacoCodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <><textarea aria-label="Editor de código simulado" value={value} onChange={event => onChange(event.target.value)} /><pre>{value}</pre></> }))

const mockAPI = {
  listProjectFiles: vi.fn(),
  readProjectFile: vi.fn(),
}
beforeEach(() => {
  localStorage.removeItem('politron.dock.layout.v1')
  localStorage.removeItem('politron.dock.layout.v2')
  mockAPI.listProjectFiles.mockReset().mockResolvedValue([
    { name: 'src', path: 'src', directory: true },
    { name: 'README.md', path: 'README.md', directory: false },
  ])
  mockAPI.readProjectFile.mockReset().mockResolvedValue({ path: 'README.md', name: 'README.md', content: '# Olá Politron', hash: 'a'.repeat(64) })
  vi.stubGlobal('appAPI', mockAPI)
})

function setup() {
  const ref = createRef<DockWorkspaceHandle>()
  const result = render(<DockWorkspace ref={ref} workspaceId="workspace-1" agents={[]} selectedAgents={[]} browserFrames={[]} onRefreshBrowser={vi.fn()} onChanged={vi.fn()} workspaceDiff=""><div>Chat existente</div></DockWorkspace>)
  return { ref, ...result }
}

describe('abas e painéis móveis do Politron', () => {
  it('abre explorador na lateral e arquivo na área principal', async () => {
    const { ref } = setup()
    expect(screen.getByText('Chat existente')).toBeInTheDocument()
    act(() => ref.current!.openTool('files', 'side'))
    expect(screen.getByRole('region', { name: 'Painel auxiliar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aba Arquivos' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'README.md' }))
    expect(screen.getByRole('button', { name: 'Aba README.md' })).toBeInTheDocument()
    await waitFor(() => expect(mockAPI.readProjectFile).toHaveBeenCalledWith('workspace-1', 'README.md'))
    expect(await screen.findByRole('textbox', { name: 'Editor de código simulado' })).toHaveValue('# Olá Politron')
  })

  it('preserva alterações ao mover a aba do arquivo e impede fechar sem confirmação', async () => {
    const { ref } = setup()
    act(() => ref.current!.openFile('workspace-1', 'README.md'))
    const editor = await screen.findByRole('textbox', { name: 'Editor de código simulado' })
    fireEvent.change(editor, { target: { value: 'rascunho importante' } })
    expect(screen.getByLabelText('Arquivo modificado')).toBeInTheDocument()
    act(() => ref.current!.openTool('files', 'side'))
    const data = new Map<string, string>()
    const dataTransfer = { types: ['application/x-politron-tab'], setData: (key: string, value: string) => data.set(key, value), getData: (key: string) => data.get(key) || '' }
    fireEvent.dragStart(screen.getByRole('button', { name: 'Aba README.md' }), { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: 'Painel auxiliar' }), { dataTransfer })
    expect(await screen.findByRole('textbox', { name: 'Editor de código simulado' })).toHaveValue('rascunho importante')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar README.md' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Aba README.md' })).toBeInTheDocument()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar README.md' }))
    expect(screen.queryByRole('button', { name: 'Aba README.md' })).not.toBeInTheDocument()
    confirm.mockRestore()
  })

  it('move o chat para o painel auxiliar sem duplicar abas e mantém posição', () => {
    const { ref } = setup()
    act(() => ref.current!.openTool('chat', 'side'))
    expect(screen.getAllByRole('button', { name: 'Aba Chat' })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Painel auxiliar' })).toContainElement(screen.getByText('Chat existente'))
    const saved = JSON.parse(localStorage.getItem('politron.dock.layout.v2') || '{}')
    expect(saved.root).toBeDefined()
    expect(screen.getAllByRole('button', { name: 'Aba Chat' })).toHaveLength(1)
  })

  it('permite arrastar o chat para a outra área', () => {
    const { ref } = setup()
    act(() => ref.current!.openTool('files', 'side'))
    const data = new Map<string, string>()
    const dataTransfer = {
      types: ['application/x-politron-tab'],
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) || '',
    }
    fireEvent.dragStart(screen.getByRole('button', { name: 'Aba Chat' }), { dataTransfer })
    fireEvent.drop(screen.getByRole('region', { name: 'Painel auxiliar' }), { dataTransfer })
    expect(screen.getByText('Chat existente')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Aba Chat' })).toHaveLength(1)
  })

  it('permite fechar uma ferramenta e abrir mascote em nova aba', () => {
    const { ref } = setup()
    act(() => ref.current!.openTool('mascot', 'side'))
    expect(screen.getByRole('region', { name: 'Visualização do mascote' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Mascote' }))
    expect(screen.queryByRole('region', { name: 'Painel auxiliar' })).not.toBeInTheDocument()
  })

  it('aplica layout IDE de quatro regiões e abre arquivos no editor central', async () => {
    const { ref } = setup()
    act(() => ref.current!.useDevelopmentLayout())
    expect(screen.getAllByRole('separator', { name: 'Redimensionar painéis' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Aba Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aba Arquivos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aba Terminal' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'README.md' }))
    expect(screen.getByRole('button', { name: 'Aba README.md' })).toBeInTheDocument()
    expect(screen.getAllByRole('separator', { name: 'Redimensionar painéis' })).toHaveLength(3)
    const ratio = screen.getAllByRole('separator', { name: 'Redimensionar painéis' }).at(-1)!
    fireEvent.keyDown(ratio, { key: 'ArrowDown' })
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('politron.dock.layout.v2') || '{}')
      expect(saved.root.ratio).toBe(75)
    })
  })

  it('recupera layout persistido após desmontar e remontar', () => {
    const first = setup()
    act(() => first.ref.current!.openTool('diff', 'side'))
    first.unmount()
    setup()
    expect(screen.getByRole('button', { name: 'Aba Alterações' })).toBeInTheDocument()
  })
})
