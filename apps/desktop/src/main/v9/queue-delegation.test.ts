import { describe, expect, it } from 'vitest'
import { WorkspaceQueue, chiefLaneKey, parseConcurrencyLimit, sessionLockKey, type WorkspaceLease } from './routing'

const signal = () => new AbortController().signal
const delegate = (queue: WorkspaceQueue, key: string, parent: WorkspaceLease, task: (lease: WorkspaceLease) => Promise<void>) => queue.enqueueDelegation(key, signal(), task, parent)

describe('concessões de execução para delegação', () => {
  it('dois pais aguardam seus filhos sem consumir uma terceira vaga global (limite 2)', async () => {
    const queue = new WorkspaceQueue({ maxConcurrent: 2 }), trace: string[] = []
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

describe('serialização por pasta de trabalho, não por Boo', () => {
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5))
  it('dois Boos em worktrees diferentes rodam ao mesmo tempo, sem fila nem limite global', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let running = 0, peak = 0
    const work = (name: string) => async () => { peak = Math.max(peak, ++running); trace.push(name + ':inicio'); await tick(); running--; trace.push(name + ':fim') }
    await Promise.all(['wt-a', 'wt-b', 'wt-c', 'wt-d', 'wt-e'].map(key => queue.enqueue(key, signal(), work(key))))
    expect(peak).toBe(5)
  })
  it('o mesmo Boo roda em worktrees diferentes ao mesmo tempo, cada um com a sua sessão', async () => {
    const queue = new WorkspaceQueue()
    let running = 0, peak = 0
    const work = async () => { peak = Math.max(peak, ++running); await tick(); running-- }
    await Promise.all([
      queue.enqueue('wt-a', signal(), work, { session: sessionLockKey('conversa-1', 'boo') }),
      queue.enqueue('wt-b', signal(), work, { session: sessionLockKey('conversa-2', 'boo') }),
    ])
    expect(peak).toBe(2)
  })
  it('duas tarefas no mesmo cwd continuam serializadas, inclusive com caminho escrito de outro jeito', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    let running = 0, peak = 0
    const work = (name: string) => async () => { peak = Math.max(peak, ++running); trace.push(name + ':inicio'); await tick(); running--; trace.push(name + ':fim') }
    await Promise.all([queue.enqueue('C:\\repo\\wt', signal(), work('a')), queue.enqueue('c:/repo/wt/', signal(), work('b'))])
    if (process.platform === 'win32') { expect(peak).toBe(1); expect(trace).toEqual(['a:inicio', 'a:fim', 'b:inicio', 'b:fim']) }
    await Promise.all([queue.enqueue('/repo/x', signal(), work('c')), queue.enqueue('/repo/x/', signal(), work('d'))])
    expect(peak).toBe(1)
  })
  it('a mesma sessão não recebe turnos concorrentes nem em pastas diferentes', async () => {
    const queue = new WorkspaceQueue(), trace: string[] = []
    const work = (name: string) => async () => { trace.push(name + ':inicio'); await tick(); trace.push(name + ':fim') }
    const session = sessionLockKey('conversa', 'boo')
    await Promise.all([queue.enqueue('wt-a', signal(), work('a'), { session }), queue.enqueue('wt-b', signal(), work('b'), { session })])
    expect(trace).toEqual(['a:inicio', 'a:fim', 'b:inicio', 'b:fim'])
  })
  it('limite global opcional: 0 desliga e um valor positivo limita entre pastas diferentes', async () => {
    const queue = new WorkspaceQueue({ maxConcurrent: 2 })
    let running = 0, peak = 0
    const work = async () => { peak = Math.max(peak, ++running); await tick(); running-- }
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map(key => queue.enqueue(key, signal(), work)))
    expect(peak).toBe(2)
    queue.setMaxConcurrent(0); peak = 0
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map(key => queue.enqueue(key, signal(), work)))
    expect(peak).toBe(5)
    expect([parseConcurrencyLimit(undefined), parseConcurrencyLimit('0'), parseConcurrencyLimit('abc'), parseConcurrencyLimit('-1'), parseConcurrencyLimit('3')]).toEqual([0, 0, 0, 0, 3])
  })
  it('pai, filho e neto em pastas diferentes não travam, mesmo com limite global 1', async () => {
    const queue = new WorkspaceQueue({ maxConcurrent: 1 }), trace: string[] = []
    await queue.enqueue('pai', signal(), async parent => {
      await delegate(queue, 'filho', parent, async child => {
        await delegate(queue, 'neto', child, async () => { trace.push('neto') })
        trace.push('filho')
      })
      trace.push('pai')
    })
    expect(trace).toEqual(['neto', 'filho', 'pai'])
  })
  it('dois pais com o limite cheio aguardam filhos de outras pastas: o pai devolve a vaga enquanto espera', async () => {
    const queue = new WorkspaceQueue({ maxConcurrent: 2 }), trace: string[] = []
    let release!: () => void, started = 0
    const both = new Promise<void>(resolve => { release = resolve })
    await Promise.all(['a', 'b'].map(key => queue.enqueue(key, signal(), async lease => {
      if (++started === 2) release()
      await both
      await delegate(queue, key + '-filho', lease, async () => { trace.push(key + '-filho') })
    })))
    expect(trace.sort()).toEqual(['a-filho', 'b-filho'])
  })
  it('Chief (faixa própria) aguarda o filho sem ocupar vaga nem pasta', async () => {
    const queue = new WorkspaceQueue({ maxConcurrent: 1 }), trace: string[] = []
    await queue.enqueue(chiefLaneKey('repo', 'conversa'), signal(), async chief => {
      await delegate(queue, 'repo', chief, async () => { trace.push('boo') })
      trace.push('chief')
    }, { lane: true })
    expect(trace).toEqual(['boo', 'chief'])
  })
})
