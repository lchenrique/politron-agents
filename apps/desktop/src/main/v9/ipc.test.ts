// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: unknown) => { handlers.set(channel, handler) },
    removeHandler: (channel: string) => { handlers.delete(channel) },
  },
  BrowserWindow: { getAllWindows: () => [] },
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
})
