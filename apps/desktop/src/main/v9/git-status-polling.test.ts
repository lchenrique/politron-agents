// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))
import { AppService } from './workspace'

it('preserva instruções e permissões atualizadas enquanto o Git está sendo consultado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boobot-git-poll-edit-')), service = new AppService(directory)
  const original = service.store.saveWorkspace({ name: 'Projeto', path: directory, instructions: 'Instruções antigas', permissions: { chiefCreateAgents: false, chiefEditAgents: false, chiefManageTeam: false, chiefCreateSessions: false, filesWrite: 'inherit', computerUse: 'inherit' } })
  let finish!: (value: { branch: string | null; changes: number }) => void
  vi.spyOn(service.gitWorkspaces, 'inspect').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const scan = Reflect.get(service, 'scanWorkspaceStatuses').bind(service) as () => Promise<void>
  try {
    const pending = scan()
    service.store.saveWorkspace({ id: original.id, name: original.name, instructions: 'Instruções novas', permissions: { ...original.permissions!, filesWrite: 'deny' } })
    finish({ branch: 'main', changes: 3 })
    await pending
    expect(service.store.workspace(original.id)).toMatchObject({ instructions: 'Instruções novas', permissions: { filesWrite: 'deny' }, branch: 'main', changes: 3 })
  } finally { service.dispose(); await rm(directory, { recursive: true, force: true }) }
})

it('não ressuscita workspace excluído nem desfaz arquivamento durante a consulta Git', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boobot-git-poll-delete-')), service = new AppService(directory)
  const removed = service.store.saveWorkspace({ name: 'Excluído', path: directory })
  const archived = service.store.saveWorkspace({ name: 'Arquivado', path: directory })
  const finishes: Array<(value: { branch: string | null; changes: number }) => void> = []
  vi.spyOn(service.gitWorkspaces, 'inspect').mockImplementation(() => new Promise(resolve => { finishes.push(resolve) }))
  const scan = Reflect.get(service, 'scanWorkspaceStatuses').bind(service) as () => Promise<void>
  try {
    const pending = scan()
    service.store.deleteWorkspace(removed.id)
    service.store.updateWorkspace({ ...archived, archived: true })
    finishes[0]({ branch: 'main', changes: 3 })
    await vi.waitFor(() => expect(finishes).toHaveLength(2))
    finishes[1]({ branch: 'main', changes: 3 })
    await pending
    expect(service.store.workspaces().some(item => item.id === removed.id)).toBe(false)
    expect(service.store.workspace(archived.id)).toMatchObject({ archived: true, branch: archived.branch, changes: archived.changes })
  } finally { service.dispose(); await rm(directory, { recursive: true, force: true }) }
})

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
