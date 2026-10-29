// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: unknown) => { handlers.set(channel, handler) },
    removeHandler: (channel: string) => { handlers.delete(channel) },
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() },
}))

vi.mock('./voice', () => ({
  VoiceService: class {
    prewarmTranscription() { return Promise.resolve() }
    close() {}
  },
}))

import { registerV9Ipc } from './ipc'
import type { AppService } from './workspace'

describe('superfície IPC da V9', () => {
  it('não registra nenhum canal de navegador individual e mantém o restante da conversa', () => {
    const service = { on: vi.fn(), off: vi.fn() } as unknown as AppService
    const dispose = registerV9Ipc(service)
    const channels = [...handlers.keys()]
    expect(channels.filter(channel => channel.startsWith('v9:browser'))).toEqual([])
    expect(channels).toContain('v9:snapshot')
    expect(channels).toContain('v9:openFolder')
    expect(channels).toContain('v9:externalBrowserStatus')
    expect(channels).toContain('v9:setExternalBrowserGrant')
    dispose()
    expect(handlers.has('v9:snapshot')).toBe(false)
    expect(handlers.has('v9:externalBrowserStatus')).toBe(false)
    expect(handlers.has('v9:setExternalBrowserGrant')).toBe(false)
  })
  it('respondApproval do host remoto/PWA é marcado como remoto; a janela local não', async () => {
    const respondApproval = vi.fn(async () => undefined)
    const service = { on: vi.fn(), off: vi.fn(), respondApproval } as unknown as AppService
    const remote = new Map<string, (...args: unknown[]) => unknown>()
    const routing = { remote: false, register: (method: string, handler: (...args: unknown[]) => unknown) => { remote.set(method, handler) }, invoke: (_m: string, _a: unknown[], local: () => unknown) => local(), publish: () => true }
    const dispose = registerV9Ipc(service, routing as never)
    await remote.get('v9:respondApproval')!('id', true)
    expect(respondApproval).toHaveBeenLastCalledWith('id', true, true)
    const sender = {}
    const { BrowserWindow } = await import('electron')
    vi.spyOn(BrowserWindow, 'fromWebContents' as never).mockReturnValue({ isDestroyed: () => false } as never)
    await (handlers.get('v9:respondApproval') as (...args: unknown[]) => unknown)({ sender }, 'id', true)
    expect(respondApproval).toHaveBeenLastCalledWith('id', true)
    dispose()
  })
  it('reviewPlan também identifica a origem remota sem mudar o IPC local', async () => {
    const reviewPlan = vi.fn(async () => undefined)
    const service = { on: vi.fn(), off: vi.fn(), reviewPlan } as unknown as AppService
    const remote = new Map<string, (...args: unknown[]) => unknown>()
    const routing = { remote: false, register: (method: string, handler: (...args: unknown[]) => unknown) => { remote.set(method, handler) }, invoke: (_m: string, _a: unknown[], local: () => unknown) => local(), publish: () => true }
    const dispose = registerV9Ipc(service, routing as never)
    await remote.get('v9:reviewPlan')!('id', 'request_changes', 'Inclua testes.')
    expect(reviewPlan).toHaveBeenLastCalledWith('id', 'request_changes', 'Inclua testes.', true)
    const sender = {}
    const { BrowserWindow } = await import('electron')
    vi.spyOn(BrowserWindow, 'fromWebContents' as never).mockReturnValue({ isDestroyed: () => false } as never)
    await (handlers.get('v9:reviewPlan') as (...args: unknown[]) => unknown)({ sender }, 'id', 'approve')
    expect(reviewPlan).toHaveBeenLastCalledWith('id', 'approve', undefined)
    dispose()
  })
})
