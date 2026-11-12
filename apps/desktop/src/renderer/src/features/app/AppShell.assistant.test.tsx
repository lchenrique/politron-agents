import { act, cleanup, render, screen } from '@testing-library/react'
import type { Agent } from '../../../../shared/v9'
import { afterEach, expect, it, vi } from 'vitest'
import { emptySnapshot } from './appShellShared'

// O sidebar real é substituído por um botão por linha: aqui interessa o que o shell faz com o clique.
vi.mock('@/shell/workspace-sidebar', () => ({
  WorkspaceSidebar: ({ boos, onSelectAgent }: { boos: Array<{ id: string; name: string }>; onSelectAgent: (row: { id: string; name: string }) => void }) =>
    <div>
      {boos.map(boo => <button key={boo.id} type="button" onClick={() => onSelectAgent(boo)}>{`abrir ${boo.name}`}</button>)}
    </div>,
}))
vi.mock('@/shell/top-bar', () => ({ TopBar: () => null }))
vi.mock('@/shell/activity-rail', () => ({ ActivityRail: () => null }))
vi.mock('@/shell/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/shell/settings/settings-overlay', () => ({ SettingsOverlay: () => null }))
vi.mock('../panels/DockWorkspace', () => ({ DockWorkspace: ({ children }: { children: React.ReactNode }) => children }))
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

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const boo = (id: string, name: string): Agent => ({
  id, name, alias: name.toLowerCase(), description: 'Especialista', instructions: 'Instruções',
  runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false,
  approvalMode: 'ask', revision: 1, createdAt: '2026-11-11T00:00:00.000Z',
}) as Agent

function stubApp(snapshot: typeof emptySnapshot, saveConversation: () => Promise<unknown>) {
  vi.stubGlobal('appAPI', {
    snapshot: async () => snapshot,
    modelPreferences: async () => ({ disabled: [], custom: [] }),
    saveConversation,
    onEvent: () => () => undefined,
    setVisibleConversation: async () => undefined,
    workspaceDiff: async () => '',
  })
  vi.stubGlobal('providersAPI', { list: async () => ({ providers: [] }), onChanged: () => () => undefined })
}

it('clicar no Assistente abre a conversa sem participantes fixos, não uma conversa com ele na equipe', async () => {
  const agent = boo('boo-1', 'Bia')
  const saveConversation = vi.fn(async () => ({ id: 'conversa-assistente', kind: 'direct', agentIds: [], createdAt: '2026-11-11T00:00:00.000Z' }))
  stubApp({ ...emptySnapshot, agents: [agent] }, saveConversation)
  await act(async () => { render(<AppShell />) })
  await act(async () => { screen.getByRole('button', { name: 'abrir Assistente' }).click() })
  expect(saveConversation).toHaveBeenCalledWith({ kind: 'direct', agentIds: [] })
})

it('clicar num Boo abre uma conversa direta com ele', async () => {
  const agent = boo('boo-1', 'Bia')
  const saveConversation = vi.fn(async () => ({ id: 'conversa-bia', kind: 'direct', agentIds: ['boo-1'], createdAt: '2026-11-11T00:00:00.000Z' }))
  stubApp({ ...emptySnapshot, agents: [agent] }, saveConversation)
  await act(async () => { render(<AppShell />) })
  await act(async () => { screen.getByRole('button', { name: 'abrir Bia' }).click() })
  expect(saveConversation).toHaveBeenCalledWith({ kind: 'direct', agentIds: ['boo-1'] })
})
