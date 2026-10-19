import { describe, expect, it } from 'vitest'
import { GitProcessScheduler, parseGitStatus } from './git-processes'

describe('processos Git', () => {
  it('limita concorrência, propaga falhas e libera a fila', async () => {
    const queue = new GitProcessScheduler(2)
    let active = 0, maximum = 0
    const jobs = Array.from({ length: 12 }, (_, index) => queue.run(async () => {
      maximum = Math.max(maximum, ++active)
      await Promise.resolve(); active--
      if (index === 3) throw new Error('git-failure')
      return index
    }))
    const results = await Promise.allSettled(jobs)
    expect(maximum).toBe(2)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await queue.run(async () => 'livre')).toBe('livre')
  })
  it('não inicia uma consulta pendente cancelada', async () => {
    const queue = new GitProcessScheduler(1), controller = new AbortController()
    let release!: () => void, started = false
    const first = queue.run(() => new Promise<void>(resolve => { release = resolve }))
    const pending = queue.run(async () => { started = true }, controller.signal)
    const rejection = expect(pending).rejects.toThrow('interrompida')
    controller.abort(); await rejection; release(); await first
    expect(started).toBe(false)
  })
  it('preserva branch, repositório vazio, detached HEAD e contagem de mudanças', () => {
    expect(parseGitStatus('## main...origin/main [ahead 1]\n M src/a.ts\n?? new.txt')).toEqual({ branch: 'main', changes: 2 })
    expect(parseGitStatus('## No commits yet on nova')).toEqual({ branch: 'nova', changes: 0 })
    expect(parseGitStatus('## HEAD (no branch)\n M a')).toEqual({ branch: null, changes: 1 })
  })
})
