import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Agent, Conversation, Snapshot, Workspace } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { Sidebar } from './Sidebar'

const AGENT: Agent = { id: 'agent-1', name: 'Lyra', alias: 'lyra', description: '', instructions: '', runtime: 'codex', model: '', color: '#7565e8', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '2026-10-16T12:00:00.000Z' }

const WORKSPACE_COUNT = 120
const CONVERSATION_COUNT = 600

function buildSnapshot(workspaceCount: number, conversationCount: number): Snapshot {
  const workspaces: Workspace[] = Array.from({ length: workspaceCount }, (_, index) => ({
    id: `workspace-${index}`,
    name: `Projeto ${index}`,
    kind: index % 7 === 0 ? 'worktree' : 'local',
    path: `C:/projetos/projeto-${index}`,
    branch: index % 7 === 0 ? `feature/${index}` : null,
    baseBranch: null,
    parentWorkspaceId: null,
    instructions: '',
    defaultAgentIds: index % 5 === 0 ? ['agent-1'] : [],
    changes: index % 3,
    archived: false,
    createdAt: '2026-10-16T12:00:00.000Z'
  }))
  // Carga realista: a maioria dos projetos tem poucas sessoes, alguns concentram muitas.
  const conversations: Conversation[] = []
  for (let index = 0; index < conversationCount; index++) {
    const heavy = index < conversationCount * 0.4
    const workspaceIndex = heavy ? index % 2 : 2 + (index % Math.max(1, workspaceCount - 2))
    const workspace = workspaces[workspaceIndex % workspaceCount]
    conversations.push({
      id: `conversation-${index}`,
      kind: 'direct',
      name: `Sessão ${index}`,
      agentIds: ['agent-1'],
      workspaceId: workspace.id,
      titleAuto: false,
      revision: 1,
      archived: false,
      createdAt: '2026-10-16T12:00:00.000Z'
    })
  }
  return { ...emptySnapshot, assistant: AGENT, agents: [AGENT], workspaces, conversations }
}

function seedGroups(groups: number, workspaceCount: number) {
  const names = Array.from({ length: groups }, (_, index) => `Pasta ${index}`)
  localStorage.setItem('politron.sidebar.groups', JSON.stringify(names))
  const map: Record<string, string> = {}
  for (let index = 0; index < workspaceCount; index++) map[`workspace-${index}`] = names[index % groups]
  localStorage.setItem('politron.sidebar.workspace-groups', JSON.stringify(map))
}

function props(snapshot: Snapshot) {
  return {
    snapshot,
    selected: undefined,
    unreadCounts: {},
    agentStates: {},
    onSelectConversation: vi.fn(),
    onStartConversation: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenEditor: vi.fn(),
    onOpenSettings: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDeleteConversation: vi.fn(),
    onDeleteAgent: vi.fn(),
    onSetChief: vi.fn(),
    onNotice: vi.fn()
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

it('nao varre a lista de conversas e de projetos uma vez por projeto', () => {
  seedGroups(8, WORKSPACE_COUNT)
  const snapshot = buildSnapshot(WORKSPACE_COUNT, CONVERSATION_COUNT)
  const conversationFilter = vi.spyOn(snapshot.conversations, 'filter')
  const workspaceFilter = vi.spyOn(snapshot.workspaces, 'filter')

  render(<Sidebar {...props(snapshot)} />)

  // A versao anterior filtrava conversas e buscava o workspace dentro do filtro
  // para cada projeto: com 120 projetos isso virava mais de 120 varreduras.
  expect(conversationFilter.mock.calls.length).toBeLessThan(6)
  expect(workspaceFilter.mock.calls.length).toBeLessThan(6)
})

it('mantem o tempo de render dentro de um limite largo', () => {
  seedGroups(8, WORKSPACE_COUNT)
  const snapshot = buildSnapshot(WORKSPACE_COUNT, CONVERSATION_COUNT)

  const start = performance.now()
  const view = render(<Sidebar {...props(snapshot)} />)
  const mount = performance.now() - start

  const updateStart = performance.now()
  view.rerender(<Sidebar {...props({ ...snapshot, terminalEnabled: false })} />)
  const update = performance.now() - updateStart

  console.log(`[sidebar] ${WORKSPACE_COUNT} projetos / ${CONVERSATION_COUNT} sessoes: montagem ${mount.toFixed(1)}ms, atualizacao ${update.toFixed(1)}ms`)

  // Orcamento largo, apenas como rede de seguranca. O teste deterministico acima
  // e o que garante que a varredura nao voltou.
  expect(mount).toBeLessThan(4000)
  expect(update).toBeLessThan(2500)
})
