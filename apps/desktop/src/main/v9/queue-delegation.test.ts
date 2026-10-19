import { describe, expect, it } from 'vitest'
import { WorkspaceQueue, type WorkspaceLease } from './routing'

const signal = () => new AbortController().signal
const delegate = (queue: WorkspaceQueue, key: string, parent: WorkspaceLease, task: (lease: WorkspaceLease) => Promise<void>) => queue.enqueueDelegation(key, signal(), task, parent)

describe('concessões de execução para delegação', () => {
  it('dois pais aguardam seus filhos sem consumir uma terceira vaga global', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let release!: () => void, started = 0
    const both = new Promise<void>(resolve => { release = resolve })
    await Promise.all(['a', 'b'].map(key => queue.enqueue(key, signal(), async lease => {
      if (++started === 2) release()
      await both
      await delegate(queue, key, lease, async () => { trace.push(key) })
    })))
    expect(trace.sort()).toEqual(['a', 'b'])
  })
  it('pai, filho e neto compartilham a concessão sem travar', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    await queue.enqueue('repo', signal(), async parent => {
      await delegate(queue, 'repo', parent, async child => {
        await delegate(queue, 'repo', child, async () => { trace.push('neto') })
        trace.push('filho')
      })
      trace.push('pai')
    })
    expect(trace).toEqual(['neto', 'filho', 'pai'])
  })
  it('serializa irmãos e mantém outra raiz da mesma pasta aguardando', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let active = 0, max = 0
    const root = queue.enqueue('repo', signal(), async parent => {
      await Promise.all([1, 2, 3, 4, 5, 6].map(index => delegate(queue, 'repo', parent, async () => {
        max = Math.max(max, ++active)
        await Promise.resolve(); trace.push(String(index)); active--
      })))
      trace.push('pai')
    })
    const next = queue.enqueue('repo', signal(), async () => { trace.push('outra-raiz') })
    await Promise.all([root, next])
    expect(max).toBe(1)
    expect(trace).toEqual(['1', '2', '3', '4', '5', '6', 'pai', 'outra-raiz'])
  })
  it('propaga erro e libera a pasta para a próxima tarefa', async () => {
    const queue = new WorkspaceQueue()
    await expect(queue.enqueue('repo', signal(), lease => delegate(queue, 'repo', lease, async () => { throw new Error('falha do filho') }))).rejects.toThrow('falha do filho')
    let ran = false
    await queue.enqueue('repo', signal(), async () => { ran = true })
    expect(ran).toBe(true)
  })
  it('cancela um irmão pendente sem interromper os demais', async () => {
    const queue = new WorkspaceQueue(), controller = new AbortController(), trace: string[] = []
    await queue.enqueue('repo', signal(), async lease => {
      const first = delegate(queue, 'repo', lease, async () => { trace.push('primeiro') })
      const second = queue.enqueueDelegation('repo', controller.signal, async () => { trace.push('cancelado') }, lease)
      controller.abort()
      const third = delegate(queue, 'repo', lease, async () => { trace.push('terceiro') })
      await Promise.all([first, second, third])
    })
    expect(trace).toEqual(['primeiro','terceiro'])
  })
  it('não inicia irmão enquanto um neto não aguardado ainda ocupa a pasta', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let releaseGrandchild!: () => void
    const grandchildGate = new Promise<void>(resolve => { releaseGrandchild = resolve })
    let grandchild!: Promise<void>
    let markGrandchildStarted!: () => void
    const grandchildStarted = new Promise<void>(resolve => { markGrandchildStarted = resolve })
    await queue.enqueue('repo', signal(), async parent => {
      const first = delegate(queue, 'repo', parent, async child => {
        grandchild = delegate(queue, 'repo', child, async () => {
          trace.push('neto-iniciou')
          markGrandchildStarted()
          await grandchildGate
          trace.push('neto-terminou')
        })
      })
      const second = delegate(queue, 'repo', parent, async () => { trace.push('irmão-iniciou') })
      await grandchildStarted
      await Promise.resolve()
      const beforeRelease = [...trace]
      releaseGrandchild()
      await Promise.all([first, grandchild, second])
      expect(beforeRelease).toEqual(['neto-iniciou'])
    })
    expect(trace).toEqual(['neto-iniciou', 'neto-terminou', 'irmão-iniciou'])
  })
  it('background na mesma pasta aguarda a origem liberar a concessão', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let background!: Promise<void>
    await queue.enqueue('repo', signal(), async () => {
      background = queue.enqueueDelegation('repo', signal(), async () => { trace.push('background') })
      trace.push('origem')
      await Promise.resolve()
      expect(trace).toEqual(['origem'])
    })
    await background
    expect(trace).toEqual(['origem','background'])
  })
})
