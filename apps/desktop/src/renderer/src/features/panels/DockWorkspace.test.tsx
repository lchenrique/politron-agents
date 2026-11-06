import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
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
  // O painel Mascote monta a ligação; forneça a fronteira Electron sem simular sua UI.
  vi.stubGlobal('realtimeAPI', {
    status: vi.fn().mockResolvedValue({}),
    onEvent: vi.fn(() => () => undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  })
})

function setup(chrome: Pick<ComponentProps<typeof DockWorkspace>, 'chatTab' | 'chatHeader'> = {}) {
  const ref = createRef<DockWorkspaceHandle>()
  const result = render(<DockWorkspace ref={ref} {...chrome} workspaceId="workspace-1" agents={[]} selectedAgents={[]} onChanged={vi.fn()} workspaceDiff=""><div>Chat existente</div></DockWorkspace>)
  return { ref, ...result }
}

describe('abas e painéis móveis do Politron', () => {
  it('abre menus DSH para adicionar e organizar painéis', () => {
    const { ref } = setup()
    act(() => ref.current!.openTool('diff', 'main'))
    fireEvent.click(screen.getByRole('button', { name: 'Nova aba' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Arquivos' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Organizar área principal' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
    expect(screen.getByRole('menuitem', { name: 'Dividir à esquerda com aba atual' })).toBeInTheDocument()
  })

  it('mostra a faixa de abas só quando há mais de uma aba no layout', async () => {
    const { ref } = setup()
    expect(screen.getByText('Chat existente')).toBeInTheDocument()
    expect(screen.queryByTestId('dock-group-header')).not.toBeInTheDocument()

    act(() => ref.current!.openTool('files', 'main'))
    expect(screen.getByTestId('dock-group-header')).toContainElement(screen.getByRole('button', { name: 'Aba Chat' }))
    await screen.findByRole('tree', { name: 'Arquivos do projeto' })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Arquivos' }))
    expect(screen.queryByTestId('dock-group-header')).not.toBeInTheDocument()
    expect(screen.getByText('Chat existente')).toBeVisible()
  })

  it('mantém agentes como painel opcional e mostra estado vazio quando não há delegações', () => {
    const { ref } = setup()
    act(() => ref.current!.openTool('diff', 'main'))
    fireEvent.click(screen.getByRole('button', { name: 'Nova aba' }))
    expect(screen.getByRole('menuitem', { name: 'Agentes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Agentes' }))
    expect(screen.getByRole('region', { name: 'Agentes delegados' })).toHaveTextContent('Nenhuma delegação nesta conversa')
    expect(screen.getByRole('button', { name: 'Aba Agentes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aba Chat' })).toBeInTheDocument()
    expect(ref.current).toBeTruthy()
  })

  it('nomeia a aba principal pelo conteúdo exibido', () => {
    const { ref } = setup({ chatTab: { label: 'Central' } })
    act(() => ref.current!.openTool('diff', 'main'))
    expect(screen.getByRole('button', { name: 'Aba Central' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aba Chat' })).not.toBeInTheDocument()
  })

  it('nunca empilha faixa de abas e faixa da conversa: a aba do chat assume a identidade', () => {
    const { ref } = setup({
      chatHeader: <header data-testid="conversation-row">Lyra · Planejamento</header>,
      chatTab: { label: 'Lyra', title: 'Lyra · Planejamento', leading: <button type="button">Ver detalhes de Lyra</button>, trailing: <button type="button">Buscar no histórico desta conversa</button> },
    })
    expect(screen.getByTestId('conversation-row')).toBeInTheDocument()
    expect(screen.queryByTestId('dock-group-header')).not.toBeInTheDocument()

    act(() => ref.current!.openTool('files', 'side'))
    expect(screen.queryByTestId('conversation-row')).not.toBeInTheDocument()
    const chatTab = screen.getByTestId('chat-tab')
    expect(chatTab).toContainElement(screen.getByRole('button', { name: 'Aba Lyra' }))
    expect(chatTab).toContainElement(screen.getByRole('button', { name: 'Ver detalhes de Lyra' }))
    expect(chatTab).toContainElement(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' }))
    expect(chatTab).toContainElement(screen.getByRole('button', { name: 'Fechar Lyra' }))
    expect(screen.queryByRole('button', { name: 'Aba Chat' })).not.toBeInTheDocument()

    // Com outra aba ativa no mesmo grupo, a aba do chat fica compacta (sem busca e ações).
    act(() => ref.current!.openTool('diff', 'main'))
    expect(screen.queryByTestId('conversation-row')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-tab')).toContainElement(screen.getByRole('button', { name: 'Ver detalhes de Lyra' }))
    expect(screen.queryByRole('button', { name: 'Buscar no histórico desta conversa' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aba Lyra' }))
    expect(screen.getByRole('button', { name: 'Buscar no histórico desta conversa' })).toBeInTheDocument()
  })

  it('abre explorador na lateral e arquivo na área principal', async () => {
    const { ref } = setup()
    expect(screen.getByText('Chat existente')).toBeInTheDocument()
    act(() => ref.current!.openTool('files', 'side'))
    expect(screen.getByRole('region', { name: 'Painel auxiliar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aba Arquivos' })).toBeInTheDocument()
    fireEvent.click(await screen.findByText('README.md'))
    expect(screen.getByRole('button', { name: 'Aba README.md' })).toBeInTheDocument()
    expect(screen.getAllByRole('separator', { name: 'Redimensionar painéis' })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Área de trabalho principal' })).toContainElement(screen.getByRole('button', { name: 'Aba README.md' }))
    await waitFor(() => expect(mockAPI.readProjectFile).toHaveBeenCalledWith('workspace-1', 'README.md'))
    expect(await screen.findByRole('textbox', { name: 'Editor de código simulado' })).toHaveValue('# Olá Politron')
  })

  it('usa File Tree da Pasta UI e carrega pastas sob demanda, sem reler ao recolher', async () => {
    mockAPI.listProjectFiles.mockImplementation(async (_workspace: string, path: string) => {
      if (path === 'src') return [{ name: 'entry.ts', path: 'src/entry.ts', directory: false }]
      return [{ name: 'src', path: 'src', directory: true }, { name: 'README.md', path: 'README.md', directory: false }]
    })
    const { ref } = setup()
    act(() => ref.current!.openTool('files', 'side'))
    expect(await screen.findByRole('tree', { name: 'Arquivos do projeto' })).toBeInTheDocument()
    expect(mockAPI.listProjectFiles).toHaveBeenCalledWith('workspace-1', '')
    expect(mockAPI.listProjectFiles).not.toHaveBeenCalledWith('workspace-1', 'src')
    fireEvent.click(await screen.findByText('src'))
    await waitFor(() => expect(mockAPI.listProjectFiles).toHaveBeenCalledWith('workspace-1', 'src'))
    expect(await screen.findByRole('treeitem', { name: 'entry.ts' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('src'))
    fireEvent.click(screen.getByText('src'))
    expect(await screen.findByRole('treeitem', { name: 'entry.ts' })).toBeInTheDocument()
    expect(mockAPI.listProjectFiles.mock.calls.filter(([, path]) => path === 'src')).toHaveLength(1)
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
    expect(screen.getByRole('region', { name: 'Boo ao vivo' })).toBeInTheDocument()
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
    fireEvent.click(await screen.findByText('README.md'))
    expect(screen.getByRole('button', { name: 'Aba README.md' })).toBeInTheDocument()
    expect(screen.getAllByRole('separator', { name: 'Redimensionar painéis' })).toHaveLength(3)
    const ratio = screen.getAllByRole('separator', { name: 'Redimensionar painéis' }).at(-1)!
    ratio.focus()
    expect(ratio).toHaveFocus()
    // O jsdom não calcula layout real do ResizeObserver; teclado/drag exige browser.
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('politron.dock.layout.v2') || '{}')
      expect(saved.root.ratio).toBe(72)
    })
  })

  it('recupera layout persistido após desmontar e remontar', () => {
    const first = setup()
    act(() => first.ref.current!.openTool('diff', 'side'))
    first.unmount()
    setup()
    expect(screen.getByRole('button', { name: 'Aba Alterações' })).toBeInTheDocument()
  })

  it('reabre o layout salvo com o navegador do agente usando o navegador compartilhado', async () => {
    window.platformBrowserAPI = {
      navigate: vi.fn(async () => ({ url: 'https://example.com/', title: '', loading: false, canGoBack: false, canGoForward: false, error: null })),
      state: vi.fn(async () => null), setBounds: vi.fn(async () => undefined), back: vi.fn(async () => undefined), forward: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined), openExternal: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
      setSharingContext: vi.fn(async () => undefined), grantSharing: vi.fn(async () => undefined), revokeSharing: vi.fn(async () => undefined),
      onState: vi.fn(() => () => undefined),
    } as never
    localStorage.setItem('politron.dock.layout.v2', JSON.stringify({
      root: { type: 'group', id: 'g1', tabs: [{ id: 'browser', kind: 'browser', label: 'Navegador do agente' }], active: 'browser' },
      activeGroup: 'g1',
    }))
    try {
      setup()
      expect(screen.getByRole('button', { name: 'Aba Navegador' })).toBeInTheDocument()
      expect(await screen.findByRole('textbox', { name: 'Endereço' })).toBeInTheDocument()
      expect(screen.queryByText('Navegador dos agentes')).not.toBeInTheDocument()
    } finally {
      delete window.platformBrowserAPI
    }
  })
})
