import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { HostsAPI, HostsSnapshot } from '../../../../shared/hosts'
import { HostSelector } from './HostSelector'

const snapshot: HostsSnapshot = { selectedId: 'local', hosts: [{ id: 'local', name: 'Este PC', endpoint: 'local', transport: 'local', status: 'connected' }], local: { enabled: false, address: '127.0.0.1', port: 6778, advertisedUrl: 'ws://127.0.0.1:6778/boobot', relayUrl: '', running: false } }
function setup() {
  const api = { snapshot: vi.fn(async () => snapshot), onChanged: () => () => undefined, configure: vi.fn(async () => snapshot), add: vi.fn(async () => ({ id: 'home', name: 'Casa', endpoint: 'ws://casa:6778', transport: 'direct' as const, status: 'connected' as const })), select: vi.fn(async () => undefined), remove: vi.fn(), copyPairing: vi.fn(), revoke: vi.fn(), browse: vi.fn(), resolveFolder: vi.fn(), onFolderRequest: () => () => undefined } satisfies HostsAPI
  window.hostsAPI = api; render(<HostSelector />); return api
}
afterEach(() => { delete window.hostsAPI })
async function menu() { fireEvent.keyDown(await screen.findByRole('button', { name: 'Selecionar host' }), { key: 'ArrowDown' }) }
it('encaminha a configuração para as Configurações do app sem ativar listener', async () => {
  const opened = vi.fn(); window.addEventListener('boobot:open-settings', opened)
  const api = setup(); await menu()
  expect(screen.getByRole('menu')).toHaveAttribute('data-dsh-menu-surface', 'true')
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Configurar este host' }))
  expect(opened).toHaveBeenCalledWith(expect.objectContaining({ detail: 'conexoes' }))
  window.removeEventListener('boobot:open-settings', opened)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.configure).not.toHaveBeenCalled()
})
it('pareia antes de selecionar o host e exibe erros sem trocar de máquina', async () => {
  const api = setup(); api.add.mockRejectedValueOnce(new Error('Pareamento inválido'))
  await menu(); fireEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar host' }))
  fireEvent.change(screen.getByLabelText('Link de pareamento'), { target: { value: 'boobot://teste-sintético' } })
  fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
  expect(await screen.findByText('Pareamento inválido')).toBeInTheDocument(); expect(api.select).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
  await waitFor(() => expect(api.select).toHaveBeenCalledWith('home'))
})
