// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const ui = vi.hoisted(() => ({ send: vi.fn(), reload: vi.fn(), clipboard: '', secure: true }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: ui.send, reload: ui.reload } }] },
  clipboard: { writeText: (text: string) => { ui.clipboard = text } }, ipcMain: { handle: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => ui.secure, encryptString: (text: string) => Buffer.from(text), decryptString: (text: Buffer) => text.toString() },
}))
import { HostManager } from './manager'
import { HostStore } from './secure-store'
import { createIdentity, defaultSettings, validateStoredData, type HostsData } from './identity'
const managers: HostManager[] = []
afterEach(async () => { for (const manager of managers.splice(0)) await manager.close(); vi.clearAllMocks(); ui.secure = true; ui.clipboard = '' })
function setup(name: string) {
  let data: HostsData = { identity: createIdentity(name), hosts: [], selectedId: 'local', settings: { ...defaultSettings } }
  const store = { load: async () => structuredClone(data), save: vi.fn(async (next: HostsData) => { data = structuredClone(next) }) }
  const manager = new HostManager(store); managers.push(manager)
  return { manager, store }
}
it('inicia sem listener e sem exigir criptografia se não existem hosts salvos', async () => {
  ui.secure = false
  const root = await mkdtemp(join(tmpdir(), 'boobot-host-store-')), store = new HostStore(root)
  expect((await store.load()).settings.enabled).toBe(false)
  await expect(store.save(await store.load())).rejects.toThrow('seguro indisponível')
  await expect(readFile(join(root,'hosts.enc'))).rejects.toThrow()
})
it('falha na persistência impede abrir o listener', async () => {
  const { manager, store } = setup('local'); await manager.initialize()
  store.save.mockRejectedValueOnce(new Error('persistência indisponível'))
  await expect(manager.configure({ ...defaultSettings, enabled: true, port: 0 })).rejects.toThrow('persistência')
  expect(manager.snapshot().local.running).toBe(false)
  expect(manager.snapshot().local.enabled).toBe(false)
})
it('roteia RPC para o host escolhido, revoga pareamento e não faz fallback local', async () => {
  const host = setup('PC host').manager, client = setup('PC cliente').manager
  await host.initialize(); await client.initialize()
  host.register('v9:snapshot', () => ({ marker: 'host' })); host.register('providers:list', () => ({ providers: [] }))
  const settings = (await host.configure({ ...defaultSettings, enabled: true, port: 0 })).local
  await host.configure({ ...settings, advertisedUrl: `ws://127.0.0.1:${settings.port}/boobot` })
  await host.copyPairing()
  const entry = await client.add({ pairing: ui.clipboard, name: 'Casa' })
  await client.select(entry.id)
  await vi.waitFor(() => expect(client.snapshot().hosts.find(item => item.id === entry.id)?.status).toBe('connected'))
  const hostEvents = () => ui.send.mock.calls.filter(([channel]) => channel === 'v9:event').map(([, event]) => event as { type: string; reason?: string })
  expect(hostEvents().some(event => event.reason === 'connection-restored')).toBe(false)
  const internals = client as unknown as { generation: number; scheduleReconnect(generation: number): void }
  internals.scheduleReconnect(internals.generation)
  await vi.waitFor(() => expect(hostEvents().some(event => event.reason === 'connection-restored')).toBe(true), { timeout: 5000 })
  const local = vi.fn(() => 'local')
  expect(await client.invoke('v9:snapshot', [], local)).toEqual({ marker: 'host' }); expect(local).not.toHaveBeenCalled()
  expect(() => client.invoke('v9:voiceSpeak', ['oi'], local)).toThrow('host')
  expect(JSON.stringify(client.snapshot())).not.toContain('secretKey')
  const link = ui.clipboard
  await host.revoke()
  await vi.waitFor(() => expect(client.snapshot().hosts.find(item => item.id === entry.id)?.status).not.toBe('connected'))
  expect(() => client.invoke('v9:snapshot', [], local)).toThrow('desconectado'); expect(local).not.toHaveBeenCalled()
  await expect(client.add({ pairing: link, name: 'Revogado' })).rejects.toThrow('autenticar')
  await client.select('local'); expect(client.invoke('v9:snapshot', [], local)).toBe('local')
})
it('preserva dados corrompidos e recusa configuração inválida', async () => {
  expect(() => validateStoredData({ identity: {}, hosts: [] })).toThrow('inválid')
  const { manager } = setup('local'); await manager.initialize()
  await expect(manager.configure({ ...defaultSettings, address: '8.8.8.8' })).rejects.toThrow('inválida')
  await expect(manager.configure({ ...defaultSettings, relayUrl: 'ws://localhost:8888' })).rejects.toThrow('ainda não')
})
