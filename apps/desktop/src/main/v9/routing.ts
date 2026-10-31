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

/** Faixa própria do Chief numa conversa: o Chief nunca espera por Boos que trabalham na pasta. */
export const chiefLaneKey = (workspacePath: string, conversationId: string) => `${workspacePath}\u0000chief:${conversationId}`
/** Sessão (conversa + agente) do motor: um turno por vez, mesmo que a conversa mude de pasta. */
export const sessionLockKey = (conversationId: string, agentId: string) => `${conversationId}\u0000${agentId}`
/** Caminhos equivalentes (caixa no Windows, separadores, barra final) caem na mesma trava de pasta. */
export const canonicalLockKey = (key: string) => {
  const [path, ...rest] = key.replace(/[\\/]+/g, '/').split('\u0000')
  const normalized = [path.replace(/\/+$/, ''), ...rest].join('\u0000')
  return process.platform === 'win32' || process.platform === 'darwin' ? normalized.toLocaleLowerCase('en-US') : normalized
}
/** Limite global opcional: inteiro positivo liga; ausente, zero ou inválido = sem limite. */
export const parseConcurrencyLimit = (value: string | number | undefined | null) => { const limit = Number(value); return Number.isInteger(limit) && limit > 0 ? limit : 0 }
export type EnqueueOptions = {
  /** Não ocupa vaga global nem a pasta; só serializa a própria faixa. */ lane?: boolean
  /** Entra antes de entradas sem prioridade, mantendo a ordem entre prioritárias. */ priority?: boolean
  /** Sessão que não aceita turnos concorrentes: serializa também entre pastas diferentes. */ session?: string
}
export type WorkspaceQueueOptions = { /** Máximo de execuções simultâneas entre pastas diferentes; 0 ou ausente = sem limite. */ maxConcurrent?: number }

/** Uma família ocupa a sua pasta; filhos aguardados herdam essa concessão. Pastas diferentes não se esperam. */
export interface WorkspaceLease { readonly key: string }
type LeaseRoot = { key: string; lane: boolean; suspended: number; children: Set<Promise<void>>; closed: boolean }
type LeaseScope = { root: LeaseRoot; tail: Promise<void>; closed: boolean }
type QueueEntry = { lane?: boolean; priority?: boolean; key: string; locks: string[]; task: (lease: WorkspaceLease) => Promise<void>; signal: AbortSignal; done: () => void; fail: (error: unknown) => void; onAbort: () => void }
export class WorkspaceQueue {
  private pending: QueueEntry[] = []
  private locks = new Set<string>()
  private scopes = new WeakMap<WorkspaceLease, LeaseScope>()
  private active = 0
  private maxConcurrent: number
  constructor(options: WorkspaceQueueOptions = {}) { this.maxConcurrent = parseConcurrencyLimit(options.maxConcurrent) }
  /** Ajusta o limite global em tempo de execução; 0 desliga. */
  setMaxConcurrent(limit: number): void { this.maxConcurrent = parseConcurrencyLimit(limit); this.pump() }
  /** Critério de serialização: a pasta (cwd/worktree) e, se informada, a sessão do motor. Fora disso, tudo roda em paralelo. */
  enqueue(key: string, signal: AbortSignal, task: (lease: WorkspaceLease) => Promise<void>, options?: EnqueueOptions): Promise<void> {
    return new Promise((done, fail) => {
      const lockKey = canonicalLockKey(key)
      const locks = [lockKey, ...(options?.session ? [`session\u0000${options.session}`] : [])]
      const entry: QueueEntry = { key: lockKey, locks, signal, task, done, fail, onAbort: () => this.pump(), ...(options?.lane ? { lane: true } : {}), ...(options?.priority ? { priority: true } : {}) }
      if (entry.priority) { const first = this.pending.findIndex(item => !item.priority); this.pending.splice(first < 0 ? this.pending.length : first, 0, entry) } else this.pending.push(entry)
      signal.addEventListener('abort', entry.onAbort, { once: true }); this.pump()
    })
  }
  isPending(signal: AbortSignal): boolean { return this.pending.some(entry => entry.signal === signal) }
  /** Passa a entrada para a frente da fila (Enviar agora sem steering). */
  prioritize(signal: AbortSignal): void { const index = this.pending.findIndex(entry => entry.signal === signal); if (index > 0) this.pending.unshift(...this.pending.splice(index, 1)) }
  enqueueDelegation(key: string, signal: AbortSignal, task: (lease: WorkspaceLease) => Promise<void>, parent?: WorkspaceLease, options?: EnqueueOptions): Promise<void> {
    const lockKey = canonicalLockKey(key)
    const scope = parent && this.scopes.get(parent)
    if (!scope || scope.closed || scope.root.closed) return this.enqueue(key, signal, task, options)
    if (scope.root.key !== lockKey) {
      // Outra pasta: o filho é uma raiz própria. O pai, que só aguarda, devolve a vaga global enquanto espera,
      // para que o limite opcional nunca vire impasse entre pai e filho.
      const root = scope.root
      this.suspend(root)
      return this.enqueue(key, signal, task, options).finally(() => this.resume(root))
    }
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
    // Irmãos na mesma pasta são sequenciais; cada filho possui sua própria fila reentrante de descendentes.
    scope.tail = pending.catch(() => undefined)
    scope.root.children.add(pending)
    void pending.then(() => scope.root.children.delete(pending), () => scope.root.children.delete(pending))
    return Promise.race([pending, cancelled]).finally(() => signal.removeEventListener('abort', abort))
  }
  private suspend(root: LeaseRoot): void { if (root.lane || root.suspended++) return; this.active--; this.pump() }
  private resume(root: LeaseRoot): void { if (root.lane || --root.suspended) return; this.active++ }
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
    const root: LeaseRoot = { key: entry.key, lane: entry.lane === true, suspended: 0, children: new Set(), closed: false }
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
      const full = !entry.lane && this.maxConcurrent > 0 && this.active >= this.maxConcurrent
      if (full || entry.locks.some(lock => this.locks.has(lock))) { index++; continue }
      this.pending.splice(index, 1); entry.signal.removeEventListener('abort', entry.onAbort); for (const lock of entry.locks) this.locks.add(lock); if (!entry.lane) this.active++
      void this.executeRoot(entry).then(entry.done, entry.fail).finally(() => {
        if (!entry.lane) this.active--; for (const lock of entry.locks) this.locks.delete(lock); this.pump()
      })
    }
  }
}