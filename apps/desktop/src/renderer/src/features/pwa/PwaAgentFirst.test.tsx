import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import type { Agent, Conversation, Run, Snapshot } from '../../../../shared/v9'
import { assistantPlaceholder, emptySnapshot } from '../app/appShellShared'
import { PwaAgentStrip, PwaBoosPage, PwaBottomNav, PwaWorkingNow } from './PwaAgentFirst'
import { usePwaDelegationNotices } from './use-pwa-delegation-notices'
import { booOverview, chiefConversation, delegationNotice, deriveDelegations, tabForConversation, type PwaDelegation } from './pwa-agent-model'

const agent = (id: string, name: string, role?: 'chief'): Agent => ({ ...assistantPlaceholder, id, name, alias: name.toLowerCase(), role, color: '#786bea' })
const conversation = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  id, kind: 'direct', name: id, agentIds: [], workspaceId: 'free', titleAuto: false, revision: 1, archived: false, createdAt: '2026-10-30T10:00:00Z', ...over,
})
const run = (id: string, conversationId: string, agentId: string, status: Run['status'], createdAt = '2026-10-30T10:05:00Z'): Run =>
  ({ id, conversationId, agentId, status, createdAt, rootId: id, parentId: null, ancestry: [], threadId: null, turnId: null, messageId: '', input: '', agent: agent(agentId, agentId), workspaceId: 'free', workspacePath: '' })

const chief = agent('chief', 'Atlas', 'chief')
const luna = agent('luna', 'Luna')
const rex = agent('rex', 'Rex')
const snapshot = (runs: Run[] = []): Snapshot => ({
  ...emptySnapshot,
  agents: [luna, chief, rex],
  workspaces: [{ id: 'free', name: 'Livre', kind: 'free', path: '', branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds: [], changes: 0, archived: false, createdAt: '' }],
  conversations: [
    conversation('chief-chat', { agentIds: ['chief'] }),
    conversation('luna-chat', { agentIds: ['luna'] }),
    conversation('task-luna', { agentIds: ['luna'], name: 'Revisar login', parentConversationId: 'chief-chat' }),
    conversation('task-rex', { agentIds: ['rex'], name: 'Escrever testes', parentConversationId: 'chief-chat' }),
  ],
  runs,
})

describe('pwa-agent-model', () => {
  it('coloca o Chief primeiro e descreve o que cada Boo faz', () => {
    const snap = snapshot([run('r1', 'task-luna', 'luna', 'running')])
    const boos = booOverview(snap, { luna: 'working' })
    expect(boos.map(item => item.agent.name)).toEqual(['Atlas', 'Luna', 'Rex'])
    expect(boos[1]).toMatchObject({ state: 'working', detail: 'Trabalhando em Revisar login' })
    expect(boos[2]).toMatchObject({ state: 'idle', detail: 'Disponível' })
  })

  it('encontra a conversa do Chief e a aba de cada conversa', () => {
    const snap = snapshot()
    expect(chiefConversation(snap)?.id).toBe('chief-chat')
    expect(tabForConversation(snap, snap.conversations[0])).toBe('chief')
    expect(tabForConversation(snap, snap.conversations[1])).toBe('boos')
    expect(tabForConversation(snap, snap.conversations[2])).toBe('projects')
    expect(tabForConversation(snap, undefined)).toBe('projects')
  })

  it('deriva delegações do Chief com o estado da última execução', () => {
    const snap = snapshot([run('r1', 'task-luna', 'luna', 'running'), run('r2', 'task-rex', 'rex', 'completed')])
    const items = deriveDelegations(snap)
    expect(items.map(item => [item.title, item.state])).toEqual(expect.arrayContaining([['Revisar login', 'working'], ['Escrever testes', 'done']]))
    expect(items.find(item => item.id === 'task-luna')?.agentName).toBe('Luna')
  })

  it('só avisa quando o estado muda para concluído, falha ou espera', () => {
    const base: PwaDelegation = { id: 'a', conversationId: 'a', title: 'Revisar login', agentName: 'Luna', state: 'done', at: '' }
    expect(delegationNotice(undefined, base)).toBeUndefined()
    expect(delegationNotice('done', base)).toBeUndefined()
    expect(delegationNotice('working', base)).toBe('Luna terminou: Revisar login')
    expect(delegationNotice('working', { ...base, state: 'failed' })).toContain('não concluiu')
    expect(delegationNotice('working', { ...base, state: 'waiting' })).toContain('precisa de você')
  })
})

