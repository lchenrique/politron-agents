import { describe, expect, it } from 'vitest'
import { WorkspaceQueue } from './routing'

const gate = () => {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

describe('WorkspaceQueue', () => {
  it('serializes writes in one canonical workspace and runs distinct workspaces in parallel', async () => {
    const queue = new WorkspaceQueue()
    const firstGate = gate()
    const secondGate = gate()
    let active = 0
    let maxActive = 0
    const task = (wait: Promise<void>) => async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await wait
      active--
    }
    const signal = () => new AbortController().signal
    const first = queue.enqueue('C:/repo/worktree-a', signal(), task(firstGate.promise))
    const sameWorkspace = queue.enqueue('C:/repo/worktree-a', signal(), task(Promise.resolve()))
    const otherWorkspace = queue.enqueue('C:/repo/worktree-b', signal(), task(secondGate.promise))

    await Promise.resolve()
    expect(maxActive).toBe(2)
    firstGate.release()
    secondGate.release()
    await Promise.all([first, sameWorkspace, otherWorkspace])
    expect(maxActive).toBe(2)
  })
})
