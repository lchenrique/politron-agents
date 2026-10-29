import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ActionSearchBar from '@/components/kokonutui/action-search-bar'
import TitleBar from './TitleBar'
import { WorkspaceSearch } from '../../features/sidebar/WorkspaceSearch'
import { emptySnapshot } from '../../features/app/appShellShared'
import type { Workspace } from '../../../../shared/v9'

afterEach(() => vi.unstubAllGlobals())

it.each(['win32', 'darwin'])('coloca logo, toggle e busca na barra da janela em %s', platform => {
  vi.stubGlobal('vibeAPI', { platform })
  const onOpenHome = vi.fn()
  const onToggleSidebar = vi.fn()
  const props = { onOpenTool: vi.fn(), sidebarCollapsed: false, onToggleSidebar, onOpenHome, search: <ActionSearchBar iconOnly items={[]} label="Busca rápida" /> }
  render(<TitleBar {...props} />)
  const toolbar = screen.getByRole('toolbar', { name: 'Barra da janela' })
  const home = within(toolbar).getByRole('button', { name: 'Ir para a central' })
  const toggle = within(toolbar).getByRole('button', { name: 'Recolher barra lateral' })
  const search = within(toolbar).getByRole('button', { name: 'Busca rápida' })
  expect(home.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(toggle.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(home)
  fireEvent.click(toggle)
  expect(onOpenHome).toHaveBeenCalledOnce()
  expect(onToggleSidebar).toHaveBeenCalledOnce()
})

it('mantém a faixa Windows de 40 px e controles de janela acessíveis', () => {
  const windowControls = { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() }
  vi.stubGlobal('vibeAPI', { platform: 'win32', windowControls })
  render(<TitleBar onOpenTool={vi.fn()} sidebarCollapsed={false} onToggleSidebar={vi.fn()} onOpenHome={vi.fn()} />)
  const toolbar = screen.getByRole('toolbar', { name: 'Barra da janela' })
  expect(toolbar).toHaveClass('h-10')
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Minimizar' }))
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Maximizar' }))
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Ocultar Boobot na bandeja' }))
  expect(windowControls.minimize).toHaveBeenCalledOnce()
  expect(windowControls.maximize).toHaveBeenCalledOnce()
  expect(windowControls.close).toHaveBeenCalledOnce()
})

it('mantém a busca e Ctrl+K disponíveis depois de recolher a lateral', () => {
  vi.stubGlobal('vibeAPI', { platform: 'win32' })
  const onSelectWorkspace = vi.fn()
  const onSectionChange = vi.fn()
  const workspace: Workspace = { id: 'workspace-1', name: 'Projeto de teste', kind: 'free', path: 'C:/workspace', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '2026-10-24T00:00:00.000Z' }
  function WindowHeader() {
    const [collapsed, setCollapsed] = useState(false)
    const props = { onOpenTool: vi.fn(), sidebarCollapsed: collapsed, onToggleSidebar: () => setCollapsed(value => !value), search: <WorkspaceSearch snapshot={{ ...emptySnapshot, workspaces: [workspace] }} onSelectWorkspace={onSelectWorkspace} onSelectConversation={vi.fn()} onStartConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenEditor={vi.fn()} onSectionChange={onSectionChange} /> }
    return <TitleBar {...props} />
  }
  render(<WindowHeader />)
  fireEvent.click(screen.getByRole('button', { name: 'Recolher barra lateral' }))
  expect(screen.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Busca rápida' })).toBeVisible()
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  const input = screen.getByRole('combobox', { name: 'Busca rápida' })
  fireEvent.change(input, { target: { value: 'Projeto de teste' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onSelectWorkspace).toHaveBeenCalledWith('workspace-1')
  expect(onSectionChange).toHaveBeenCalledWith('projects')
})

it.each(['win32', 'darwin'])('mostra o local atual depois da navegação em %s', platform => {
  vi.stubGlobal('vibeAPI', { platform })
  render(<TitleBar onOpenTool={vi.fn()} sidebarCollapsed={false} onToggleSidebar={vi.fn()} onOpenHome={vi.fn()} location={{ label: 'Politron', detail: 'feature/topo' }} />)
  const toolbar = screen.getByRole('toolbar', { name: 'Barra da janela' })
  const location = within(toolbar).getByTestId('window-location')
  expect(location).toHaveTextContent('Politron')
  expect(location).toHaveTextContent('feature/topo')
  expect(within(toolbar).getByRole('button', { name: 'Recolher barra lateral' }).compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(location.compareDocumentPosition(within(toolbar).getByRole('button', { name: 'Abrir painéis e abas' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('mostra o local atual também na PWA', () => {
  render(<TitleBar browserMode sidebarCollapsed={false} onToggleSidebar={vi.fn()} onOpenTool={vi.fn()} location={{ label: 'Central do Chief' }} />)
  expect(screen.getByTestId('window-location')).toHaveTextContent('Central do Chief')
})

it.each([false, true])('oferece somente Light e Dark na barra (PWA: %s)', browserMode => {
  vi.stubGlobal('vibeAPI', { platform: 'win32' })
  render(<TitleBar browserMode={browserMode} onOpenTool={vi.fn()} sidebarCollapsed={false} onToggleSidebar={vi.fn()} />)
  const modes = screen.getByRole('radiogroup', { name: 'Modo de cor' })
  expect(within(modes).getAllByRole('radio').map(radio => radio.getAttribute('aria-label'))).toEqual(['Light', 'Dark'])
  expect(screen.queryByRole('combobox', { name: 'Selecionar tema' })).not.toBeInTheDocument()
})

it('mantém a navegação própria da PWA sem controles desktop extras', () => {
  const props = { browserMode: true, sidebarCollapsed: false, onToggleSidebar: vi.fn(), onOpenTool: vi.fn(), search: <ActionSearchBar iconOnly label="Busca rápida" /> }
  render(<TitleBar {...props} />)
  expect(screen.getByRole('button', { name: 'Recolher sidebar' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Abrir painel direito' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Busca rápida' })).not.toBeInTheDocument()
})
