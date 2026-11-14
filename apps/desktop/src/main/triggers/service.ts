import { BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { statSync, watch as fsWatch } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DEFAULT_TRIGGER_TEMPLATES, renderTriggerTemplate, type Trigger, type TriggerAvailability, type TriggerSource } from '../../shared/triggers'
import type { AppService } from '../v9/workspace'

/** O que os gatilhos usam do núcleo V9: o mesmo envio do Composer e as tabelas do store. */
export type TriggerHost = Pick<AppService, 'send' | 'snapshot'> & {
  store: Pick<AppService['store'], 'triggers' | 'trigger' | 'putTrigger' | 'deleteTrigger' | 'conversation' | 'workspace' | 'runs'>
}
/** Observa uma pasta (recursiva) e avisa o caminho relativo alterado; devolve a função que para. */
export type FolderWatch = (path: string, onChange: (file: string) => void) => () => void
/** Roda um executável sem shell e devolve o stdout. */
export type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<string>

const DEBOUNCE_MS = 2_000
/** Depois da última atividade do Boo na conversa-alvo, mudanças ainda são tratadas como dele. */
const GRACE_MS = 5_000
const MAX_PER_MINUTE = 3
const POLL_MS = 2 * 60_000
const BUSY_CACHE_MS = 500
const MAX_SEEN = 200
const ACTIVE = new Set(['queued', 'running', 'waiting'])
const IGNORED = /(^|[\\/])(\.git|node_modules)([\\/]|$)/
const NO_GH = 'GitHub CLI (gh) não encontrado. Instale pelo site cli.github.com e rode "gh auth login" para usar gatilhos do GitHub.'

