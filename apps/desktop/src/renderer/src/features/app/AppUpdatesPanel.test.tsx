import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppUpdatesPanel } from './AppUpdatesPanel'
import type { UpdateSnapshot } from '../../../../shared/updates'

const development: UpdateSnapshot = {
  currentVersion: '0.1.0-beta.1', channel: 'beta', phase: 'development',
  latestVersion: null, releaseNotes: null, progressPercent: null, lastCheckedAt: null, error: null,
}
const downloaded: UpdateSnapshot = {
  ...development, phase: 'downloaded', latestVersion: '0.1.1-beta.1',
  releaseNotes: 'Melhorias nos agentes', progressPercent: 100,
}

afterEach(() => vi.unstubAllGlobals())
describe('Painel de atualizações', () => {
  it('explica que modo dev não instala atualizações nem executa verificações', async () => {
    const api = {
      status: vi.fn().mockResolvedValue(development),
      check: vi.fn(), setChannel: vi.fn().mockResolvedValue({ ...development, channel: 'stable' }),
      install: vi.fn(), onChanged: vi.fn(() => () => undefined),
    }
    vi.stubGlobal('updatesAPI', api)
    render(<AppUpdatesPanel />)
    expect(await screen.findByText(/Modo desenvolvimento/)).toBeInTheDocument()
    const check = screen.getByRole('button', { name: 'Buscar atualizações' })
    expect(check).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Canal de atualizações'), { target: { value: 'stable' } })
    await waitFor(() => expect(api.setChannel).toHaveBeenCalledWith('stable'))
    expect(api.check).not.toHaveBeenCalled()
    expect(api.install).not.toHaveBeenCalled()
  })
  it('pede uma segunda confirmação antes de instalar versão baixada', async () => {
    const api = {
      status: vi.fn().mockResolvedValue(downloaded),
      check: vi.fn(), setChannel: vi.fn(),
      install: vi.fn().mockResolvedValue({ installing: true, message: 'reiniciando' }),
      onChanged: vi.fn(() => () => undefined),
    }
    vi.stubGlobal('updatesAPI', api)
    render(<AppUpdatesPanel />)
    expect(await screen.findByText(/Atualização baixada e pronta/)).toBeInTheDocument()
    expect(screen.getByText('Melhorias nos agentes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar atualização' }))
    expect(api.install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(api.install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar atualização' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e reiniciar' }))
    await waitFor(() => expect(api.install).toHaveBeenCalledTimes(1))
  })
})
