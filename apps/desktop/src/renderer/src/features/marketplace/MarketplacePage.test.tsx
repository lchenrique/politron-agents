import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot, Workspace } from '../../../../shared/v9'
import type { MarketplaceTeam } from '../../../../shared/marketplace'
import { emptySnapshot } from '../app/appShellShared'
import { MarketplacePage } from './MarketplacePage'

const team: MarketplaceTeam = {
  id: 'instagram', name: 'Equipe de Instagram', area: 'Redes sociais', description: 'Conteúdo do começo ao fim.', leader: 'diretor',
  members: [
    { key: 'diretor', name: 'Vera', alias: 'vera', role: 'Diretor de conteúdo', description: 'Lidera.', instructions: 'x', color: '#ff8fa3', skills: ['content-factory'] },
    { key: 'roteirista', name: 'Luna', alias: 'luna', role: 'Roteirista', description: 'Escreve.', instructions: 'x', color: '#8fd3ff', skills: ['virality', 'reel-scripter'] },
  ],
}
const workspace = (id: string, name: string, defaultAgentIds: string[] = []): Workspace => ({ id, name, kind: 'local', path: `C:/${id}`, branch: null, baseBranch: null, parentWorkspaceId: null, instructions: '', defaultAgentIds, changes: 0, archived: false, createdAt: '' })
const snapshot = { ...emptySnapshot, workspaces: [workspace('loja', 'Loja'), workspace('cheio', 'Cheio', Array.from({ length: 9 }, (_, i) => `a${i}`))] } as unknown as Snapshot
const original = window.appAPI
afterEach(() => { window.appAPI = original })

function setup() {
  const hireTeam = vi.fn(async () => ({ agentIds: ['1', '2'], conversationId: 'conversa-nova' }))
  window.appAPI = { ...original, marketplaceTeams: vi.fn(async () => [team]), hireTeam } as typeof window.appAPI
  const onHired = vi.fn(); const onNotice = vi.fn()
  render(<MarketplacePage snapshot={snapshot} models={[]} onHired={onHired} onNotice={onNotice} />)
  return { hireTeam, onHired, onNotice }
}

describe('Marketplace', () => {
  it('cartão resume a equipe; Ver equipe abre membros, líder e skills', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Equipe de Instagram' })).toBeInTheDocument()
    expect(screen.getByText('Redes sociais · 2 Boos · 3 skills')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver equipe' }))
    const dialog = screen.getByRole('dialog')
    const members = within(dialog).getByRole('list', { name: 'Membros da Equipe de Instagram' })
    expect(members).toHaveTextContent('Vera'); expect(members).toHaveTextContent('líder'); expect(members).toHaveTextContent('Roteirista')
    expect(within(dialog).getByLabelText('Skills de Luna')).toHaveTextContent('reel-scripter')
  })

  it('busca filtra por skill e mostra como limpar quando nada combina', async () => {
    setup()
    const search = await screen.findByRole('searchbox', { name: /Buscar/ })
    fireEvent.change(search, { target: { value: 'reel-scripter' } })
    expect(screen.getByRole('heading', { name: 'Equipe de Instagram' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'nada disso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('heading', { name: 'Equipe de Instagram' })).toBeInTheDocument()
  })

  it('contrata para um projeto escolhido e abre a conversa da equipe', async () => {
    const { hireTeam, onHired, onNotice } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Contratar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Loja/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Contratar' }))
    await waitFor(() => expect(onHired).toHaveBeenCalledWith('conversa-nova'))
    expect(hireTeam).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'instagram', workspaceId: 'loja' }))
    expect(onNotice).toHaveBeenCalledWith('Equipe de Instagram contratada para o projeto Loja.')
  })

  it('projeto sem espaço avisa e não deixa contratar', async () => {
    const { hireTeam } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Contratar' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Cheio/ }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('cabem até 10')
    expect(within(dialog).getByRole('button', { name: 'Contratar' })).toBeDisabled()
    expect(hireTeam).not.toHaveBeenCalled()
  })
})
