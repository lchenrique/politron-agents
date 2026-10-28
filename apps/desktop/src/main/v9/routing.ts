import type { Agent } from '../../shared/v9'

export function mentionedRecipients(text: string, agents: Agent[]): Agent[] | undefined {
  const names = [...text.matchAll(/(^|\s)@([\p{L}\p{N}_-]+)/gu)].map(match => match[2].toLocaleLowerCase('pt-BR'))
  if (!names.length) return undefined
  const ids = new Set<string>()
  for (const name of names) {
    const matches = agents.filter(agent => agent.alias.toLocaleLowerCase('pt-BR') === name)
    if (matches.length !== 1) throw new Error(`A menção @${name} não identifica um participante deste grupo.`)
    ids.add(matches[0].id)
  }
  return agents.filter(agent => ids.has(agent.id))
}

export function recipients(text: string, agents: Agent[], responseMode: 'broadcast' | 'leader' | 'auto' | 'discussion' = 'leader', leaderAgentId?: string | null): Agent[] {
  const mentioned = mentionedRecipients(text, agents)
  if (mentioned) return mentioned
  if (responseMode === 'broadcast' || responseMode === 'discussion') return agents
  // Auto starts from its deterministic fallback; AppService replaces this with Jev's pick when available.
  const leader = leaderAgentId ? agents.find(agent => agent.id === leaderAgentId) : undefined
  return [leader || agents[0]].filter((agent): agent is Agent => !!agent)
}

/** Uma família ocupa uma vaga/pasta; filhos aguardados herdam essa concessão. */
export interface WorkspaceLease { readonly key: string }
type LeaseRoot = { key: string; children: Set<Promise<void>>; closed: boolean }
type LeaseScope = { root: LeaseRoot; tail: Promise<void>; closed: boolean }
type QueueEntry = { key: string; task: (lease: WorkspaceLease) => Promise<void>; signal: AbortSignal; done: () => void; fail: (error: unknown) => void; onAbort: () => void }
export class WorkspaceQueue {
  private pending: QueueEntry[] = []
  private keys = new Set<string>()
  private scopes = new WeakMap<WorkspaceLease, LeaseScope>()
  private active = 0
  enqueue(key: string, signal: AbortSignal, task: (lease: WorkspaceLease) => Promise<void>): Promise<void> {
    return new Promise((done, fail) => {
      const entry = { key, signal, task, done, fail, onAbort: () => this.pump() }
      this.pending.push(entry); signal.addEventListener('abort', entry.onAbort, { once: true }); this.pump()
    })
  }
  isPending(signal: AbortSignal): boolean { return this.pending.some(entry => entry.signal === signal) }
  /** Passa a entrada para a frente da fila (Enviar agora sem steering). */
  prioritize(signal: AbortSignal): void { const index = this.pending.findIndex(entry => entry.signal === signal); if (index > 0) this.pending.unshift(...this.pending.splice(index, 1)) }
  enqueueDelegation(key: string, signal: AbortSignal, task: (lease: WorkspaceLease) => Promise<void>, parent?: WorkspaceLease): Promise<void> {
    const scope = parent && this.scopes.get(parent)
    if (!scope || scope.closed || scope.root.closed || scope.root.key !== key) return this.enqueue(key, signal, task)
    let started = false
    let settle!: () => void
    const cancelled = new Promise<void>(resolve => { settle = resolve })
    const abort = () => { if (!started) settle() }
    signal.addEventListener('abort', abort, { once: true })
    const pending = scope.tail.then(async () => {
      if (signal.aborted) return
      started = true
      await this.executeScope(scope.root, task)
    })
    // Irmãos são sequenciais; cada filho possui sua própria fila reentrante de descendentes.
    scope.tail = pending.catch(() => undefined)
    scope.root.children.add(pending)
    void pending.then(() => scope.root.children.delete(pending), () => scope.root.children.delete(pending))
    return Promise.race([pending, cancelled]).finally(() => signal.removeEventListener('abort', abort))
  }
  private async executeScope(root: LeaseRoot, task: (lease: WorkspaceLease) => Promise<void>): Promise<void> {
    const lease: WorkspaceLease = { key: root.key }
    const scope: LeaseScope = { root, tail: Promise.resolve(), closed: false }
    this.scopes.set(lease, scope)
    try { await task(lease) } finally {
      // A concessão só libera a pasta após TODA a subárvore terminar.
      // Um filho pode retornar sem aguardar o neto; nesse caso o próximo irmão não pode escrever ainda.
      scope.closed = true
      await scope.tail
    }
  }
  private async executeRoot(entry: QueueEntry): Promise<void> {
    const root: LeaseRoot = { key: entry.key, children: new Set(), closed: false }
    try {
      await this.executeScope(root, entry.task)
    } finally {
      // Uma falha precoce da origem não permite outra raiz escrever enquanto um filho termina.
      while (root.children.size) await Promise.allSettled([...root.children])
      root.closed = true
    }
  }
  private pump(): void {
    for (let index = 0; index < this.pending.length;) {
      const entry = this.pending[index]
      if (entry.signal.aborted) { this.pending.splice(index, 1); entry.signal.removeEventListener('abort', entry.onAbort); entry.done(); continue }
      if (this.active >= 2 || this.keys.has(entry.key)) { index++; continue }
      this.pending.splice(index, 1); entry.signal.removeEventListener('abort', entry.onAbort); this.keys.add(entry.key); this.active++
      void this.executeRoot(entry).then(entry.done, entry.fail).finally(() => {
        this.active--; this.keys.delete(entry.key); this.pump()
      })
    }
  }
}
