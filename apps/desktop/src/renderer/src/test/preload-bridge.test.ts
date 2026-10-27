import { describe, expect, it, vi } from 'vitest'

const { exposed, invoke } = vi.hoisted(() => ({
  exposed: {} as Record<string, Record<string, unknown>>,
  invoke: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, value: Record<string, unknown>) => { exposed[name] = value } },
  ipcRenderer: { invoke, send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}))

import '../../../preload/index'

describe('ponte exposta ao renderer', () => {
  it('não alcança nenhum canal de navegador individual do agente', async () => {
    const appAPI = exposed.appAPI
    expect(appAPI).toBeTruthy()
    for (const [name, value] of Object.entries(appAPI)) {
      if (typeof value !== 'function' || name === 'onEvent') continue
      await (value as (...args: unknown[]) => unknown)()
    }
    const channels = invoke.mock.calls.map(call => String(call[0]))
    expect(channels.filter(channel => channel.startsWith('v9:browser'))).toEqual([])
    expect(channels).toContain('v9:openFolder')
  })

  it('mantém o navegador compartilhado da plataforma disponível', async () => {
    const platform = exposed.platformBrowserAPI
    expect(platform).toBeTruthy()
    await (platform.navigate as (url: string) => unknown)('https://example.com/')
    expect(invoke).toHaveBeenCalledWith('platformBrowser:navigate', 'https://example.com/')
  })
})