const defaultWatch: FolderWatch = (path, onChange) => {
  const watcher = fsWatch(path, { recursive: true }, (_event, file) => onChange(file ? String(file) : ''))
  watcher.on('error', () => undefined)
  return () => watcher.close()
}
const defaultRunner: CommandRunner = (command, args, cwd) => new Promise((resolve, reject) => {
  execFile(command, args, { cwd, timeout: 30_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(String(stdout)))
})

/**
 * Gatilhos automáticos: pasta observada (fs.watch com debounce) e polling do GitHub via `gh`.
 * Cada disparo vira uma mensagem na conversa-alvo pelo `send` normal, então grupos seguem líder ou roteador.
 */
export class TriggerService {
  private readonly watch: FolderWatch
  private readonly run: CommandRunner
  private readonly now: () => number
  private readonly watchers = new Map<string, { path: string; close: () => void }>()
  private readonly pending = new Map<string, { files: Set<string>; tainted: boolean; timer: ReturnType<typeof setTimeout> }>()
  private readonly fires = new Map<string, number[]>()
  private readonly lastBusy = new Map<string, number>()
  private busyCache: { at: number; conversations: string[]; parents: Map<string, string | undefined> } | null = null
  private github: TriggerAvailability['github'] | null = null
  private poller: ReturnType<typeof setInterval> | null = null
  private polling = false

  constructor(private readonly host: TriggerHost, options: { watch?: FolderWatch; run?: CommandRunner; now?: () => number } = {}) {
    this.watch = options.watch || defaultWatch
    this.run = options.run || defaultRunner
    this.now = options.now || Date.now
  }

  start(pollMs = POLL_MS): void {
    this.sync()
    this.poller = setInterval(() => void this.pollGithub(), pollMs)
    this.poller.unref?.()
  }

  dispose(): void {
    if (this.poller) clearInterval(this.poller)
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
    for (const batch of this.pending.values()) clearTimeout(batch.timer)
    this.pending.clear()
  }

  list(): Trigger[] { return this.host.store.triggers().sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }

  async availability(): Promise<TriggerAvailability> {
    if (!this.github?.available) {
      try { await this.run('gh', ['--version']); this.github = { available: true, reason: null } } catch { this.github = { available: false, reason: NO_GH } }
    }
    return { github: { ...this.github } }
  }

  async save(input: Partial<Trigger>): Promise<Trigger> {
    const previous = input.id ? this.host.store.trigger(input.id) : undefined
    const source = this.validSource(input.source ?? previous?.source)
    const conversationId = String(input.conversationId ?? previous?.conversationId ?? '')
    let conversation
    try { conversation = this.host.store.conversation(conversationId) } catch { throw new Error('Escolha a conversa que vai receber a mensagem.') }
    if (conversation.archived) throw new Error('A conversa escolhida está arquivada.')
    const template = String(input.template ?? previous?.template ?? '').trim() || DEFAULT_TRIGGER_TEMPLATES[source.kind]
    if (template.length > 4000) throw new Error('O modelo de mensagem passa de 4000 caracteres.')
    const enabled = input.enabled ?? previous?.enabled ?? true
    if (typeof enabled !== 'boolean') throw new Error('Valor inválido para ligado/desligado.')
    if (enabled && source.kind !== 'folder' && !(await this.availability()).github.available) throw new Error(NO_GH)
    const name = String(input.name ?? previous?.name ?? '').trim().slice(0, 80) || (source.kind === 'folder' ? 'Pasta observada' : source.kind === 'github-issue' ? `Issue com ${source.label}` : 'CI falhou')
    const sameSource = previous && JSON.stringify(previous.source) === JSON.stringify(source)
    const now = new Date(this.now()).toISOString()
    const value: Trigger = { id: previous?.id || randomUUID(), name, source, conversationId, template, enabled,
      lastFiredAt: previous?.lastFiredAt ?? null, lastError: sameSource ? previous.lastError : null,
      ...(sameSource && previous.seen ? { seen: previous.seen } : {}), createdAt: previous?.createdAt || now, updatedAt: now }
    this.host.store.putTrigger(value)
    this.sync()
    return value
  }

  remove(id: string): void {
    this.host.store.trigger(id)
    this.host.store.deleteTrigger(id)
    this.sync()
  }

  private validSource(source: unknown): TriggerSource {
    const value = source as Partial<TriggerSource> | undefined
    if (value?.kind === 'folder') {
      const path = typeof value.path === 'string' ? value.path.trim() : ''
      if (!path || !isAbsolute(path)) throw new Error('Informe o caminho completo da pasta a observar.')
      try { if (!statSync(path).isDirectory()) throw new Error() } catch { throw new Error('A pasta informada não existe.') }
      return { kind: 'folder', path }
    }
    if (value?.kind === 'github-issue') {
      const label = typeof value.label === 'string' ? value.label.trim() : ''
      if (!label || label.length > 50) throw new Error('Informe a label das issues (até 50 caracteres).')
      return { kind: 'github-issue', label }
    }
    if (value?.kind === 'github-ci') return { kind: 'github-ci' }
    throw new Error('Tipo de gatilho inválido.')
  }

  /** Mantém um observador por gatilho de pasta ligado; fecha os que saíram ou mudaram de pasta. */
  private sync(): void {
    const wanted = new Map(this.host.store.triggers().filter(item => item.enabled && item.source.kind === 'folder').map(item => [item.id, (item.source as { path: string }).path]))
    for (const [id, watcher] of this.watchers) if (wanted.get(id) !== watcher.path) { watcher.close(); this.watchers.delete(id) }
    for (const [id, path] of wanted) {
      if (this.watchers.has(id)) continue
      try { this.watchers.set(id, { path, close: this.watch(path, file => this.onFolderChange(id, file)) }) } catch (error) { this.patch(id, { lastError: `Não foi possível observar a pasta: ${error instanceof Error ? error.message : 'erro'}` }) }
    }
  }

  onFolderChange(id: string, file: string): void {
    if (file && IGNORED.test(file)) return
    let trigger: Trigger
    try { trigger = this.host.store.trigger(id) } catch { return }
    const batch = this.pending.get(id) || { files: new Set<string>(), tainted: false, timer: undefined as unknown as ReturnType<typeof setTimeout> }
    // Proteção contra loop: mudança feita enquanto o Boo trabalha na conversa-alvo é dele, não do mundo lá fora.
    if (this.busy(trigger.conversationId)) batch.tainted = true
    if (file) batch.files.add(file)
    clearTimeout(batch.timer)
    batch.timer = setTimeout(() => void this.flush(id), DEBOUNCE_MS)
    batch.timer.unref?.()
    this.pending.set(id, batch)
  }

  private async flush(id: string): Promise<void> {
    const batch = this.pending.get(id)
    this.pending.delete(id)
    let trigger: Trigger
    try { trigger = this.host.store.trigger(id) } catch { return }
    if (!batch || batch.tainted || !trigger.enabled || trigger.source.kind !== 'folder' || this.busy(trigger.conversationId)) return
    const files = [...batch.files]
    const list = files.slice(0, 20).map(file => `- ${file}`).join('\n') + (files.length > 20 ? `\n… e mais ${files.length - 20}` : '')
    await this.fire(trigger, { pasta: trigger.source.path, arquivos: list || '(sem nome de arquivo)', quantidade: String(files.length) })
  }

  /** Há execução ativa na conversa-alvo ou em conversas delegadas a partir dela (ou terminou há pouco). */
  private busy(conversationId: string): boolean {
    const now = this.now()
    if (!this.busyCache || now - this.busyCache.at > BUSY_CACHE_MS) {
      const conversations = [...new Set(this.host.store.runs().filter(run => ACTIVE.has(run.status)).map(run => run.conversationId))]
      const parents = conversations.length ? new Map(this.host.snapshot().conversations.map(item => [item.id, item.parentConversationId])) : new Map<string, string | undefined>()
      this.busyCache = { at: now, conversations, parents }
    }
    for (const start of this.busyCache.conversations) {
      let current: string | undefined = start
      for (let depth = 0; current && depth < 10; depth++, current = this.busyCache.parents.get(current)) {
        if (current === conversationId) { this.lastBusy.set(conversationId, now); return true }
      }
    }
    return now - (this.lastBusy.get(conversationId) ?? -Infinity) < GRACE_MS
  }

  private async fire(trigger: Trigger, values: Record<string, string>): Promise<boolean> {
    const now = this.now()
    const recent = (this.fires.get(trigger.id) || []).filter(at => now - at < 60_000)
    if (recent.length >= MAX_PER_MINUTE) {
      this.fires.set(trigger.id, recent)
      this.patch(trigger.id, { lastError: `Limite de ${MAX_PER_MINUTE} disparos por minuto atingido; evento ignorado.` })
      return false
    }
    this.fires.set(trigger.id, [...recent, now])
    // Conta como atividade desde já: o Boo ainda nem começou e já pode tocar na pasta.
    this.lastBusy.set(trigger.conversationId, now)
    this.busyCache = null
    try {
      const text = `[Gatilho: ${trigger.name}]\n${renderTriggerTemplate(trigger.template, values)}`
      await this.host.send(trigger.conversationId, text, undefined, undefined, undefined, false, true, false, { requestId: randomUUID(), delivery: 'queue', returnAfterAcceptance: true })
      this.patch(trigger.id, { lastFiredAt: new Date(now).toISOString(), lastError: null })
      return true
    } catch (error) {
      this.patch(trigger.id, { lastError: `Não foi possível enviar: ${error instanceof Error ? error.message : 'erro'}` })
      return false
    }
  }

  /** Uma rodada de polling dos gatilhos do GitHub. A primeira leitura só registra o que já existe. */
  async pollGithub(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const triggers = this.host.store.triggers().filter(item => item.enabled && item.source.kind !== 'folder')
      if (!triggers.length || !(await this.availability()).github.available) return
      for (const trigger of triggers) await this.pollTrigger(trigger).catch(error => this.patch(trigger.id, { lastError: `GitHub: ${(error instanceof Error ? error.message : 'erro').split('\n')[0].slice(0, 200)}` }))
    } finally { this.polling = false }
  }

  private async pollTrigger(trigger: Trigger): Promise<void> {
    const source = trigger.source
    const cwd = this.host.store.workspace(this.host.store.conversation(trigger.conversationId).workspaceId).path
    const items: { id: string; values: Record<string, string> }[] = source.kind === 'github-issue'
      ? (JSON.parse(await this.run('gh', ['issue', 'list', '--label', source.label, '--state', 'open', '--json', 'number,title,url', '--limit', '30'], cwd)) as { number: number; title: string; url: string }[])
        .map(issue => ({ id: String(issue.number), values: { numero: String(issue.number), titulo: issue.title, url: issue.url, label: source.label } }))
      : (JSON.parse(await this.run('gh', ['run', 'list', '--status', 'failure', '--json', 'databaseId,workflowName,headBranch,url,displayTitle', '--limit', '20'], cwd)) as { databaseId: number; workflowName: string; headBranch: string; url: string; displayTitle: string }[])
        .map(run => ({ id: String(run.databaseId), values: { workflow: run.workflowName, branch: run.headBranch, url: run.url, titulo: run.displayTitle } }))
    const seen = new Set(trigger.seen || [])
    const fresh = trigger.seen ? items.filter(item => !seen.has(item.id)).reverse() : []
    // O que já foi visto vale mesmo se o disparo for barrado pelo limite: nada é reenviado depois.
    this.patch(trigger.id, { seen: [...new Set([...items.map(item => item.id), ...(trigger.seen || [])])].slice(0, MAX_SEEN), ...(trigger.seen ? {} : { lastError: null }) })
    for (const item of fresh) await this.fire(this.host.store.trigger(trigger.id), item.values)
  }

  private patch(id: string, value: Partial<Trigger>): void {
    try { this.host.store.putTrigger({ ...this.host.store.trigger(id), ...value }) } catch { /* gatilho removido */ }
  }
}

/** IPC só local, como o do Telegram: fica fora da RPC de hosts. */
export function registerTriggersIpc(service: TriggerService): () => void {
  const handlers: Record<string, (...args: never[]) => unknown> = {
    list: () => service.list(),
    availability: () => service.availability(),
    save: (input: Partial<Trigger>) => service.save(input),
    remove: (id: string) => service.remove(id),
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(`triggers:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    return handler(...args as never[])
  })
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(`triggers:${channel}`) }
}
