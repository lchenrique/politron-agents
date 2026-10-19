// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'

it('não sobrepõe varreduras periódicas e não grava estado depois de dispose', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boobot-git-poll-')), service = new AppService(directory)
  service.store.saveWorkspace({ name: 'Descartável', path: directory })
  let finish!: (value: { branch: string; changes: number }) => void
  const inspect = vi.spyOn(service.gitWorkspaces, 'inspect').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const update = vi.spyOn(service.store, 'updateWorkspace')
  const refresh = Reflect.get(service, 'refreshWorkspaceStatuses').bind(service) as () => Promise<void>
  try {
    const first = refresh(), second = refresh(), third = refresh()
    expect(first).toBe(second); expect(second).toBe(third)
    expect(inspect).toHaveBeenCalledTimes(1)
    const signal = inspect.mock.calls[0][1]
    service.dispose(); expect(signal?.aborted).toBe(true)
    finish({ branch: 'main', changes: 3 }); await first
    expect(update).not.toHaveBeenCalled()
    await refresh(); expect(inspect).toHaveBeenCalledTimes(1)
  } finally { service.dispose(); await rm(directory, { recursive: true, force: true }) }
})
