import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Agent, Snapshot, WorkspaceEvent } from '../../../../shared/v9'
import { emptySnapshot } from './appShellShared'

const observed = vi.hoisted(() => ({ renders: [] as Array<{ agents: Agent[]; assistant: Agent }> }))
vi.mock('@/shell/workspace-sidebar', () => ({ WorkspaceSidebar: () => null }))
vi.mock('@/shell/top-bar', () => ({ TopBar: ({ onOpenSettings }: { onOpenSettings: () => void }) => <button type="button" onClick={onOpenSettings}>Configurações</button> }))
vi.mock('@/shell/activity-rail', () => ({ ActivityRail: () => null }))
vi.mock('@/shell/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/shell/settings/settings-overlay', () => ({ SettingsOverlay: ({ open, initialSection }: { open: boolean; initialSection?: string }) => open ? <div data-testid="settings-page">{initialSection}</div> : null }))
vi.mock('../panels/DockWorkspace', () => ({ DockWorkspace: ({ children, agents, assistant }: { children: ReactNode; agents: Agent[]; assistant: Agent }) => { observed.renders.push({ agents, assistant }); return children } }))
vi.mock('./AgentDetails', () => ({ AgentDetails: () => null }))
vi.mock('./SettingsPage', () => ({ SettingsPage: ({ initialSection }: { initialSection?: string }) => <div data-testid="settings-page">{initialSection}</div> }))
vi.mock('./UpdateReadyCallout', () => ({ UpdateReadyCallout: () => null }))
vi.mock('../editors/Editor', () => ({ Editor: () => null }))
vi.mock('../composer/Composer', () => ({ Composer: () => null }))
vi.mock('../chat/ChatHeader', () => ({ ChatHeader: () => null, ConversationAvatar: () => null, ConversationTools: () => null, conversationIdentity: () => ({ identities: [], isGroup: false, title: '', subtitle: undefined }) }))
vi.mock('../chat/MessageList', () => ({ MessageList: () => null }))
vi.mock('../chat/useConversationHistory', () => {
  const noop = () => undefined
  const history = { messages: [], hasOlderMessages: false, hasNewerMessages: false, focusedMessageId: null, queueMessage: noop, loadOlder: noop, search: noop, openSearchHit: noop, returnToLatest: noop, reconcileAfterReconnect: noop }
  return { useConversationHistory: () => history }
})

import AppShell from './AppShell'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); observed.renders.length = 0 })

function stubApp(snapshotAPI: () => Promise<Snapshot> = async () => emptySnapshot) {
  vi.stubGlobal('appAPI', { snapshot: snapshotAPI, onEvent: () => () => undefined, setVisibleConversation: async () => undefined, workspaceDiff: async () => '' })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
}

it('abre o sidebar com os 248px do design quando não há preferência salva', async () => {
  localStorage.clear()
  stubApp()
  let container!: HTMLElement
  await act(async () => { container = render(<AppShell />).container })
  expect(container.querySelector('[data-sidebar-width]')).toHaveStyle({ width: '248px' })
})

it('abre a área de trabalho encostada no chrome, sem canvas elevado', async () => {
  localStorage.clear()
  stubApp()
  let container!: HTMLElement
  await act(async () => { container = render(<AppShell />).container })
  const shell = container.firstElementChild as HTMLElement
  expect(shell).toHaveClass('boobot-chrome')
  expect(container.querySelector('.ds-canvas')).not.toBeInTheDocument()
  expect(container.querySelector('main')).toBeInTheDocument()
})

it('preserva a largura de sidebar previamente salva', async () => {
  localStorage.setItem('politron.sidebar.width', '312')
  stubApp()
  let container!: HTMLElement
  await act(async () => { container = render(<AppShell />).container })
  expect(container.querySelector('[data-sidebar-width]')).toHaveStyle({ width: '312px' })
})

it('não renderiza novamente a árvore ao receber dez snapshots IPC idênticos', async () => {
  vi.useFakeTimers()
  let snapshot: Snapshot = {
    ...emptySnapshot,
    agents: Array.from({ length: 40 }, (_, index) => ({ ...emptySnapshot.assistant, id: `boo-${index}`, name: `Boo ${index}` })),
  }
  let event!: (event: WorkspaceEvent) => void
  const snapshotAPI = vi.fn(async () => JSON.parse(JSON.stringify(snapshot)) as Snapshot)
  vi.stubGlobal('appAPI', { snapshot: snapshotAPI, onEvent: (listener: typeof event) => { event = listener; return () => undefined }, setVisibleConversation: async () => undefined, workspaceDiff: async () => '' })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
  await act(async () => { render(<AppShell />) })
  const initial = observed.renders.at(-1)!
  observed.renders.length = 0

  for (let index = 0; index < 10; index++) {
    await act(async () => {
      event({ type: 'changed' })
      await vi.advanceTimersByTimeAsync(100)
    })
  }
  expect(snapshotAPI).toHaveBeenCalledTimes(11)
  expect(observed.renders).toHaveLength(0)

  // Uma alteração real continua chegando; agentes que não mudaram conservam a identidade.
  snapshot = { ...snapshot, terminalEnabled: false }
  await act(async () => { event({ type: 'changed' }); await vi.advanceTimersByTimeAsync(100) })
  expect(observed.renders).toHaveLength(1)
  expect(observed.renders[0].agents).toBe(initial.agents)
  expect(observed.renders[0].assistant).toBe(initial.assistant)
})

it('abre Configurações como overlay, pelo topo e pelo evento do app', async () => {
  localStorage.clear()
  stubApp()
  await act(async () => { render(<AppShell />) })
  expect(screen.queryByTestId('settings-page')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
  expect(await screen.findByTestId('settings-page')).toHaveTextContent('geral')
  await act(async () => { window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'voz' })) })
  expect(await screen.findByTestId('settings-page')).toHaveTextContent('voz')
})

it('aplica a largura de conteúdo salva em --content-width', async () => {
  localStorage.setItem('politron.layout.content-width', 'wide')
  stubApp()
  await act(async () => { render(<AppShell />) })
  expect(document.documentElement.style.getPropertyValue('--content-width')).toBe('1080px')
})