describe('usePwaDelegationNotices', () => {
  const item = (state: PwaDelegation['state']): PwaDelegation => ({ id: 'a', conversationId: 'a', title: 'Revisar login', agentName: 'Luna', state, at: '' })
  it('não avisa na primeira leitura e avisa uma vez quando o Boo termina', () => {
    const onNotice = vi.fn()
    const { rerender } = renderHook(({ list }) => usePwaDelegationNotices(list, onNotice), { initialProps: { list: [item('working')] } })
    expect(onNotice).not.toHaveBeenCalled()
    const done = [item('done')]
    rerender({ list: done })
    rerender({ list: done })
    expect(onNotice).toHaveBeenCalledTimes(1)
    expect(onNotice).toHaveBeenCalledWith('Luna terminou: Revisar login')
  })
})

describe('PwaBottomNav', () => {
  it('marca a aba atual, mostra pendências e troca de aba', () => {
    const onSelect = vi.fn()
    render(<PwaBottomNav tab="chief" attention={{ chief: 2, boos: 0 }} onSelect={onSelect} />)
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('button', { name: /Chief/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByLabelText('2 pendentes')).toBeInTheDocument()
    fireEvent.click(within(nav).getByRole('button', { name: 'Boos' }))
    fireEvent.click(within(nav).getByRole('button', { name: 'Projetos' }))
    expect(onSelect.mock.calls).toEqual([['boos'], ['projects']])
  })
})

describe('PwaAgentStrip e PwaBoosPage', () => {
  const boos = booOverview(snapshot([run('r1', 'task-luna', 'luna', 'running')]), { luna: 'working' })
  it('abre a conversa do Boo tocado, com estado acessível', () => {
    const onOpenAgent = vi.fn()
    render(<PwaAgentStrip boos={boos} onOpenAgent={onOpenAgent} />)
    fireEvent.click(screen.getByRole('button', { name: 'Luna: Trabalhando em Revisar login' }))
    expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'luna' }))
    expect(screen.getByRole('button', { name: 'Rex: Disponível' })).toBeInTheDocument()
  })
  it('lista ocupados e disponíveis na aba Boos', () => {
    const onOpenAgent = vi.fn()
    render(<PwaBoosPage boos={boos} onOpenAgent={onOpenAgent} />)
    expect(screen.getByText('1 Boo está trabalhando.')).toBeInTheDocument()
    expect(screen.getByText('Ocupado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rex/ })).toHaveTextContent('Disponível')
    expect(screen.getByText('Coordenação da equipe')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Rex/ }))
    expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'rex' }))
  })
})

describe('PwaWorkingNow', () => {
  const at = '2026-10-30T10:05:00Z'
  const now = Date.parse(at) + 60_000
  const list: PwaDelegation[] = [
    { id: 'a', conversationId: 'conv-a', title: 'Revisar login', agentName: 'Luna', state: 'working', at },
    { id: 'b', conversationId: 'conv-b', title: 'Escrever testes', agentName: 'Rex', state: 'done', at },
    { id: 'c', conversationId: 'conv-c', title: 'Antiga', agentName: 'Rex', state: 'done', at: '2026-10-29T10:00:00Z' },
  ]
  it('mostra em andamento e concluídas há pouco, sem as antigas, e abre a conversa', () => {
    const onOpen = vi.fn()
    render(<PwaWorkingNow delegations={list} onOpenConversation={onOpen} now={now} />)
    const panel = screen.getByRole('region', { name: 'Trabalhando agora' })
    expect(within(panel).getAllByRole('button')).toHaveLength(2)
    expect(within(panel).queryByText(/Antiga/)).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: /Luna, trabalhando: Revisar login/ }))
    expect(onOpen).toHaveBeenCalledWith('conv-a')
    expect(within(panel).getByRole('button', { name: /Rex, concluiu/ })).toBeInTheDocument()
  })
  it('some quando não há nada a mostrar', () => {
    const { container } = render(<PwaWorkingNow delegations={[list[2]]} onOpenConversation={vi.fn()} now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})
