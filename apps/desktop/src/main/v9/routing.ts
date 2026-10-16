import type { Agent } from '../../shared/v9'

export function recipients(text: string, agents: Agent[]): Agent[] {
  const names = [...text.matchAll(/(^|\s)@([\p{L}\p{N}_-]+)/gu)].map(match => match[2].toLocaleLowerCase('pt-BR'))
  if (!names.length) return agents
  const ids = new Set<string>()
  for (const name of names) {
    const matches = agents.filter(agent => agent.alias.toLocaleLowerCase('pt-BR') === name)
    if (matches.length !== 1) throw new Error(`A menção @${name} não identifica um participante deste grupo.`)
    ids.add(matches[0].id)
  }
  return agents.filter(agent => ids.has(agent.id))
}

/** One lease per canonical workspace; nested delegation keeps the parent's lease. */
export class WorkspaceQueue {
  private pending: Array<{ key: string; task: () => Promise<void>; signal: AbortSignal; done: () => void; onAbort: () => void }> = []
  private keys = new Set<string>()
  private active = 0
  enqueue(key: string, signal: AbortSignal, task: () => Promise<void>): Promise<void> {
    return new Promise(done => {
      const entry = { key, signal, task, done, onAbort: () => this.pump() }
      this.pending.push(entry); signal.addEventListener('abort', entry.onAbort, { once: true }); this.pump()
    })
  }
  private pump(): void {
    for (let index = 0; index < this.pending.length;) {
      const entry = this.pending[index]
      if (entry.signal.aborted) { this.pending.splice(index, 1); entry.signal.removeEventListener('abort', entry.onAbort); entry.done(); continue }
      if (this.active >= 2 || this.keys.has(entry.key)) { index++; continue }
      this.pending.splice(index, 1); entry.signal.removeEventListener('abort', entry.onAbort); this.keys.add(entry.key); this.active++
      void entry.task().catch(() => undefined).finally(() => {
        this.active--; this.keys.delete(entry.key); entry.done(); this.pump()
      })
    }
  }
}
