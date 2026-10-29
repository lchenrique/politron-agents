import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RemoteFolderDialog } from './RemoteFolderDialog'

const originalHostsAPI = window.hostsAPI
afterEach(() => { window.hostsAPI = originalHostsAPI })

it('apresenta o pedido de pasta remota em um diálogo DSH', async () => {
  const api = {
    onFolderRequest: (listener: (id: string) => void) => { listener('request-1'); return () => undefined },
    browse: vi.fn().mockResolvedValue({ path: 'C:/projeto', parent: 'C:/', directories: [] }),
    resolveFolder: vi.fn().mockResolvedValue(undefined),
  }
  window.hostsAPI = api as unknown as typeof window.hostsAPI
  render(<RemoteFolderDialog />)

  expect(await screen.findByRole('dialog', { name: 'Escolher pasta no host' })).toHaveAttribute('data-dsh-modal', 'true')
})
