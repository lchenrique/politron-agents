import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryPanel } from './MemoryPanel'
import type { Memory } from '../../../../shared/memory'

const memory: Memory = { id: 'm1', scope: 'agent', ownerId: 'boo-1', text: 'Atlas cuida do deploy.', kind: 'fato', inclusion: 'pesquisavel', inclusionLocked: false,
  origin: 'agente', agentId: 'boo-1', conversationId: 'c1', createdAt: '2026-11-06T10:00:00.000Z', updatedAt: '2026-11-06T10:00:00.000Z' }

afterEach(() => vi.unstubAllGlobals())

describe('Configurações → Memória', () => {
  it('lista, cria, fixa inclusão, apaga com confirmação e exporta', async () => {
    const api = { list: vi.fn().mockResolvedValue([memory]), save: vi.fn().mockResolvedValue(memory), remove: vi.fn().mockResolvedValue(undefined), exportJson: vi.fn().mockResolvedValue('C:/m.json') }
    vi.stubGlobal('memoryAPI', api)
    vi.stubGlobal('appAPI', { snapshot: vi.fn().mockResolvedValue({ agents: [{ id: 'boo-1', name: 'Atlas' }], workspaces: [] }) })
    render(<MemoryPanel />)
    expect(await screen.findByText('Atlas cuida do deploy.')).toBeInTheDocument()
    expect(await screen.findByText(/Boo · Atlas · Fato · Boo/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Texto da memória' }), { target: { value: 'Prefiro respostas curtas.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar memória' }))
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ text: 'Prefiro respostas curtas.', kind: null, inclusion: 'essencial', scope: 'global', ownerId: '' }))

    fireEvent.click(screen.getByRole('button', { name: /Inclusão: Pesquisável/ }))
    await waitFor(() => expect(api.save).toHaveBeenCalledWith({ id: 'm1', inclusion: 'essencial' }))

    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(api.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('m1'))

    fireEvent.click(screen.getByRole('button', { name: 'Exportar JSON' }))
    await waitFor(() => expect(api.exportJson).toHaveBeenCalled())
    expect(await screen.findByText('Memórias exportadas em JSON.')).toBeInTheDocument()
  })

  it('busca e filtra pelo main', async () => {
    const api = { list: vi.fn().mockResolvedValue([]), save: vi.fn(), remove: vi.fn(), exportJson: vi.fn() }
    vi.stubGlobal('memoryAPI', api)
    render(<MemoryPanel />)
    expect(await screen.findByText(/Nenhuma memória ainda/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar memórias' }), { target: { value: 'deploy' } })
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ query: 'deploy' }))
  })
})
