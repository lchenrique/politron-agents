import { BrowserWindow, clipboard, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { hostname, homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import type { HostEntry, HostsSnapshot, RemoteDirectory } from '../../shared/hosts'
import { HostStore } from './secure-store'
import { createIdentity, defaultSettings, pairingLink, parsePairing, validateSettings, type HostsData, type SavedHost } from './identity'
import { HostClient } from './client'
import { HostServer } from './server'
import { HostRpc, type HostRouting } from './rpc'
import { openSshTunnel } from './ssh'
import { validateEndpoint, type RemoteEvent } from './wire'

export class HostManager implements HostRouting {
  private data: HostsData = { identity: createIdentity(hostname()), hosts: [], selectedId: 'local', settings: { ...defaultSettings } }
  private readonly rpc = new HostRpc()
  private server: HostServer | null = null
  private client: HostClient | null = null
  private tunnel: { close(): void } | null = null
  private status: HostEntry['status'] = 'disconnected'
  private error: string | undefined
  private serverError: string | undefined
  private reconnect: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private attempts = 0
  private connectedHostId: string | null = null
  private disposed = false
  private switching = false
  private folderRequests = new Map<string, { owner: number; resolve: (path: string | null) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private readonly store: Pick<HostStore, 'load' | 'save'>, private readonly beforeSelect: () => void = () => undefined) {
    this.register('hosts:browse', (path?: string) => this.browseLocal(path))
  }
  get remote(): boolean { return this.data.selectedId !== 'local' }
  register(method: string, handler: (...args: never[]) => unknown): void { this.rpc.register(method, handler) }
  invoke(method: string, args: unknown[], local: () => unknown, sender?: Electron.WebContents): unknown {
    if (!this.remote) return local()
    if (method === 'v9:pickFolder' && sender) return this.pickFolder(sender)
    if (method === 'v9:createProjectFolder' || method === 'v9:cloneRepository' || method === 'v9:cancelClone') throw new Error('Criar pasta nova ou clonar do GitHub só funciona com este computador selecionado. No host remoto, abra uma pasta que já exista nele.')
    if (!this.rpc.supports(method)) throw new Error('Esta função deve ser configurada no Boobot do host. Voz e terminal interativo ainda são locais; use as ferramentas do agente no chat remoto.')
    if (this.status !== 'connected' || !this.client) throw new Error('Host desconectado. Reconecte antes de continuar; nenhuma operação foi executada neste computador.')
    return this.client.call(method, args)
  }
  publish(event: RemoteEvent): boolean { this.server?.broadcast(event); return !this.remote }
  async initialize(): Promise<void> {
    try { this.data = await this.store.load() } catch (error) { this.serverError = text(error); return }
    if (this.data.settings.enabled) await this.startServer().catch(error => { this.serverError = text(error) })
    if (this.remote) void this.connectSelected()
  }
  snapshot(): HostsSnapshot {
    return { selectedId: this.data.selectedId, local: { ...this.data.settings, running: !!this.server, error: this.serverError }, hosts: [
      { id: 'local', name: hostname(), endpoint: 'Este computador', transport: 'local', status: 'connected' },
      ...this.data.hosts.map(host => ({ id: host.id, name: host.name, endpoint: host.endpoint, transport: host.ssh ? 'ssh' as const : 'direct' as const, status: host.id === this.data.selectedId ? this.status : 'disconnected' as const, error: host.id === this.data.selectedId ? this.error : undefined })),
    ] }
  }
  private changed(): void {
    const snapshot = this.snapshot()
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('hosts:changed', snapshot)
  }
  private async startServer(): Promise<void> {
    const server = new HostServer(this.data.identity, this.rpc.dispatch)
    const port = await server.listen(this.data.settings.address, this.data.settings.port)
    this.data.settings.port = port; this.server = server; this.serverError = undefined
  }
  async configure(input: unknown): Promise<HostsSnapshot> {
    const settings = validateSettings(input)
    if (settings.relayUrl) throw new Error('Relay ainda não está disponível. Use conexão direta por rede/VPN ou SSH.')
    // Persiste antes de abrir a rede: falha no armazenamento seguro não pode deixar um listener exposto.
    const previous = this.data.settings; this.data.settings = settings
    try { await this.store.save(this.data) } catch (error) { this.data.settings = previous; throw error }
    await this.server?.close(); this.server = null
    if (settings.enabled) await this.startServer().catch(error => { this.serverError = text(error); this.changed(); throw error })
    this.changed(); return this.snapshot()
  }
  async add(input: { name: string; pairing: string; endpoint?: string; ssh?: string }): Promise<HostEntry> {
    const parsed = parsePairing(input.pairing)
    if (parsed.id === this.data.identity.id) throw new Error('Este link pertence a este computador. Cole o link no outro Boobot.')
    const host: SavedHost = { ...parsed, name: input.name?.trim().slice(0, 100) || parsed.name, endpoint: input.endpoint?.trim() ? validateEndpoint(input.endpoint.trim()) : parsed.endpoint, ssh: input.ssh?.trim() || undefined }
    const candidate = new HostClient(host)
    const tunnel = host.ssh ? await openSshTunnel(host.ssh, Number(new URL(host.endpoint).port || 80)) : null
    try { await candidate.connect(tunnel?.endpoint); const index = this.data.hosts.findIndex(item => item.id === host.id); const previous = [...this.data.hosts]; if (index < 0) this.data.hosts.push(host); else this.data.hosts[index] = host; try { await this.store.save(this.data) } catch (error) { this.data.hosts = previous; throw error } }
    finally { candidate.close(); tunnel?.close() }
    if (this.data.selectedId === host.id) { this.disconnect(); void this.connectSelected() }
    this.changed(); return this.snapshot().hosts.find(item => item.id === host.id)!
  }
  async select(id: string): Promise<void> {
    if (this.switching) throw new Error('Aguarde a troca de host atual.')
    if (id !== 'local' && !this.data.hosts.some(host => host.id === id)) throw new Error('Host não encontrado.')
    if (id === this.data.selectedId) return
    this.switching = true
    try {
      const previous = this.data.selectedId; this.data.selectedId = id
      try { await this.store.save(this.data) } catch (error) { this.data.selectedId = previous; throw error }
      this.beforeSelect(); this.connectedHostId = null; this.disconnect(); this.error = undefined
      if (this.remote) void this.connectSelected()
      this.changed()
      // Componentes e caches de conversa não podem carregar dados do host anterior.
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.reload()
    } finally { this.switching = false }
  }
  async remove(id: string): Promise<void> {
    if (id === 'local') throw new Error('O computador local não pode ser removido.')
    if (this.data.selectedId === id) await this.select('local')
    const previous = this.data.hosts; this.data.hosts = previous.filter(host => host.id !== id)
    try { await this.store.save(this.data) } catch (error) { this.data.hosts = previous; throw error }
    this.changed()
  }
  async copyPairing(): Promise<void> {
    if (!this.server) throw new Error('Ative o host antes de copiar o link.')
    await this.store.save(this.data)
    clipboard.writeText(pairingLink(this.data.identity, this.data.settings.advertisedUrl))
  }
  async revoke(): Promise<HostsSnapshot> {
    const previous = this.data.identity.token; this.data.identity.token = randomBytes(32).toString('base64url')
    try { await this.store.save(this.data) } catch (error) { this.data.identity.token = previous; throw error }
    await this.server?.close(); this.server = null
    if (this.data.settings.enabled) await this.startServer()
    this.changed(); return this.snapshot()
  }
  private disconnect(): void {
    this.generation++; clearTimeout(this.reconnect); this.reconnect = undefined
    this.client?.removeAllListeners(); this.client?.close(); this.client = null
    this.tunnel?.close(); this.tunnel = null; this.status = 'disconnected'
  }
  private async connectSelected(): Promise<void> {
    const host = this.data.hosts.find(item => item.id === this.data.selectedId)
    if (!host || this.disposed) return
    const generation = ++this.generation
    this.status = 'connecting'; this.changed()
    const client = new HostClient(host); this.client = client
    let tunnel: Awaited<ReturnType<typeof openSshTunnel>> | null = null
    try {
      tunnel = host.ssh ? await openSshTunnel(host.ssh, Number(new URL(host.endpoint).port || 80)) : null
      if (generation !== this.generation) { tunnel?.close(); client.close(); return }
      this.tunnel = tunnel
      client.on('event', (event: RemoteEvent) => {
        if (generation !== this.generation || !['v9:event', 'providers:changed'].includes(event.channel)) return
        for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(event.channel, event.data)
      })
      client.on('disconnected', () => this.scheduleReconnect(generation))
      await client.connect(tunnel?.endpoint)
      if (generation !== this.generation) { client.close(); tunnel?.close(); return }
      const restored = this.connectedHostId === host.id
      this.connectedHostId = host.id
      this.status = 'connected'; this.error = undefined; this.attempts = 0; this.changed()
      void client.call('providers:list').then(data => {
        if (generation !== this.generation) return
        for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('providers:changed', data)
      }).catch(() => undefined)
      // Recuperação por snapshot, sem reenviar comandos possivelmente executados.
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('v9:event', restored ? { type: 'changed', reason: 'connection-restored' } : { type: 'changed' })
    } catch (error) {
      client.removeAllListeners(); client.close(); tunnel?.close()
      if (generation !== this.generation) return
      this.error = text(error); this.scheduleReconnect(generation)
    }
  }
  private scheduleReconnect(generation: number): void {
    if (this.disposed || generation !== this.generation || this.reconnect) return
    this.status = 'error'; this.error ||= 'Conexão interrompida; tentando reconectar.'; this.changed()
    this.client?.removeAllListeners(); this.client?.close(); this.tunnel?.close()
    this.reconnect = setTimeout(() => { this.reconnect = undefined; void this.connectSelected() }, Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)))
    this.reconnect.unref()
  }
  private async browseLocal(path?: string): Promise<RemoteDirectory> {
    const directory = await fs.realpath(path ? resolve(path) : homedir())
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return { path: directory, parent: dirname(directory), directories: entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).sort((a,b) => a.name.localeCompare(b.name)).slice(0, 1000).map(entry => ({ name: entry.name, path: resolve(directory, entry.name) })) }
  }
  private pickFolder(owner: Electron.WebContents): Promise<string | null> {
    return new Promise(resolve => {
      const id = randomUUID()
      const timer = setTimeout(() => { this.folderRequests.delete(id); resolve(null) }, 300_000)
      this.folderRequests.set(id, { owner: owner.id, resolve, timer })
      owner.send('hosts:folderRequest', id)
    })
  }
  registerIpc(): void {
    const handle = (name: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown) => ipcMain.handle(`hosts:${name}`, (event, ...args) => { const owner = BrowserWindow.fromWebContents(event.sender); if (!owner || owner.isDestroyed()) throw new Error('Janela indisponível.'); return fn(event, ...args as never[]) })
    handle('snapshot', () => this.snapshot()); handle('configure', (_event, input) => this.configure(input))
    handle('add', (_event, input) => this.add(input)); handle('select', (_event, id) => this.select(id)); handle('remove', (_event, id) => this.remove(id))
    handle('copyPairing', () => this.copyPairing()); handle('revoke', () => this.revoke())
    handle('browse', (_event, path) => this.invoke('hosts:browse', [path], () => this.browseLocal(path)))
    handle('resolveFolder', (event, id, path) => { const request = this.folderRequests.get(id); if (!request || request.owner !== event.sender.id) throw new Error('Seleção de pasta expirada.'); if (path !== null && typeof path !== 'string') throw new Error('Pasta inválida.'); clearTimeout(request.timer); this.folderRequests.delete(id); request.resolve(path) })
  }
  async close(): Promise<void> { this.disposed = true; this.disconnect(); for (const request of this.folderRequests.values()) { clearTimeout(request.timer); request.resolve(null) }; this.folderRequests.clear(); await this.server?.close(); this.server = null }
}
const text = (error: unknown): string => error instanceof Error ? error.message : 'Falha na conexão com o host.'
