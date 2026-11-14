import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { WorkspaceStore } from './store'
import type { Run } from '../../shared/v9'

it('carimba finishedAt uma única vez quando a execução termina', () => {
  const directory = mkdtempSync(join(tmpdir(), 'politron-run-finished-'))
  const store = new WorkspaceStore(directory)
  try {
    const run = { id: 'r1', agentId: 'a', conversationId: 'c', createdAt: new Date().toISOString(), status: 'running' } as unknown as Run
    store.putRun(run)
    expect(store.run('r1')?.finishedAt).toBeUndefined()
    store.putRun({ ...run, status: 'completed' })
    const first = store.run('r1')?.finishedAt
    expect(first).toBeTruthy()
    store.putRun({ ...run, status: 'completed' })
    expect(store.run('r1')?.finishedAt).toBe(first)
    expect(store.recentRuns(10).map(item => item.id)).toEqual(['r1'])
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})
