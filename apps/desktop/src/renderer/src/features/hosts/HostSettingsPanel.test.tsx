import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { HostsAPI, HostsSnapshot } from '../../../../shared/hosts'
import { HostSettingsPanel } from './HostSettingsPanel'

const snapshot: HostsSnapshot = {
  selectedId: 'local', hosts: [],
  local: { enabled: true, address: '0.0.0.0', port: 6778, advertisedUrl: 'ws://127.0.0.1:6778/boobot', relayUrl: '', running: true },
}

function setup(value: HostsSnapshot = snapshot) {
  const api = {
    snapshot: vi.fn(async () => value), onChanged: () => () => undefined,
    configure: vi.fn(async () => value), add: vi.fn(), select: vi.fn(), remove: vi.fn(),
    copyPairing: vi.fn(), revoke: vi.fn(), browse: vi.fn(), resolveFolder: vi.fn(), onFolderRequest: () => () => undefined,
  } satisfies HostsAPI
  window.hostsAPI = api
  render(<HostSettingsPanel />)
  return api
}

afterEach(() => { delete window.hostsAPI })

it('avisa quando o link de pareamento anuncia loopback para outro PC', async () => {
  setup()
  expect(await screen.findByText(/127\.0\.0\.1 aponta para este computador/)).toBeInTheDocument()
})

it('não exibe o aviso quando o pareamento anuncia um endereço de rede', async () => {
  setup({ ...snapshot, local: { ...snapshot.local, advertisedUrl: 'ws://pc-escritorio:6778/boobot' } })
  await screen.findByLabelText('Endereço acessível pelo outro computador')
  expect(screen.queryByText(/127\.0\.0\.1 aponta para este computador/)).not.toBeInTheDocument()
})
