import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent, Snapshot, Workspace } from '../../../../shared/v9'
import { ChiefHome } from './ChiefHome'

const agent = (id: string, name: string, patch: Partial<Agent> = {}) => ({ id, name, alias: name.toLowerCase(), ...patch }) as Agent
const workspace = (id: string, name: string, patch: Partial<Workspace> = {}) => ({ id, name, kind: 'project', path: `C:/${id}`, ...patch }) as Workspace
const snapshot = {
  assistant: agent('assistant', 'Boo'),
  agents: [agent('agent-chief', 'Chefe', { role: 'chief' }), agent('agent-ana', 'Ana')],
  workspaces: [workspace('workspace-free', 'Livre', { kind: 'free' }), workspace('workspace-alpha', 'Site Alpha'), workspace('workspace-beta', 'Site Beta')],
  conversations: [], messages: [], runs: [], fileChanges: [], approvals: [], terminalEnabled: true, missions: [], routines: [],
} as unknown as Snapshot

const original = window.appAPI
beforeEach(() => {
  localStorage.clear()
  window.appAPI = {
    startMission: vi.fn(async (input: { agentId?: string }) => ({ id: 'mission-1', ownerAgentId: input.agentId })),
    missionAction: vi.fn(async () => undefined),
  } as unknown as typeof window.appAPI
})
afterEach(() => { window.appAPI = original })

const renderHome = () => render(<ChiefHome snapshot={snapshot} agentStates={{}} onOpenConversation={vi.fn()} onOpenAgent={vi.fn()} onOpenRoutines={vi.fn()} onNotice={vi.fn()} />)

describe('ChiefHome', () => {
  it('usa Select acessível para projeto e responsável e atribui com os IDs escolhidos', async () => {
    renderHome()
    const project = screen.getByRole('combobox', { name: 'Projeto' })
    const owner = screen.getByRole('combobox', { name: 'Responsável' })
    expect(project).toHaveTextContent('Sem projeto (Livre)')
    expect(owner).toHaveTextContent('Chefe (Chief)')

    fireEvent.click(project)
    expect(screen.queryByRole('option', { name: 'Livre' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: 'Site Alpha' }))
    expect(project).toHaveTextContent('Site Alpha')
    expect(localStorage.getItem('politron.home.workspace')).toBe('workspace-alpha')

    fireEvent.click(owner)
    fireEvent.click(await screen.findByRole('option', { name: 'Ana' }))
    expect(owner).toHaveTextContent('Ana')

    fireEvent.change(screen.getByLabelText(/Objetivo para/), { target: { value: 'Publicar o site' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }))
    await waitFor(() => expect(window.appAPI.startMission).toHaveBeenCalledWith({ goal: 'Publicar o site', workspaceId: 'workspace-alpha', agentId: 'agent-ana' }))
  })

  it('restaura o projeto salvo e volta para Sem projeto com string vazia', async () => {
    localStorage.setItem('politron.home.workspace', 'workspace-beta')
    renderHome()
    const project = screen.getByRole('combobox', { name: 'Projeto' })
    expect(project).toHaveTextContent('Site Beta')

    fireEvent.click(project)
    fireEvent.click(await screen.findByRole('option', { name: 'Sem projeto (Livre)' }))
    expect(localStorage.getItem('politron.home.workspace')).toBe('')

    fireEvent.change(screen.getByLabelText(/Objetivo para/), { target: { value: 'Pesquisar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }))
    await waitFor(() => expect(window.appAPI.startMission).toHaveBeenCalledWith({ goal: 'Pesquisar', workspaceId: null, agentId: 'agent-chief' }))
  })
})
