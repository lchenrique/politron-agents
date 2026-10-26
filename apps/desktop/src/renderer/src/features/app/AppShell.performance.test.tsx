import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Snapshot, WorkspaceEvent } from '../../../../shared/v9'
import { emptySnapshot } from './appShellShared'

const observed = vi.hoisted(() => ({ snapshots: [] as Snapshot[], sidebarSizes: [] as (number | undefined)[] }))
vi.mock('../sidebar/Sidebar', () => ({ Sidebar: ({ snapshot }: { snapshot: Snapshot }) => { observed.snapshots.push(snapshot); return null } }))
vi.mock('@/components/ide/TitleBar', () => ({ default: () => null }))
vi.mock('../panels/DockWorkspace', () => ({ DockWorkspace: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/ui/resizable', () => ({ ResizablePanelGroup: ({ children, defaultLayout }: { children: ReactNode; defaultLayout?: { sidebar?: number } }) => { observed.sidebarSizes.push(defaultLayout?.sidebar); return children }, ResizablePanel: ({ children }: { children: ReactNode }) => children, ResizableHandle: () => null }))
vi.mock('./AgentDetails', () => ({ AgentDetails: () => null }))
vi.mock('./SettingsPage', () => ({ SettingsPage: () => null }))
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

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); observed.snapshots.length = 0; observed.sidebarSizes.length = 0 })

it('usa 32% como largura inicial sem preferência salva', async () => {
  localStorage.clear()
  let event!: (event: WorkspaceEvent) => void
  vi.stubGlobal('appAPI', { snapshot: async () => emptySnapshot, onEvent: (listener: typeof event) => { event = listener; return () => undefined }, setVisibleConversation: async () => undefined })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
  await act(async () => { render(<AppShell />) })
  expect(observed.sidebarSizes.at(-1)).toBe(32)
})

it('abre a área de trabalho num canvas elevado sobre o chrome da janela', async () => {
  localStorage.clear()
  vi.stubGlobal('appAPI', { snapshot: async () => emptySnapshot, onEvent: () => () => undefined, setVisibleConversation: async () => undefined })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
  let container!: HTMLElement
  await act(async () => { container = render(<AppShell />).container })
  const shell = container.firstElementChild as HTMLElement
  expect(shell).toHaveClass('bg-chrome')
  const canvas = container.querySelector('.boobot-canvas')
  expect(canvas).toHaveClass('ds-canvas')
  expect(canvas).toContainElement(container.querySelector('main'))
})

it('preserva largura de sidebar previamente salva', async () => {
  localStorage.setItem('politron.sidebar.size', '24')
  let event!: (event: WorkspaceEvent) => void
  vi.stubGlobal('appAPI', { snapshot: async () => emptySnapshot, onEvent: (listener: typeof event) => { event = listener; return () => undefined }, setVisibleConversation: async () => undefined })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
  await act(async () => { render(<AppShell />) })
  expect(observed.sidebarSizes.at(-1)).toBe(24)
})

it('não renderiza novamente a árvore ao receber dez snapshots IPC idênticos', async () => {
  vi.useFakeTimers()
  let snapshot: Snapshot = {
    ...emptySnapshot,
    agents: Array.from({ length: 40 }, (_, index) => ({ ...emptySnapshot.assistant, id: `boo-${index}`, name: `Boo ${index}` })),
  }
  let event!: (event: WorkspaceEvent) => void
  const snapshotAPI = vi.fn(async () => JSON.parse(JSON.stringify(snapshot)) as Snapshot)
  vi.stubGlobal('appAPI', { snapshot: snapshotAPI, onEvent: (listener: typeof event) => { event = listener; return () => undefined }, setVisibleConversation: async () => undefined })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
  await act(async () => { render(<AppShell />) })
  const initial = observed.snapshots.at(-1)!
  observed.snapshots.length = 0

  for (let index = 0; index < 10; index++) {
    await act(async () => {
      event({ type: 'changed' })
      await vi.advanceTimersByTimeAsync(100)
    })
  }
  expect(snapshotAPI).toHaveBeenCalledTimes(11)
  expect(observed.snapshots).toHaveLength(0)

  // Uma alteração real continua chegando; agentes que não mudaram conservam a identidade.
  snapshot = { ...snapshot, terminalEnabled: false }
  await act(async () => { event({ type: 'changed' }); await vi.advanceTimersByTimeAsync(100) })
  expect(observed.snapshots).toHaveLength(1)
  expect(observed.snapshots[0].terminalEnabled).toBe(false)
  expect(observed.snapshots[0].agents).toBe(initial.agents)
  expect(observed.snapshots[0].assistant).toBe(initial.assistant)
})
