import { describe, expect, it } from 'vitest'
import { recipients, WorkspaceQueue } from './routing'
import type { Agent } from '../../shared/v9'

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

describe('recipients', () => {
  const agent = (id: string, alias: string) => ({ id, alias } as Agent)
  const alice = agent('a1', 'alice')
  const beto = agent('b1', 'beto')

  it('sem modo ou líder explícito, só o primeiro participante responde', () => {
    expect(recipients('oi time', [alice, beto])).toEqual([alice])
  })

  it('sem menção no modo líder, só o líder responde', () => {
    expect(recipients('oi time', [alice, beto], 'leader', 'b1')).toEqual([beto])
  })

  it('com menção, o líder não muda nada: só quem foi citado responde', () => {
    expect(recipients('@alice oi', [alice, beto], 'leader', 'b1')).toEqual([alice])
  })

  it('líder removido usa o primeiro participante como fallback sem disparar broadcast', () => {
    expect(recipients('oi time', [alice, beto], 'leader', 'removido')).toEqual([alice])
  })

  it('broadcast continua disponível como escolha explícita', () => {
    expect(recipients('oi time', [alice, beto], 'broadcast')).toEqual([alice, beto])
  })
})
