import { describe, expect, it, vi } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { BrowserService } from './browser'

describe('inicialização concorrente do navegador', () => {
  it('compartilha uma única inicialização Chromium entre agentes', async () => {
    const service = new BrowserService()
    const browser = { isConnected: () => true, close: vi.fn(async () => {}) } as unknown as Browser
    let launch!: (browser: Browser) => void
    const pending = new Promise<Browser>(resolve => { launch = resolve })
    const spy = vi.spyOn(chromium, 'launch').mockReturnValue(pending)
    try {
      const internal = service as unknown as { getBrowser(): Promise<Browser> }
      const first = internal.getBrowser(), second = internal.getBrowser()
      launch(browser)
      await expect(first).resolves.toBe(browser)
      await expect(second).resolves.toBe(browser)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore(); await service.close() }
  })
})
