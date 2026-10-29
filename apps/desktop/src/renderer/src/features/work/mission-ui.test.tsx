import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../../../shared/v9'
import { MissionControls } from './mission-ui'

const mission: Mission = {
  id: 'mission-1', title: 'Analisar a API', goal: 'Analisar a API', workspaceId: 'workspace-1', conversationId: 'conversation-1', ownerAgentId: 'agent-1',
  routineId: null, model: null, status: 'active', steps: [], updates: [], question: null, options: [], result: null,
  turns: 0, maxTurns: 5, idleTurns: 0, failures: 0, lastProgressAt: null, createdAt: '', updatedAt: '', completedAt: null,
}
const originalAppAPI = window.appAPI

beforeEach(() => {
  window.appAPI = { missionAction: vi.fn(async () => mission) } as unknown as typeof window.appAPI
})
afterEach(() => { window.appAPI = originalAppAPI; vi.restoreAllMocks() })

describe('MissionControls', () => {
  it('confirma o cancelamento em um diálogo do app e permite desistir sem cancelar', () => {
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MissionControls mission={mission} onNotice={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-dsh-modal', 'true')
    expect(dialog).toHaveTextContent('Analisar a API')
    expect(nativeConfirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.appAPI.missionAction).not.toHaveBeenCalled()
  })

  it('cancela a missão somente após confirmação no diálogo', async () => {
    render(<MissionControls mission={mission} onNotice={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar missão' }))

    await waitFor(() => expect(window.appAPI.missionAction).toHaveBeenCalledExactlyOnceWith('mission-1', 'cancel', undefined))
  })
})
